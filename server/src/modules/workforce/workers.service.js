import { assertUploadPath, createCrud, invalid, omit } from '../../utils/crud/index.js';

const WAGE_FIELDS = ['rate', 'ot_rate', 'piece_rate'];
// the field that must be set for each wage type (a daily worker with rate 0 would be paid nothing)
const REQUIRED_RATE = { daily: 'rate', hourly: 'rate', piece: 'piece_rate' };

/** workers.manage sees everything. Everyone else with attendance.view gets no wage rates, unless wages.view. */
function present(ctx, row) {
  if (ctx.permissions.has('workers.manage') || ctx.permissions.has('wages.view')) return row;
  return omit(row, WAGE_FIELDS);
}

const crud = createCrud({
  table: 'workers', label: 'Worker',
  columns: ['emp_code', 'name', 'phone', 'photo_path', 'skill', 'stage_id', 'default_shift_id',
            'employment_type', 'wage_type', 'rate', 'ot_rate', 'piece_rate', 'active'],
  select: 't.*, st.name as stage, sh.name as shift',
  joins: `left join stages st on st.id = t.stage_id
          left join shifts sh on sh.id = t.default_shift_id`,
  orderBy: 't.emp_code',
  references: {
    stage_id: { table: 'stages', label: 'Stage' },
    default_shift_id: { table: 'shifts', label: 'Shift' },
  },

  // attendance supervisors only see workers of their stages and shifts (empty scope = whole mill)
  scope: (f, ctx) => f.anyOf('t.stage_id', ctx.scope?.stage_ids).anyOf('t.default_shift_id', ctx.scope?.shift_ids),
  filters: (f, q) => f
    .eq('t.stage_id', q.stage_id).eq('t.default_shift_id', q.shift_id)
    .eq('t.wage_type', q.wage_type).eq('t.active', q.active)
    .search(['t.name', 't.emp_code', 't.phone'], q.q),

  check: async (_db, ctx, input, before) => {
    assertUploadPath(input.photo_path, 'photo_path');
    const merged = { ...before, ...input };
    const rateField = REQUIRED_RATE[merged.wage_type];
    if (!(Number(merged[rateField]) > 0)) {
      throw invalid(rateField, `Set a ${rateField === 'piece_rate' ? 'piece rate' : 'rate'} for ${merged.wage_type} workers`);
    }
  },

  present,
  duplicate: (w) => `Employee code ${w.emp_code} already exists`,
  inUse: 'This worker has attendance, production or wage records and cannot be deleted. Deactivate them instead.',
});

export const workers = crud;
