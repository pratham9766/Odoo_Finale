// Daily insight rules (§15.4). Rules are plain SQL over the reporting views, run per org as app_user (RLS applies).
// One Gemini call per org rewrites all newly triggered rules into short texts; without an API key the
// template text is kept so the demo still works.
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { register } from './index.js';
import { env } from '../config/env.js';

const inr = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;

// each rule returns [{ key, type, severity, title, body, data, required_permission }]
export const RULES = [
  async function machineDefects(db) {
    const { rows } = await db.query(
      `with m as (select machine_code, sum(defects) as d from v_defects_by_cause
                   where day >= current_date - 14 and machine_code is not null group by 1),
            a as (select avg(d) as avg_d from m)
       select m.machine_code, m.d, a.avg_d from m, a where m.d >= 5 and m.d > 2 * a.avg_d`);
    return rows.map((r) => ({ key: r.machine_code, type: 'machine_defects', severity: 'warning',
      title: `Machine ${r.machine_code} has ${(r.d / r.avg_d).toFixed(1)}× the average defects`,
      body: `${r.d} defects in 14 days vs an average of ${Number(r.avg_d).toFixed(1)} per machine.`,
      data: { machine_code: r.machine_code, defects: r.d }, required_permission: 'reports.qc' }));
  },
  async function supplierDefects(db) {
    const { rows } = await db.query(
      `with s as (select d.supplier_org_id, o.name, sum(d.defects) as d from v_defects_by_cause d
                    left join organizations o on o.id = d.supplier_org_id
                   where d.day >= current_date - 14 and d.supplier_org_id is not null group by 1, 2),
            a as (select avg(d) as avg_d, count(*) as n from s)
       select s.supplier_org_id, s.name, s.d, a.avg_d from s, a where a.n >= 2 and s.d >= 5 and s.d > 2 * a.avg_d`);
    return rows.map((r) => ({ key: r.supplier_org_id, type: 'supplier_defects', severity: 'warning',
      title: `Defects spike on yarn from ${r.name ?? 'a supplier'}`,
      body: `${r.d} defects traced to this supplier's lots in 14 days (average ${Number(r.avg_d).toFixed(1)}).`,
      data: { supplier_org_id: r.supplier_org_id, defects: r.d }, required_permission: 'reports.qc' }));
  },
  async function yarnRunningOut(db) {
    const { rows } = await db.query(
      `select item_id, name, available, uom, days_left from v_stock_days_left
        where kind = 'yarn' and days_left is not null and days_left < 7 order by days_left`);
    return rows.map((r) => ({ key: r.item_id, type: 'stock_runout', severity: r.days_left < 3 ? 'critical' : 'warning',
      title: `${r.name} runs out in about ${Math.max(0, Math.round(r.days_left))} day(s)`,
      body: `${r.available} ${r.uom} available at the current usage rate.`,
      data: { item_id: r.item_id, days_left: r.days_left }, required_permission: 'stock.view' }));
  },
  async function ordersAtRisk(db) {
    const { rows } = await db.query(
      `select order_id, order_no, deadline, expected_completion from v_order_progress
        where risk = 'red' and status not in ('delivered','closed','cancelled','draft')`);
    return rows.map((r) => ({ key: r.order_id, type: 'order_risk', severity: 'critical',
      title: `Order ${r.order_no} will miss its deadline`,
      body: `Deadline ${r.deadline}${r.expected_completion ? `, expected completion ${r.expected_completion}` : ''}.`,
      data: { order_id: r.order_id }, required_permission: 'orders.view' }));
  },
  async function wastageAbovePlan(db) {
    const { rows } = await db.query(
      `select w.stage, avg(w.actual_waste_pct) as actual, avg(w.planned_waste_pct) as planned
         from v_wastage w join work_orders wo on wo.id = w.work_order_id
        where wo.finished_at > now() - interval '14 days' and w.planned_waste_pct is not null
        group by w.stage having avg(w.actual_waste_pct) - avg(w.planned_waste_pct) > 1.5`);
    return rows.map((r) => ({ key: r.stage, type: 'wastage', severity: 'warning',
      title: `${r.stage} wastage is above plan`,
      body: `Actual ${Number(r.actual).toFixed(1)}% vs planned ${Number(r.planned).toFixed(1)}% over the last 14 days.`,
      data: { stage: r.stage }, required_permission: 'reports.production' }));
  },
  async function shiftGap(db) {
    const { rows } = await db.query(
      `with s as (select p.shift_id, sh.name, avg(p.day_qty) as avg_qty from
                    (select shift_id, day, sum(qty) as day_qty from v_production_daily where day >= current_date - 14 group by 1, 2) p
                    join shifts sh on sh.id = p.shift_id group by 1, 2),
            t as (select avg(avg_qty) as mean, count(*) as n from s)
       select s.name, s.avg_qty, t.mean from s, t where t.n >= 2 and s.avg_qty < 0.85 * t.mean`);
    return rows.map((r) => ({ key: r.name, type: 'shift_gap', severity: 'info',
      title: `Shift ${r.name} output is ${Math.round((1 - r.avg_qty / r.mean) * 100)}% below the shift average`,
      body: `Average ${Math.round(r.avg_qty)} per day vs ${Math.round(r.mean)} across shifts (14 days).`,
      data: { shift: r.name }, required_permission: 'reports.production' }));
  },
  async function overdueReceivables(db) {
    const { rows: [r] } = await db.query(`select count(*)::int as n, coalesce(sum(outstanding), 0) as total from v_receivables where overdue`);
    if (!r.n) return [];
    return [{ key: 'overdue', type: 'overdue_receivables', severity: 'warning',
      title: `${r.n} invoice(s) are overdue, ${inr(r.total)} outstanding`,
      body: 'Follow up with the buyers before the next shipment.', data: { count: r.n, total: r.total }, required_permission: 'invoice.view' }];
  },
  async function lowMargin(db) {
    const { rows } = await db.query(
      `select order_id, order_no, revenue, profit from v_order_cost
        where revenue > 0 and profit / revenue < 0.05 and status in ('delivered','dispatched','closed')`);
    return rows.map((r) => ({ key: r.order_id, type: 'low_margin', severity: 'warning',
      title: `Order ${r.order_no} margin is ${(100 * r.profit / r.revenue).toFixed(1)}%`,
      body: `Revenue ${inr(r.revenue)}, profit ${inr(r.profit)}.`,
      data: { order_id: r.order_id }, required_permission: 'reports.cost' }));
  },
];

const Texts = z.object({ items: z.array(z.object({ key: z.string(), title: z.string(), body: z.string() })) });

async function polish(found) {
  if (!env.GEMINI_API_KEY || !found.length) return found;
  try {
    const client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    const res = await client.models.generateContent({
      model: env.AI_MODEL,
      contents: JSON.stringify(found.map((f) => ({ key: `${f.type}:${f.key}`, title: f.title, body: f.body, data: f.data }))),
      config: {
        systemInstruction: 'Rewrite each factory alert as a clear title (max 12 words) and a 1-2 line plain-language body for a mill manager. Keep every number accurate and do not add facts. Return the same keys.',
        responseMimeType: 'application/json',
        responseJsonSchema: z.toJSONSchema(Texts),
        temperature: 0.2,
      },
    });
    const parsed = Texts.safeParse(JSON.parse(res.text ?? 'null'));
    const byKey = new Map((parsed.success ? parsed.data.items : []).map((i) => [i.key, i]));
    return found.map((f) => { const t = byKey.get(`${f.type}:${f.key}`); return t ? { ...f, title: t.title, body: t.body } : f; });
  } catch (err) {
    console.error('[insights] AI wording failed, keeping templates:', err.message);
    return found;
  }
}

export async function runInsights(orgId, db) {
  const found = [];
  for (const rule of RULES) {
    try { found.push(...await rule(db)); } catch (err) { console.error(`[insights ${rule.name}]`, err.message); }
  }
  // the same insight is not repeated while a copy from the last 24 h exists (dismissed or not)
  const fresh = [];
  for (const f of found) {
    const { rowCount } = await db.query(
      `select 1 from ai_insights where type = $1 and data->>'key' = $2 and created_at > now() - interval '24 hours'`, [f.type, String(f.key)]);
    if (!rowCount) fresh.push(f);
  }
  for (const f of await polish(fresh)) {
    await db.query(
      `insert into ai_insights (org_id, type, severity, title, body, data, required_permission) values ($1,$2,$3,$4,$5,$6,$7)`,
      [orgId, f.type, f.severity, f.title, f.body, { ...f.data, key: String(f.key) }, f.required_permission]);
  }
  return fresh.length;
}

register('insights', '30 6 * * *', runInsights);
