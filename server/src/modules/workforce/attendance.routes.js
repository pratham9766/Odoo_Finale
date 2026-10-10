// Attendance, corrections and leave (backend plan §10.10). Scope applies everywhere: a supervisor only sees and marks their own stages and shifts.
//   GET  /attendance?date=&shift_id=&stage_id=     attendance.view   the day's rows
//   GET  /attendance/today | /register?month=      attendance.view
//   POST /attendance/bulk                          attendance.mark   the supervisor's grid
//   POST /attendance/:id/ot-approve                attendance.approve
//   GET/POST /attendance/corrections, POST /:id/decide   attendance.mark / attendance.approve
//   GET/POST /leave, POST /leave/:id/decide        attendance.view / attendance.mark / attendance.approve

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
r.get('/attendance/register', view, validate({ query: s.registerQuery }), c.register);
r.post('/attendance/bulk', mark, validate({ body: s.bulkSchema }), c.bulk);
r.get('/attendance/corrections', can('attendance.mark', 'attendance.approve'), validate({ query: s.listCorrectionsQuery }), c.listCorrections);
r.post('/attendance/corrections', mark, validate({ body: s.correctionSchema }), c.requestChange);
r.post('/attendance/corrections/:id/decide', approve, validate({ params: idParams, body: s.decideSchema }), c.decideChange);
r.post('/attendance/:id/ot-approve', approve, validate({ params: idParams }), c.otApprove);

r.get('/leave', view, validate({ query: s.listLeaveQuery }), c.listLeave);
r.post('/leave', mark, validate({ body: s.leaveSchema }), c.requestLeave);
r.post('/leave/:id/decide', approve, validate({ params: idParams, body: s.decideSchema }), c.decideLeaveRequest);

export default r;
