import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { authLimiter } from '../../middleware/rateLimit.js';
import { send } from '../../utils/http.js';
import * as s from './me.service.js';
import { updateProfileSchema, createOrgSchema, tokenParam, orgIdParam, acceptPartnerSchema } from './me.schema.js';

const r = Router();

r.get('/', send((req) => s.getMe(req.user)));
r.put('/profile', validate({ body: updateProfileSchema }), send((req) => s.updateProfile(req.user, req.valid.body)));

r.get('/orgs', send((req) => s.listMyOrgs(req.user)));
r.post('/orgs', authLimiter, validate({ body: createOrgSchema }), send((req) => s.createOrg(req.user, req.valid.body), 201));
r.get('/orgs/:id/context', validate({ params: orgIdParam }), send((req) => s.orgContext(req.user, req.valid.params.id)));

r.get('/invites/staff/:token', authLimiter, validate({ params: tokenParam }), send((req) => s.getStaffInvite(req.user, req.valid.params.token)));
r.post('/invites/staff/:token/accept', authLimiter, validate({ params: tokenParam }), send((req) => s.acceptStaffInvite(req.user, req.valid.params.token)));
r.get('/invites/partner/:token', authLimiter, validate({ params: tokenParam }), send((req) => s.getPartnerInvite(req.user, req.valid.params.token)));
r.post('/invites/partner/:token/accept', authLimiter, validate({ params: tokenParam, body: acceptPartnerSchema }),
  send((req) => s.acceptPartnerInvite(req.user, req.valid.params.token, req.valid.body.org_id)));

export default r;
