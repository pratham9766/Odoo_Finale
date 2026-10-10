// GET /reports/dashboard (backend plan §10.11): role-aware KPI blocks. Every block checks its own permission, so a supervisor
// and the owner call the same endpoint and get different things. A block the caller may not see is simply absent.

import { withTx } from '../../db/tx.js';
import { round2 } from '../../utils/money.js';
import { addDays, monthStart, todayIST } from '../../utils/time.js';
import { boardRows, summariseBoard } from '../production/board.service.js';
import { todayCounts } from '../workforce/attendance.service.js';

const IN_PROGRESS = ['confirmed', 'waiting_material', 'material_ready', 'in_production', 'in_qc', 'ready_to_ship', 'partially_dispatched'];

/** Machines by status, today's output per unit, and the last 7 days of output per stage. */
async function production(db, ctx, today) {
  const { kpis } = summariseBoard(await boardRows(db, ctx));
  const { rows } = await db.query(
    `select v.day, s.name as stage, m.capacity_uom as uom, sum(v.qty) as qty
       from v_production_daily v join machines m on m.id = v.machine_id join stages s on s.id = m.stage_id
      where v.day >= $1::date group by v.day, s.name, s.sequence, m.capacity_uom order by v.day, s.sequence`, [addDays(today, -6)]);
  return { ...kpis, last_7_days: rows.map((r) => ({ ...r, qty: round2(r.qty) })) };
}

/** Orders by risk, and the ones that need attention first. */
async function orders(db, _ctx) {
  const { rows: counts } = await db.query(
    `select coalesce(risk, 'green') as risk, count(*)::int as n from orders where status = any($1) group by 1`, [IN_PROGRESS]);
  const { rows: attention } = await db.query(
    `select id, order_no, risk, status, progress_pct, deadline, expected_completion from orders
      where status = any($1) and risk in ('red', 'amber') order by risk desc, deadline limit 5`, [IN_PROGRESS]);
  const by = Object.fromEntries(counts.map((c) => [c.risk, c.n]));
  return { in_progress: counts.reduce((n, c) => n + c.n, 0), red: by.red ?? 0, amber: by.amber ?? 0, green: by.green ?? 0, needs_attention: attention };
}

async function attendance(db, ctx, today) {
  const counts = await todayCounts(db, today);
  const { rows: [{ expected }] } = await db.query(`select count(*)::int as expected from workers where active`);
  return { ...counts, expected };
}

/** This month's profit against last month's (from the P&L view). */
async function finance(db, today) {
  const { rows } = await db.query(`select month, revenue, net_profit from v_monthly_pnl where month >= $1::date - interval '1 month' order by month`, [monthStart(today)]);
  const [last, now] = rows.length > 1 ? rows : [null, rows[0]];
  const change = last && Number(last.net_profit) !== 0 ? Math.round((1000 * (now.net_profit - last.net_profit)) / Math.abs(last.net_profit)) / 10 : null;
  return { revenue: now?.revenue ?? 0, net_profit: now?.net_profit ?? 0, last_month_net_profit: last?.net_profit ?? null, change_pct: change };
}

/** The red-badge numbers: low stock, broken machines, overdue money, unmoved rolls. Each needs its own permission. */
async function alerts(db, ctx) {
  const can = (p) => ctx.permissions.has(p);
  const out = {};
  if (can('stock.view')) {
    out.low_stock = (await db.query(`select count(*)::int as n from v_low_stock`)).rows[0].n;
    const { rows: [mill] } = await db.query(`select settings from mill`);
    out.unmoved_rolls = (await db.query(`select count(*)::int as n from v_finished_stock where days_on_shelf >= $1`, [Number(mill.settings?.unmoved_days ?? 7)])).rows[0].n;
  }
  if (can('production.view')) {
    out.machines_down = (await db.query(`select code from machines where status in ('breakdown', 'maintenance') order by code`)).rows.map((m) => m.code);
  }
  if (can('invoice.view')) {
    const { rows: [o] } = await db.query(`select count(*)::int as invoices, coalesce(sum(outstanding), 0) as amount from v_receivables where overdue`);
    out.overdue = { invoices: o.invoices, amount: round2(o.amount) };
  }
  return out;
}

/** Only the blocks the caller has the permission for. */
export function dashboard(ctx) {
  const today = todayIST();
  const can = (p) => ctx.permissions.has(p);
  return withTx(async (db) => ({
    ...(can('production.view') && { production: await production(db, ctx, today) }),
    ...(can('orders.view') && { orders: await orders(db, ctx) }),
    ...(can('attendance.view') && { attendance: await attendance(db, ctx, today) }),
    ...(can('reports.pnl') && { finance: await finance(db, today) }),
    alerts: await alerts(db, ctx),
  }));
}
