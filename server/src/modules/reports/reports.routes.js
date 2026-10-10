// Entry point of the reports module (backend plan §10.11): Vipul mounts this one router at the tenant root.
//   GET /reports/dashboard                       role-aware blocks (each checks its own permission)
//   GET /reports/<name>[?from=&to=|month=]       permission per report, see reports.registry.js
//   GET /reports/<name>/export.csv               same permission, same query: the table of the report as CSV

import { Router } from 'express';
import { can, requireModule } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { sendCsv, toCsv } from '../../utils/csv.js';
import { dashboard } from './dashboard.service.js';
import { REPORTS } from './reports.registry.js';

const r = Router();
// the dashboard is every role's landing page, so only the report endpoints follow the module switch
r.use(Object.keys(REPORTS).map((name) => `/reports/${name}`), requireModule('reports'));

r.get('/reports/dashboard', async (req, res) => res.json({ data: await dashboard(req.ctx) }));

for (const [name, report] of Object.entries(REPORTS)) {
  const guard = [can(report.permission), validate({ query: report.query })];
  r.get(`/reports/${name}`, ...guard, async (req, res) => res.json({ data: await report.run(req.ctx, req.valid.query) }));
  r.get(`/reports/${name}/export.csv`, ...guard, async (req, res) => {
    const { columns, rows } = await report.run(req.ctx, req.valid.query);
    sendCsv(res, `${name}.csv`, toCsv(columns, rows));
  });
}

export default r;
