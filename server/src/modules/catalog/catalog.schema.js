import { z } from 'zod';
import { pageQuery, zBoolStr } from '../../middleware/validate.js';

const uuid = z.string().uuid();
const KINDS = ['fibre', 'yarn', 'grey_fabric', 'finished_fabric', 'garment', 'dye', 'chemical', 'accessory', 'packing', 'scrap'];
const UOMS = ['kg', 'm', 'roll', 'pcs', 'litre'];
const num = z.number().finite();

export const itemSchema = z.object({
  kind: z.enum(KINDS),
  name: z.string().trim().min(1).max(160),
  sku: z.string().trim().max(60).optional(),
  colour: z.string().trim().max(60).optional(),
  composition: z.string().trim().max(120).optional(),
  yarn_count_ne: num.positive().optional(),
  gsm: num.positive().optional(),
  width_m: num.positive().optional(),
  roll_length_m: num.positive().optional(),
  uom: z.enum(UOMS),
  reorder_level: num.min(0).default(0),
  std_rate: num.min(0).default(0),
  sellable: z.boolean().default(false),
  preferred_supplier_org_id: uuid.nullable().optional(),
  preferred_supplier_contact_id: uuid.nullable().optional(),
  active: z.boolean().default(true),
});
export const itemUpdateSchema = itemSchema.partial();

export const itemQuery = z.object({
  ...pageQuery,
  kind: z.enum(KINDS).optional(),
  q: z.string().trim().max(80).optional(),
  active: zBoolStr,
  sellable: zBoolStr,
});

export const bomSchema = z.object({
  output_item_id: uuid,
  output_qty: num.positive().default(1),
  stage_id: uuid.nullable().optional(),
  is_default: z.boolean().default(true),
  notes: z.string().max(500).optional(),
  lines: z.array(z.object({
    component_item_id: uuid,
    qty: num.positive(),
    wastage_pct: num.min(0).lt(100).default(0),
    share_label: z.enum(['warp', 'weft']).nullable().optional(),
  })).min(1),
});
export const bomUpdateSchema = bomSchema.omit({ output_item_id: true }).partial();

export const bomQuery = z.object({ ...pageQuery, item_id: uuid.optional() });

export const explodeQuery = z.object({
  item_id: uuid,
  qty: z.coerce.number().positive(),
  net_stock: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
});

const n = () => z.number().finite().positive();
export const convertSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('fabric_m_to_kg'), m: n(), width_m: n(), gsm: n() }),
  z.object({ op: z.literal('fabric_kg_to_m'), kg: n(), width_m: n(), gsm: n() }),
  z.object({ op: z.literal('yarn_m_per_kg'), ne: n() }),
  z.object({ op: z.literal('yarn_kg_to_m'), kg: n(), ne: n() }),
  z.object({ op: z.literal('yarn_m_to_kg'), m: n(), ne: n() }),
  z.object({ op: z.literal('dye_kg'), fabric_kg: n(), shade_pct: n() }),
  z.object({ op: z.literal('rolls_to_m'), rolls: n(), roll_length_m: n() }),
  z.object({ op: z.literal('m_to_rolls'), m: n(), roll_length_m: n() }),
  z.object({ op: z.literal('warp_weft'), yarn_kg: n(), warp_pct: z.number().min(0).max(100) }),
  z.object({ op: z.literal('gross_up'), output: n(), wastage_pct: z.number().min(0).lt(100) }),
]);
