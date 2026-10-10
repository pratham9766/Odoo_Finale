// Quality (reports.qc): yield and rejection from the QC summary, defects by machine in the table, by type and by supplier alongside.

import { rangeQuery } from '../../utils/crud/index.js';
import { defectsBy, qcSummary } from '../quality/qcReports.service.js';
import { columns } from './support.js';

const COLUMNS = columns(['key', 'Machine'], ['defects', 'Defects']);

export default {
  permission: 'reports.qc',
  query: rangeQuery,
  async run(ctx, range) {
    const [summary, machines, types, suppliers] = await Promise.all([
      qcSummary(ctx, range), defectsBy(ctx, { ...range, by: 'machine' }), defectsBy(ctx, { ...range, by: 'type' }), defectsBy(ctx, { ...range, by: 'supplier' }),
    ]);
    return { period: summary.period, summary, columns: COLUMNS, rows: machines.rows, by_type: types.rows, by_supplier: suppliers.rows };
  },
};
