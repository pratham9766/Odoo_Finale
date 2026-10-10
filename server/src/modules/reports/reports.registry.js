// Every report by name (backend plan §10.11). A definition is { permission, query (zod), run(ctx, query) → { columns, rows, ...extras } }.
// reports.routes.js turns each one into GET /reports/<name> and GET /reports/<name>/export.csv: add a report here and both routes exist.

import attendance from './attendance.js';
import machines from './machines.js';
import orderCost from './orderCost.js';
import pnl from './pnl.js';
import qc from './qc.js';
import wages from './wages.js';
import wastage from './wastage.js';

export const REPORTS = {
  'order-cost': orderCost,
  machines,
  wastage,
  qc,
  attendance,
  wages,
  pnl,
};
