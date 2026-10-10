import { Tag } from 'antd';
import CrudPage, { yesNo } from '@/components/CrudPage';
import { money } from '@/lib/format';
import { useSession } from '@/context/Session';

const UOMS = ['kg', 'm', 'roll', 'pcs', 'litre'].map((v) => ({ value: v, label: v }));
const KINDS = ['fibre', 'yarn', 'grey_fabric', 'finished_fabric', 'garment', 'dye', 'chemical', 'accessory', 'packing', 'scrap']
  .map((v) => ({ value: v, label: v.replaceAll('_', ' ') }));

/** buyers and suppliers: plain contacts, they do not log in */
export function Contacts() {
  return (
    <CrudPage
      eyebrow="MASTER DATA" title="Buyers & suppliers" description="Who the mill sells to and buys from. Used on orders, goods receipts and invoices."
      noun="contact" path="/contacts" updateMethod="PUT" search
      perms={{ create: 'contacts.create', update: 'contacts.update', remove: 'contacts.delete' }}
      columns={[
        { title: 'Name', dataIndex: 'name', render: (v) => <strong>{v}</strong> },
        { title: 'Type', dataIndex: 'type', render: (v) => <Tag color={v === 'buyer' ? 'blue' : 'purple'}>{v}</Tag> },
        { title: 'Phone', dataIndex: 'phone' }, { title: 'City', dataIndex: 'city' }, { title: 'GSTIN', dataIndex: 'gstin' },
      ]}
      fields={[
        { name: 'type', label: 'Type', type: 'select', required: true, initial: 'buyer', options: [{ value: 'buyer', label: 'Buyer' }, { value: 'supplier', label: 'Supplier' }] },
        { name: 'name', label: 'Name', required: true },
        { name: 'phone', label: 'Phone' }, { name: 'email', label: 'Email' }, { name: 'gstin', label: 'GSTIN' },
        { name: 'address', label: 'Address', type: 'textarea' }, { name: 'city', label: 'City' },
      ]}
    />
  );
}

/** yarn, fabric, dyes ... PUT replaces defaults, so every field with a default is always sent */
export function Items() {
  const session = useSession();
  return (
    <CrudPage
      eyebrow="MASTER DATA" title="Items" description="Fibre, yarn, grey and finished fabric, dyes and packing material. Reorder levels drive the low-stock alert."
      noun="item" path="/items" updateMethod="PUT" search
      perms={{ create: 'items.create', update: 'items.update', remove: 'items.delete' }}
      columns={[
        { title: 'Name', dataIndex: 'name', render: (v) => <strong>{v}</strong> },
        { title: 'Kind', dataIndex: 'kind', render: (v) => v?.replaceAll('_', ' ') },
        { title: 'Colour', dataIndex: 'colour' }, { title: 'Unit', dataIndex: 'uom', width: 70 },
        { title: 'Reorder at', dataIndex: 'reorder_level', align: 'right' },
        ...(session.can('orders.view_price') ? [{ title: 'Std rate', dataIndex: 'std_rate', align: 'right', render: money }] : []),
        { title: 'Active', dataIndex: 'active', render: yesNo },
      ]}
      fields={[
        { name: 'kind', label: 'Kind', type: 'select', required: true, options: KINDS },
        { name: 'name', label: 'Name', required: true }, { name: 'sku', label: 'Code / SKU' }, { name: 'colour', label: 'Colour' },
        { name: 'uom', label: 'Unit', type: 'select', required: true, options: UOMS, initial: 'kg' },
        { name: 'yarn_count_ne', label: 'Yarn count (Ne)', type: 'number' }, { name: 'gsm', label: 'GSM', type: 'number' },
        { name: 'width_m', label: 'Width (m)', type: 'number', step: 0.01 }, { name: 'roll_length_m', label: 'Roll length (m)', type: 'number' },
        { name: 'reorder_level', label: 'Reorder level', type: 'number', min: 0, initial: 0 },
        { name: 'std_rate', label: 'Standard rate (INR)', type: 'number', min: 0, initial: 0 },
        { name: 'preferred_supplier_contact_id', label: 'Preferred supplier', from: { path: '/contacts', params: { type: 'supplier' } } },
        { name: 'active', label: 'Active', type: 'switch', initial: true },
      ]}
      body={(v) => ({ ...Object.fromEntries(Object.entries(v).filter(([, x]) => x !== '' && x !== undefined && x !== null)), reorder_level: v.reorder_level ?? 0, std_rate: v.std_rate ?? 0, active: v.active ?? true })}
    />
  );
}

export function Machines() {
  return (
    <CrudPage
      eyebrow="MASTER DATA" title="Machines" description="The looms, spinning frames and other machines on the floor. Status changes only through work orders and breakdowns."
      noun="machine" path="/machines"
      perms={{ create: 'machines.create', update: 'machines.update', remove: 'machines.delete' }}
      columns={[
        { title: 'Code', dataIndex: 'code', render: (v) => <strong>{v}</strong> }, { title: 'Name', dataIndex: 'name' }, { title: 'Stage', dataIndex: 'stage' },
        { title: 'Capacity / hour', render: (_, r) => `${r.capacity_per_hour} ${r.capacity_uom}` },
        { title: 'Overhead / hour', dataIndex: 'hourly_overhead', align: 'right', render: money },
        { title: 'Status', dataIndex: 'status', render: (v) => <Tag color={v === 'running' ? 'green' : v === 'idle' ? 'default' : 'red'}>{v}</Tag> },
        { title: 'Active', dataIndex: 'active', render: yesNo },
      ]}
      fields={[
        { name: 'code', label: 'Code', required: true, help: 'Letters, digits and - only, e.g. W-3' }, { name: 'name', label: 'Name' },
        { name: 'stage_id', label: 'Stage', required: true, from: { path: '/stages' } },
        { name: 'capacity_per_hour', label: 'Capacity per hour', type: 'number', required: true, min: 0 },
        { name: 'capacity_uom', label: 'Capacity unit', type: 'select', required: true, options: UOMS, initial: 'm' },
        { name: 'hourly_overhead', label: 'Overhead per hour (INR)', type: 'number', min: 0, initial: 0 },
        { name: 'active', label: 'Active', type: 'switch', initial: true },
      ]}
    />
  );
}

export function Workers() {
  const session = useSession();
  return (
    <CrudPage
      eyebrow="WORKFORCE" title="Workers" description="Everyone on the payroll. Attendance and wages are worked out from these records."
      noun="worker" path="/workers" search
      perms={{ create: 'workers.create', update: 'workers.update', remove: 'workers.delete' }}
      columns={[
        { title: 'Code', dataIndex: 'emp_code', width: 90 }, { title: 'Name', dataIndex: 'name', render: (v) => <strong>{v}</strong> },
        { title: 'Skill', dataIndex: 'skill' }, { title: 'Stage', dataIndex: 'stage' }, { title: 'Shift', dataIndex: 'shift' },
        { title: 'Wage', dataIndex: 'wage_type', render: (v, r) => (session.can('wages.view') || session.can('workers.update') ? `${v} · ${money(r.rate)}` : v) },
        { title: 'Active', dataIndex: 'active', render: yesNo },
      ]}
      fields={[
        { name: 'emp_code', label: 'Employee code', required: true, help: 'Letters, digits and - only' }, { name: 'name', label: 'Name', required: true },
        { name: 'phone', label: 'Phone' }, { name: 'skill', label: 'Skill' },
        { name: 'stage_id', label: 'Stage', from: { path: '/stages' } }, { name: 'default_shift_id', label: 'Default shift', from: { path: '/shifts' } },
        { name: 'employment_type', label: 'Employment', type: 'select', initial: 'permanent', options: [{ value: 'permanent', label: 'Permanent' }, { value: 'contract', label: 'Contract' }] },
        { name: 'wage_type', label: 'Wage type', type: 'select', required: true, initial: 'daily', options: [{ value: 'daily', label: 'Daily' }, { value: 'hourly', label: 'Hourly' }, { value: 'piece', label: 'Piece rate' }] },
        { name: 'rate', label: 'Rate (per day or hour, INR)', type: 'number', min: 0, initial: 0 },
        { name: 'ot_rate', label: 'Overtime rate (per hour, INR)', type: 'number', min: 0, initial: 0 },
        { name: 'piece_rate', label: 'Piece rate (INR)', type: 'number', min: 0, initial: 0 },
        { name: 'active', label: 'Active', type: 'switch', initial: true },
      ]}
    />
  );
}

