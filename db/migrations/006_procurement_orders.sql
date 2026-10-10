-- 006: sales orders + purchase orders (shared tables carry both party columns)
create table orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null,
  seller_org_id uuid not null references organizations(id),
  buyer_org_id uuid references organizations(id),          -- null for an offline buyer
  buyer_contact_id uuid references contacts(id),
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
  created_at timestamptz not null default now(), created_by uuid,
  unique (seller_org_id, order_no),
  check (buyer_org_id is not null or buyer_contact_id is not null)
);
create index on orders(seller_org_id, status);
create index on orders(buyer_org_id);

create table order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  seller_org_id uuid not null, buyer_org_id uuid,           -- copied from parent for RLS
  item_id uuid not null references items(id),              -- seller's fabric item
  description text, colour text,
  qty numeric(14,3) not null check (qty > 0), uom text not null,
  rate numeric(14,2) not null default 0
);
create index on order_lines(order_id);

create table order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  seller_org_id uuid not null, buyer_org_id uuid,
  event text not null,                 -- 'confirmed','material_ready','stage_started', ...
  visible_to_buyer boolean not null default true,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), created_by uuid
);
create index on order_events(order_id);

alter table reservations add constraint reservations_order_fk foreign key (order_id) references orders(id);
alter table receipt_lines add constraint receipt_lines_order_fk foreign key (for_order_id) references orders(id);

create table purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_no text not null,
  buyer_org_id uuid not null references organizations(id),   -- the mill
  supplier_org_id uuid references organizations(id),          -- null for offline supplier
  supplier_contact_id uuid references contacts(id),
  for_order_id uuid references orders(id),
  need_by date, promise_date date,
  status text not null default 'draft'
    check (status in ('draft','sent','accepted','partially_accepted','rejected','dispatched','received','closed','cancelled')),
  approved_by uuid, approved_at timestamptz,
  sent_at timestamptz, responded_at timestamptz, response_note text,
  notes text,
  created_at timestamptz not null default now(), created_by uuid,
  unique (buyer_org_id, po_no),
  check (supplier_org_id is not null or supplier_contact_id is not null)
);
create index on purchase_orders(supplier_org_id);

create table po_lines (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references purchase_orders(id) on delete cascade,
  buyer_org_id uuid not null, supplier_org_id uuid,
  item_id uuid not null references items(id),               -- mill's item
  description text,                                         -- item name snapshot (supplier cannot read mill items)
  supplier_item_ref text,
  qty numeric(14,3) not null check (qty > 0), accepted_qty numeric(14,3),
  received_qty numeric(14,3) not null default 0,
  uom text not null, rate numeric(14,4) not null default 0
);
create index on po_lines(po_id);

alter table goods_receipts add constraint goods_receipts_po_fk foreign key (po_id) references purchase_orders(id);
alter table receipt_lines add constraint receipt_lines_po_line_fk foreign key (po_line_id) references po_lines(id);
