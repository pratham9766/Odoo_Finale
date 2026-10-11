// Workers: CRUD with wage-type checks (a daily worker needs a rate) and the printable badge PDF.
import { assertUploadPath, createCrud, invalid, omit } from '../../utils/crud/index.js';
import * as pdf from '../../utils/pdf.js';
import { withTx } from '../../db/tx.js';
import { AppError } from '../../utils/errors.js';
import { getMill } from '../mill/mill.service.js';

const WAGE_FIELDS = ['rate', 'ot_rate', 'piece_rate'];
const RFID_FIELDS = ['rfid_uid', 'rfid_placeholder'];
// the field that must be set for each wage type (a daily worker with rate 0 would be paid nothing)
const REQUIRED_RATE = { daily: 'rate', hourly: 'rate', piece: 'piece_rate' };

/** workers.manage sees everything. Everyone else with attendance.view gets no wage rates, unless wages.view. */
function present(ctx, row) {
  const visible = ctx.permissions.has('rfid.view') ? row : omit(row, RFID_FIELDS);   // a card UID is a credential
  if (ctx.permissions.has('workers.create') || ctx.permissions.has('workers.update') || ctx.permissions.has('wages.view')) return visible;
  return omit(visible, WAGE_FIELDS);
}

const crud = createCrud({
  table: 'workers', label: 'Worker',
  columns: ['emp_code', 'name', 'phone', 'photo_path', 'skill', 'stage_id', 'default_shift_id',
            'employment_type', 'wage_type', 'rate', 'ot_rate', 'piece_rate', 'active', 'department', 'work_area'],
  select: `t.id, t.emp_code, t.name, t.phone, t.photo_path, t.skill, t.stage_id, t.default_shift_id,
           t.employment_type, t.wage_type, t.rate, t.ot_rate, t.piece_rate, t.user_id, t.active,
           t.created_at, t.created_by, t.department, t.work_area, st.name as stage, sh.name as shift,
           rc.card_uid as rfid_uid, rc.is_placeholder as rfid_placeholder`,
  joins: `left join stages st on st.id = t.stage_id
          left join shifts sh on sh.id = t.default_shift_id
          left join rfid_credentials rc on rc.worker_id = t.id and rc.active`,
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

export async function workerBadgePdf(ctx, id) {
  // The normal get enforces the caller's stage/shift scope without exposing qr_token in list responses.
  const worker = await workers.get(ctx, id);
  const { rows: [secret] } = await withTx((db) => db.query('select qr_token from workers where id = $1', [id]));
  if (!secret) throw new AppError(404, 'NOT_FOUND', 'Worker not found');
  const buffer = await pdf.badge({ worker: { ...worker, qr_token: secret.qr_token }, org: await getMill() });
  return { buffer, filename: `badge-${worker.emp_code}.pdf` };
}
