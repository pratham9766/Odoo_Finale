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
