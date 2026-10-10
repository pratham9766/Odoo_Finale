-- 004: items + BOMs
create table items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  kind text not null check (kind in ('fibre','yarn','grey_fabric','finished_fabric','garment',
                                     'dye','chemical','accessory','packing','scrap')),
  name text not null, sku text,
  colour text, composition text,
  yarn_count_ne numeric(6,2),              -- yarn
  gsm numeric(7,2), width_m numeric(6,3),  -- fabric
  roll_length_m numeric(8,2),
  uom text not null check (uom in ('kg','m','roll','pcs','litre')),
  reorder_level numeric(14,3) not null default 0,
  std_rate numeric(14,2) not null default 0,
  sellable boolean not null default false,  -- shown to connected buyers in /partners/:orgId/catalog
  preferred_supplier_org_id uuid references organizations(id),
  preferred_supplier_contact_id uuid references contacts(id),
  active boolean not null default true,
  created_at timestamptz not null default now(), created_by uuid,
  unique (org_id, sku)
);

create table boms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  output_item_id uuid not null references items(id),
  output_qty numeric(14,3) not null default 1 check (output_qty > 0),   -- in the output item's uom
  stage_id uuid references stages(id),           -- null for garment cutting (buyer side)
  version int not null default 1,
  is_default boolean not null default true,
  notes text,
  created_at timestamptz not null default now(), created_by uuid
);
create unique index boms_one_default on boms(org_id, output_item_id) where is_default;

create table bom_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  bom_id uuid not null references boms(id) on delete cascade,
  component_item_id uuid not null references items(id),
  qty numeric(14,5) not null check (qty > 0),     -- in the component's uom per bom.output_qty
  wastage_pct numeric(5,2) not null default 0 check (wastage_pct >= 0 and wastage_pct < 100),
  share_label text                                -- 'warp' | 'weft' | null
);
create index on bom_lines(bom_id);
