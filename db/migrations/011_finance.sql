-- 011_finance.sql
-- Invoices (sales, supply, freight) and their lines, payments, expenses.
-- Depends on: 002 (organizations), 003 (contacts), 004 (items), 006 (orders, purchase_orders), 009 (dispatches, trips).
-- RLS: invoices, invoice_lines and payments are two-party tables (013); expenses are per org.
-- An offline supplier's bill is an expenses row (category 'supplier_bill'); see the note in backend plan §5.11.

create table invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null,
  kind text not null check (kind in ('sales','supply','freight')),
  seller_org_id uuid not null references organizations(id),
  buyer_org_id uuid references organizations(id),
  buyer_contact_id uuid references contacts(id),
  order_id uuid references orders(id),
  po_id uuid references purchase_orders(id),
  dispatch_id uuid references dispatches(id),
  trip_id uuid references trips(id),
  invoice_date date not null default current_date, due_date date not null,
  subtotal numeric(14,2) not null, tax numeric(14,2) not null default 0, total numeric(14,2) not null,
  paid_amount numeric(14,2) not null default 0 check (paid_amount >= 0 and paid_amount <= total),
  status text not null default 'unpaid' check (status in ('draft','unpaid','partial','paid','cancelled')),
  pdf_path text,
  created_at timestamptz not null default now(), created_by uuid,
  unique (seller_org_id, invoice_no),
  check (buyer_org_id is not null or buyer_contact_id is not null)
);
create index invoices_seller_idx on invoices(seller_org_id, status);
create index invoices_buyer_idx on invoices(buyer_org_id, status);
create index invoices_order_idx on invoices(order_id);
create index invoices_due_idx on invoices(seller_org_id, due_date) where status in ('unpaid','partial');
-- one live sales invoice per dispatch: confirming twice (or a retry) cannot bill the same rolls again
create unique index invoices_one_sales_per_dispatch on invoices(dispatch_id) where kind = 'sales' and status <> 'cancelled';

create table invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  seller_org_id uuid not null, buyer_org_id uuid,
  item_id uuid references items(id), description text not null,
  qty numeric(14,3) not null, uom text not null, rate numeric(14,4) not null,
  tax_pct numeric(5,2) not null default 5, amount numeric(14,2) not null
);
create index invoice_lines_invoice_idx on invoice_lines(invoice_id);

create table payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id),
  seller_org_id uuid not null, buyer_org_id uuid,
  amount numeric(14,2) not null check (amount > 0),
  mode text not null check (mode in ('bank','upi','cheque','cash')),
  ref_no text, paid_at date not null default current_date,
  recorded_by_org_id uuid not null,
  created_at timestamptz not null default now(), created_by uuid
);
create index payments_invoice_idx on payments(invoice_id);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  category text not null check (category in ('power','maintenance','rent','salary_staff','supplier_bill','other')),
  amount numeric(14,2) not null check (amount > 0), date date not null, note text,
  paid boolean not null default false,
  created_at timestamptz not null default now(), created_by uuid
);
create index expenses_date_idx on expenses(org_id, date);
