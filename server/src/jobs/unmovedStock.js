// Unmoved stock (backend plan §14): finished rolls that passed QC and have been on the shelf too long
// (org setting `unmoved_days`, default 7) → one notification a day.

import { formatQty } from '../utils/textile.js';
import { forEachActiveOrg } from './forEachActiveOrg.js';
import { notifyOnceToday } from './notifyOnce.js';

const DEFAULT_DAYS = 7;

/** @returns {Promise<number>} how many rolls are unmoved */
export async function checkUnmoved(db, orgId) {
  const { rows: [org] } = await db.query(`select settings from organizations where id = $1`, [orgId]);
  const days = Number(org.settings?.unmoved_days ?? DEFAULT_DAYS);
  const { rows: [u] } = await db.query(
    `select count(*)::int as rolls, coalesce(sum(length_m), 0) as metres from v_finished_stock where days_on_shelf >= $1`, [days]);
  if (u.rolls) {
    await notifyOnceToday(db, {
      orgId, requiredPermission: 'stock.view', type: 'stock.unmoved', link: '/app/inventory/stock?tab=finished',
      title: `${u.rolls} roll${u.rolls === 1 ? '' : 's'} unmoved for ${days}+ days`,
      body: `${formatQty(u.metres, 'm')} of passed fabric is waiting to be dispatched`,
    });
  }
  return u.rolls;
}

async function run() {
  const { ok } = await forEachActiveOrg('unmovedStock', (db, orgId) => checkUnmoved(db, orgId));
  return ok.reduce((total, { result }) => total + result, 0);
}

export const unmovedStock = { name: 'unmovedStock', schedule: '30 9 * * *', run };
