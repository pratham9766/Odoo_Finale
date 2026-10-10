-- 011: sales invoices (made from dispatches) and their lines, buyer payments, expenses.
-- A supplier's bill is an expenses row (category 'supplier_bill'); material cost enters the books when it is consumed.

create table invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null unique,
  buyer_contact_id uuid not null references contacts(id),
  order_id uuid references orders(id),
  dispatch_id uuid references dispatches(id),
  invoice_date date not null default current_date, due_date date not null,
  subtotal numeric(14,2) not null, tax numeric(14,2) not null default 0, total numeric(14,2) not null,
  paid_amount numeric(14,2) not null default 0 check (paid_amount >= 0 and paid_amount <= total),
  status text not null default 'unpaid' check (status in ('draft','unpaid','partial','paid','cancelled')),
  pdf_path text,
  created_at timestamptz not null default now(), created_by uuid
);
create index invoices_status_idx on invoices(status);
create index invoices_order_idx on invoices(order_id);
create index invoices_due_idx on invoices(due_date) where status in ('unpaid','partial');
-- one live invoice per dispatch: confirming twice (or a retry) cannot bill the same rolls again
create unique index invoices_one_per_dispatch on invoices(dispatch_id) where status <> 'cancelled';

create table invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  item_id uuid references items(id), description text not null,
  qty numeric(14,3) not null, uom text not null, rate numeric(14,4) not null,
  tax_pct numeric(5,2) not null default 5, amount numeric(14,2) not null
);
create index invoice_lines_invoice_idx on invoice_lines(invoice_id);

create table payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id),
  amount numeric(14,2) not null check (amount > 0),
  mode text not null check (mode in ('bank','upi','cheque','cash')),
  ref_no text, paid_at date not null default current_date,
  created_at timestamptz not null default now(), created_by uuid
);
create index payments_invoice_idx on payments(invoice_id);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('power','maintenance','rent','salary_staff','supplier_bill','other')),
  amount numeric(14,2) not null check (amount > 0), date date not null, note text,
  paid boolean not null default false,
  created_at timestamptz not null default now(), created_by uuid
);
create index expenses_date_idx on expenses(date);
