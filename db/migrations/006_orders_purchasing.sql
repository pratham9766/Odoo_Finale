-- 006: buyer orders + purchase orders to suppliers
create table orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique,
  buyer_contact_id uuid not null references contacts(id),
  buyer_ref text,                                          -- buyer's own PO / reference
  order_date date not null default current_date,
  deadline date not null,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'draft' check (status in (
    'draft','confirmed','waiting_material','material_ready','in_production','in_qc','ready_to_ship',
    'partially_dispatched','dispatched','delivered','closed','cancelled')),
  progress_pct numeric(5,2) not null default 0,
  current_stage text,
  expected_completion date,
  risk text check (risk in ('green','amber','red')),
  delivery_address text,
  tracking_token text unique,
  notes text,
  confirmed_at timestamptz, cancelled_at timestamptz, cancel_reason text,
  created_at timestamptz not null default now(), created_by uuid
);
create index on orders(status);

create table order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  item_id uuid not null references items(id),
  description text, colour text,
  qty numeric(14,3) not null check (qty > 0), uom text not null,
  rate numeric(14,2) not null default 0
);
create index on order_lines(order_id);

create table order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  event text not null,                 -- 'confirmed','material_ready','stage_started', ...
  visible_to_buyer boolean not null default true,   -- shown on the public tracking link
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), created_by uuid
);
create index on order_events(order_id);

alter table reservations add constraint reservations_order_fk foreign key (order_id) references orders(id);
alter table receipt_lines add constraint receipt_lines_order_fk foreign key (for_order_id) references orders(id);

create table purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_no text not null unique,
  supplier_contact_id uuid not null references contacts(id),
  for_order_id uuid references orders(id),
  need_by date, promise_date date,
  status text not null default 'draft'
    check (status in ('draft','sent','accepted','partially_accepted','rejected','received','closed','cancelled')),
  approved_by uuid, approved_at timestamptz,
  sent_at timestamptz, responded_at timestamptz, response_note text,
  notes text,
  created_at timestamptz not null default now(), created_by uuid
);

create table po_lines (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references purchase_orders(id) on delete cascade,
  item_id uuid not null references items(id),
  description text,                                         -- item name snapshot
  supplier_item_ref text,
  qty numeric(14,3) not null check (qty > 0), accepted_qty numeric(14,3),
  received_qty numeric(14,3) not null default 0,
  uom text not null, rate numeric(14,4) not null default 0
);
create index on po_lines(po_id);

alter table goods_receipts add constraint goods_receipts_po_fk foreign key (po_id) references purchase_orders(id);
alter table receipt_lines add constraint receipt_lines_po_line_fk foreign key (po_line_id) references po_lines(id);
