// Attendance. Scope applies everywhere: a supervisor only sees and marks their own stages and shifts.
//   GET  /attendance?date=&shift_id=&stage_id=     attendance.view   the day's rows
//   GET  /attendance/today | /register?month=      attendance.view
//   POST /attendance/bulk                          attendance.mark   the supervisor's grid
//   GET  /attendance/unresolved?from=&to=          attendance.view   card check-ins nobody has closed (needs_correction)
//   POST /attendance/:id/correct                   attendance.mark   { check_out, check_in?, reason }: explicit times, audited
//   POST /attendance/:id/ot-approve                attendance.approve

import { Router } from 'express';
import { can } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { idParams } from '../../utils/crud/index.js';
import * as c from './attendance.controller.js';
import * as s from './attendance.schema.js';

const r = Router();
const view = can('attendance.view');
const mark = can('attendance.mark');
const approve = can('attendance.approve');

r.get('/attendance', view, validate({ query: s.dayQuery }), c.day);
r.get('/attendance/today', view, validate({ query: s.dayQuery }), c.today);
r.get('/attendance/unresolved', view, validate({ query: s.unresolvedQuery }), c.unresolved);
r.get('/attendance/register', view, validate({ query: s.registerQuery }), c.register);
r.post('/attendance/bulk', mark, validate({ body: s.bulkSchema }), c.bulk);
r.post('/attendance/:id/correct', mark, validate({ params: idParams, body: s.correctSchema }), c.correct);
r.post('/attendance/:id/ot-approve', approve, validate({ params: idParams }), c.otApprove);

export default r;
