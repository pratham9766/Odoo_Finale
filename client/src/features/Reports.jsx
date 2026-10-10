import { useState } from 'react';
import { Button, Descriptions, Input, Select, Space, Table, Tabs } from 'antd';
import { NoData, PageTitle, QueryState } from '@/components/States';
import { useSession } from '@/context/Session';
import { monthISO, qs, todayISO, useGet } from '@/lib/hooks';
import { money, quantity } from '@/lib/format';

// money columns are shown as rupees; everything else numeric as a plain number
const MONEY = /revenue|material|labour|machine_cost|overhead|wages|expenses|profit|cost|gross|net|deductions|amount|rate/i;
const isNumber = (v) => typeof v === 'number' || (typeof v === 'string' && v !== '' && !Number.isNaN(Number(v)) && /^-?\d+(\.\d+)?$/.test(v));

const REPORTS = [
  { name: 'order-cost', title: 'Cost per order', permission: 'reports.cost', kind: 'range', description: 'Revenue, material, labour and machine cost for each order, and the margin.' },
  { name: 'pnl', title: 'Monthly profit & loss', permission: 'reports.pnl', kind: 'month', description: 'Revenue against material, wages, overhead and expenses, month by month.' },
  { name: 'machines', title: 'Machine production', permission: 'reports.production', kind: 'range', description: 'Output, running and breakdown hours and utilisation for every machine.' },
  { name: 'wastage', title: 'Wastage', permission: 'reports.production', kind: 'range', groups: [['stage', 'By stage'], ['machine', 'By machine'], ['order', 'By order']], description: 'Material lost in production.' },
  { name: 'qc', title: 'Defects by machine', permission: 'reports.qc', kind: 'range', description: 'Where the defects come from.' },
  { name: 'attendance', title: 'Attendance', permission: 'reports.attendance', kind: 'month', groups: [['shift', 'By shift'], ['stage', 'By stage']], description: 'Attendance totals for a month.' },
  { name: 'wages', title: 'Wages', permission: 'wages.view', kind: 'month', description: 'What each worker is paid for a month, with totals.' },
];

const cell = (key, v) => {
  if (v === null || v === undefined || v === '') return '–';
  if (isNumber(v)) return MONEY.test(key) && !/hours|qty|output|pct|days|rolls|count/i.test(key) ? money(v) : /pct/i.test(key) ? `${v}%` : quantity(v);
  if (/^\d{4}-\d{2}-\d{2}T/.test(String(v))) return String(v).slice(0, 10);
  return String(v);
};

function ReportView({ report }) {
  const session = useSession();
  const [from, setFrom] = useState(`${monthISO()}-01`);
  const [to, setTo] = useState(todayISO());
  const [month, setMonth] = useState(monthISO());
  const [group, setGroup] = useState(report.groups?.[0]?.[0]);
  const params = { ...(report.kind === 'range' ? { from, to } : { month }), ...(group ? { group } : {}) };
  const q = useGet(`/reports/${report.name}`, params);
  const data = q.payload;
  const columns = (data?.columns || []).map((c) => ({ title: c.label, dataIndex: c.key, key: c.key, align: (data.rows || []).some((r) => isNumber(r[c.key])) ? 'right' : 'left', render: (v) => cell(c.key, v) }));
  const totals = data?.totals;

  return (
    <>
      <p style={{ color: '#58637e' }}>{report.description}</p>
      <Space wrap style={{ marginBottom: 12 }}>
        {report.kind === 'range'
          ? <><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} /><span>to</span><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} /></>
          : <Input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} style={{ width: 160 }} />}
        {report.groups && <Select value={group} onChange={setGroup} style={{ width: 160 }} options={report.groups.map(([value, label]) => ({ value, label }))} />}
        <Button onClick={() => session.download(`/reports/${report.name}/export.csv${qs(params)}`, `${report.name}.csv`).catch(() => {})}>Download CSV</Button>
      </Space>
      <QueryState query={q}>
        {data?.statement && (
          <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }} style={{ marginBottom: 16 }}
            items={Object.entries(data.statement).filter(([, v]) => isNumber(v)).map(([k, v]) => ({ key: k, label: k.replaceAll('_', ' '), children: money(v) }))} />
        )}
        <Table rowKey={(r, i) => r.id || r.key || r.name || r.order_no || r.code || r.month || i} size="middle" columns={columns} dataSource={data?.rows || []} scroll={{ x: 'max-content' }} pagination={{ pageSize: 25, hideOnSinglePage: true }}
          locale={{ emptyText: <NoData description="No data for this period." /> }}
          summary={totals ? () => (
            <Table.Summary.Row>
              {columns.map((c, i) => <Table.Summary.Cell key={c.key} index={i} align={c.align}>{i === 0 ? <strong>Total</strong> : totals[c.key] !== undefined ? <strong>{cell(c.key, totals[c.key])}</strong> : ''}</Table.Summary.Cell>)}
            </Table.Summary.Row>
          ) : undefined} />
      </QueryState>
    </>
  );
}

export default function Reports() {
  const session = useSession();
  const allowed = REPORTS.filter((r) => session.can(r.permission));
  return (
    <>
      <PageTitle eyebrow="OWNER" title="Reports" description="Cost per order, production per machine, wages and profit. Every table can be downloaded as CSV." />
      <section className="panel">
        {allowed.length === 0 ? <NoData description="Your role has no report permissions." /> : <Tabs destroyInactiveTabPane items={allowed.map((r) => ({ key: r.name, label: r.title, children: <ReportView report={r} /> }))} />}
      </section>
    </>
  );
}
