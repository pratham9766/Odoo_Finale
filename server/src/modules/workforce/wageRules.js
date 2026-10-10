// Wage rules (backend plan §11.13). Pure: a worker's pay terms and the month's attendance totals in, money out.
//   daily  → days × rate + OT hours × OT rate
//   hourly → hours × rate + OT hours × OT rate
//   piece  → pieces × piece rate + OT hours × OT rate
// OT counts only when approved (the caller sums approved hours). A half day counts as 0.5 day.

import { round2 } from '../../utils/money.js';

/** @param {{ wage_type, rate, ot_rate, piece_rate }} worker  @param {{ days, hours, ot_hours, pieces }} totals */
export function grossPay(worker, totals) {
  const overtime = Number(totals.ot_hours) * Number(worker.ot_rate);
  const base = {
    daily: Number(totals.days) * Number(worker.rate),
    hourly: Number(totals.hours) * Number(worker.rate),
    piece: Number(totals.pieces) * Number(worker.piece_rate),
  }[worker.wage_type];
  return round2(base + overtime);
}

/**
 * Advances come off the pay oldest first (the smaller one first on the same day), whole advances only (an advance is never split),
 * never more than the gross. The first one that does not fit stops the recovery: a newer advance never jumps the queue.
 * @param {Array<{ id, amount }>} advances  unrecovered, oldest first
 * @returns {{ recovered: Array<{ id, amount }>, total: number }}
 */
export function recoverAdvances(advances, gross) {
  const recovered = [];
  let total = 0;
  for (const a of advances) {
    if (round2(total + Number(a.amount)) > gross) break;
    recovered.push(a);
    total = round2(total + Number(a.amount));
  }
  return { recovered, total };
}
