-- 005: stock ledger, lots, reservations, GRNs, adjustments
create table stock_lots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  item_id uuid not null references items(id),
  warehouse_id uuid references warehouses(id),
  lot_no text not null,
  unit_cost numeric(14,4) not null default 0,
  supplier_org_id uuid references organizations(id),
  supplier_contact_id uuid references contacts(id),
  receipt_id uuid,
  dye_batch text,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(), created_by uuid,
  unique (org_id, item_id, lot_no)
);

create table stock_movements (           -- ledger: balance = SUM(qty) with sign by type
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  item_id uuid not null references items(id),
  lot_id uuid references stock_lots(id),
  type text not null check (type in ('in','out','consume','produce','adjust','return','scrap')),
  qty numeric(14,3) not null,            -- signed: +in/+produce, -out/-consume, +/- adjust
  ref_type text, ref_id uuid,            -- 'grn','work_order','dispatch','adjustment'
  reason text,
  created_at timestamptz not null default now(), created_by uuid
);
create index on stock_movements(org_id, item_id);
create index on stock_movements(org_id, lot_id);

create table reservations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  item_id uuid not null references items(id),
  lot_id uuid references stock_lots(id),
  order_id uuid not null,                -- fk added in 006
  qty numeric(14,3) not null check (qty > 0),
  status text not null default 'active' check (status in ('active','consumed','released')),
  created_at timestamptz not null default now(), created_by uuid
);
create index on reservations(org_id, order_id);
create index on reservations(org_id, item_id) where status = 'active';

create table goods_receipts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  grn_no text not null,
  supplier_org_id uuid references organizations(id),
  supplier_contact_id uuid references contacts(id),
  po_id uuid, dispatch_id uuid, gate_entry_id uuid,
  vehicle_no text,
  notes text,
  status text not null default 'draft' check (status in ('draft','posted','cancelled')),
  posted_at timestamptz,
  created_at timestamptz not null default now(), created_by uuid,
  unique (org_id, grn_no)
);

create table receipt_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  receipt_id uuid not null references goods_receipts(id) on delete cascade,
  item_id uuid not null references items(id),
  lot_no text not null,
  warehouse_id uuid references warehouses(id),
  po_line_id uuid,
  expected_qty numeric(14,3), received_qty numeric(14,3) not null check (received_qty >= 0),
  rate numeric(14,4) not null default 0,
  dye_batch text,
  for_order_id uuid
);

-- stock count corrections: requested with stock.adjust, approved with stock.adjust_approve
create table stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  adj_no text not null,
  item_id uuid not null references items(id),
  lot_id uuid references stock_lots(id),
  qty numeric(14,3) not null check (qty <> 0),   -- signed delta
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  approved_by uuid, decided_at timestamptz,
  created_at timestamptz not null default now(), created_by uuid,
  unique (org_id, adj_no)
);
