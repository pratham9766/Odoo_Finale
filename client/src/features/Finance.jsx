// Accounts screen: invoices and payments, receivables and payables, and the expense list.
import { useState } from 'react';
import { Button, Form, Input, InputNumber, Modal, Select, Space, Table, Tabs, Tag } from 'antd';
import CrudPage from '@/components/CrudPage';
import { NoData, PageTitle, QueryState } from '@/components/States';
import { useSession } from '@/context/Session';
import { todayISO, useAction, useGet } from '@/lib/hooks';
import { date, money } from '@/lib/format';

const INVOICE_COLOR = { draft: 'default', unpaid: 'red', partial: 'orange', paid: 'green', cancelled: 'default' };
const CATEGORIES = ['power', 'maintenance', 'rent', 'salary_staff', 'supplier_bill', 'freight', 'other'].map((v) => ({ value: v, label: v.replaceAll('_', ' ') }));

function RecordPayment({ invoice, onClose }) {
  const act = useAction({ success: 'Payment recorded' });
  const [form] = Form.useForm();
  if (!invoice) return null;
  return (
    <Modal title={`Record payment for ${invoice.invoice_no}`} open onCancel={onClose} onOk={() => form.submit()} confirmLoading={act.isPending} destroyOnClose>
      <p>Outstanding: <strong>{money(invoice.outstanding)}</strong></p>
      <Form form={form} layout="vertical" requiredMark={false} initialValues={{ amount: Number(invoice.outstanding), mode: 'bank', paid_at: todayISO() }}
        onFinish={(v) => act.mutate({ path: '/payments', body: { invoice_id: invoice.id, amount: v.amount, mode: v.mode, ...(v.ref_no ? { ref_no: v.ref_no } : {}), paid_at: v.paid_at } }, { onSuccess: onClose })}>
        <Form.Item name="amount" label="Amount (INR)" rules={[{ required: true }]}><InputNumber min={0.01} max={Number(invoice.outstanding)} style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="mode" label="Paid by"><Select options={['bank', 'upi', 'cheque', 'cash'].map((v) => ({ value: v, label: v }))} /></Form.Item>
        <Form.Item name="ref_no" label="Reference (cheque / UTR number)"><Input /></Form.Item>
        <Form.Item name="paid_at" label="Date"><Input type="date" max={todayISO()} /></Form.Item>
      </Form>
    </Modal>
  );
}

function Invoices() {
  const session = useSession();
  const [status, setStatus] = useState();
  const [paying, setPaying] = useState(null);
  const list = useGet('/invoices', { limit: 100, status });
  return (
    <>
      <Select allowClear placeholder="All invoices" value={status} onChange={setStatus} style={{ width: 180, marginBottom: 12 }} options={['unpaid', 'partial', 'paid', 'cancelled'].map((v) => ({ value: v, label: v }))} />
      <QueryState query={list}>
        <Table rowKey="id" size="middle" dataSource={list.payload || []} scroll={{ x: 'max-content' }} pagination={{ pageSize: 20, hideOnSinglePage: true }} locale={{ emptyText: <NoData description="No invoices yet. Confirming a dispatch creates one." /> }}
          columns={[
            { title: 'Invoice', dataIndex: 'invoice_no', render: (v) => <strong>{v}</strong> }, { title: 'Buyer', dataIndex: 'buyer' }, { title: 'Order', dataIndex: 'order_no' }, { title: 'Dispatch', dataIndex: 'dispatch_no' },
            { title: 'Total', dataIndex: 'total', align: 'right', render: money }, { title: 'Paid', dataIndex: 'paid_amount', align: 'right', render: money }, { title: 'Outstanding', dataIndex: 'outstanding', align: 'right', render: money },
            { title: 'Due', dataIndex: 'due_date', render: date }, { title: 'Status', dataIndex: 'status', render: (v) => <Tag color={INVOICE_COLOR[v]}>{v}</Tag> },
            { title: '', key: 'a', render: (_, r) => (
              <Space>
                <Button size="small" onClick={() => session.download(`/invoices/${r.id}/pdf`, `${r.invoice_no}.pdf`)}>PDF</Button>
                {session.can('payment.create') && ['unpaid', 'partial'].includes(r.status) && <Button size="small" type="primary" onClick={() => setPaying(r)}>Record payment</Button>}
              </Space>) },
          ]} />
      </QueryState>
      <RecordPayment invoice={paying} onClose={() => setPaying(null)} />
    </>
  );
}

function Payments() {
  const list = useGet('/payments', { limit: 100 });
  return (
    <QueryState query={list}>
      <Table rowKey="id" size="middle" dataSource={list.payload || []} scroll={{ x: 'max-content' }} locale={{ emptyText: <NoData description="No payments recorded." /> }}
        columns={[{ title: 'Date', dataIndex: 'paid_at', render: date }, { title: 'Invoice', dataIndex: 'invoice_no' }, { title: 'Buyer', dataIndex: 'counterparty' }, { title: 'Amount', dataIndex: 'amount', align: 'right', render: money }, { title: 'Mode', dataIndex: 'mode' }, { title: 'Reference', dataIndex: 'ref_no' }]} />
    </QueryState>
  );
}

/** who owes us (receivables) or whom we owe (payables), grouped by how late */
function Dues({ kind }) {
  const q = useGet(`/finance/${kind}`);
  const d = q.payload;
  return (
    <QueryState query={q}>
      {d && (
        <>
          <div className="kpi-row">
            <div className="kpi"><span>{kind === 'receivables' ? 'To collect' : 'To pay'}</span><strong>{money(d.kpis.outstanding)}</strong></div>
            <div className="kpi"><span>Overdue</span><strong style={{ color: d.kpis.overdue > 0 ? '#cf1322' : undefined }}>{money(d.kpis.overdue)}</strong></div>
            <div className="kpi"><span>{kind === 'receivables' ? 'Collected' : 'Paid'} this month</span><strong>{money(d.kpis.collected_this_month)}</strong></div>
            {Object.entries(d.ageing).map(([bucket, v]) => <div className="kpi" key={bucket}><span>{bucket} days late</span><strong>{money(v.amount)}</strong><small>{v.count} invoices</small></div>)}
          </div>
          <Table rowKey={(r) => r.invoice_id || r.invoice_no} size="middle" dataSource={d.rows} scroll={{ x: 'max-content' }} locale={{ emptyText: <NoData description="Nothing outstanding." /> }}
            columns={[
              { title: kind === 'receivables' ? 'Invoice' : 'Bill', dataIndex: 'invoice_no' }, { title: kind === 'receivables' ? 'Buyer' : 'Supplier', dataIndex: 'party' },
              { title: 'Total', dataIndex: 'total', align: 'right', render: money }, { title: 'Outstanding', dataIndex: 'outstanding', align: 'right', render: money },
              { title: 'Due', dataIndex: 'due_date', render: date }, { title: 'Days late', dataIndex: 'days_overdue', align: 'right', render: (v) => (v > 0 ? <Tag color="red">{v}</Tag> : '–') },
            ]} />
        </>
      )}
    </QueryState>
  );
}

export default function Finance() {
  const session = useSession();
  return (
    <>
      <PageTitle title="Accounts" description="Invoices made from dispatches, the payments against them, what the mill spends, and who owes whom." />
      <section className="panel">
        <Tabs items={[
          ...(session.can('invoice.view') ? [{ key: 'inv', label: 'Sales invoices', children: <Invoices /> }, { key: 'rec', label: 'Receivables', children: <Dues kind="receivables" /> }] : []),
          ...(session.can('payment.view') || session.can('invoice.view') ? [{ key: 'pay', label: 'Payments', children: <Payments /> }] : []),
          ...(session.can('expense.view') ? [
            {
              key: 'exp', label: 'Expenses & bills',
              children: (
                <CrudPage embedded noun="expense" path="/expenses" perms={{ create: 'expense.create', update: 'expense.update', remove: 'expense.delete' }}
                  columns={[
                    { title: 'Date', dataIndex: 'date', render: date }, { title: 'Category', dataIndex: 'category', render: (v) => <Tag>{v.replaceAll('_', ' ')}</Tag> },
                    { title: 'Note', dataIndex: 'note' }, { title: 'Amount', dataIndex: 'amount', align: 'right', render: money }, { title: 'Paid', dataIndex: 'paid', render: (v) => <Tag color={v ? 'green' : 'red'}>{v ? 'paid' : 'unpaid'}</Tag> },
                  ]}
                  fields={[
                    { name: 'category', label: 'Category', type: 'select', required: true, options: CATEGORIES, help: 'Supplier bills that are unpaid show under Payables.' },
                    { name: 'amount', label: 'Amount (INR)', type: 'number', required: true, min: 0.01 },
                    { name: 'date', label: 'Date', type: 'date', required: true, initial: todayISO() },
                    { name: 'note', label: 'Note' }, { name: 'paid', label: 'Already paid', type: 'switch', initial: true },
                  ]} />
              ),
            },
            { key: 'payb', label: 'Payables', children: <Dues kind="payables" /> },
          ] : []),
        ]} />
      </section>
    </>
  );
}
