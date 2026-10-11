// Routes for the logged-in person: profile, own access, own work (My work), accepting a staff invite.
import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { authLimiter } from '../../middleware/rateLimit.js';
import { staff } from '../../middleware/staff.js';
import { send } from '../../utils/http.js';
import * as s from './me.service.js';
import { myWork } from './myWork.service.js';
import { updateProfileSchema, tokenParam, myWorkQuery } from './me.schema.js';

const r = Router();

r.get('/', send((req) => s.getMe(req.user)));
r.put('/profile', validate({ body: updateProfileSchema }), send((req) => s.updateProfile(req.user, req.valid.body)));
r.get('/access', send((req) => s.myAccess(req.user)));
// my own worker record: today's machine, attendance, output, pay (staff only, no permission needed)
r.get('/work', staff, validate({ query: myWorkQuery }), send((req) => myWork(req.user.id, req.valid.query.month)));

r.get('/invites/staff/:token', authLimiter, validate({ params: tokenParam }), send((req) => s.getStaffInvite(req.user, req.valid.params.token)));
r.post('/invites/staff/:token/accept', authLimiter, validate({ params: tokenParam }), send((req) => s.acceptStaffInvite(req.user, req.valid.params.token)));

export default r;
