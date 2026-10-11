// Routes for staff members, invites, roles and the permission catalogue.
import { Router } from 'express';
import { can } from '../../middleware/rbac.js';
import { validate, idParam } from '../../middleware/validate.js';
import { send } from '../../utils/http.js';
import * as s from './staff.service.js';
import { inviteSchema, memberPatchSchema, roleCreateSchema, roleUpdateSchema, auditQuery } from './staff.schema.js';

const r = Router();

r.get('/staff', can('staff.view'), send((req) => s.listStaff(req.ctx)));
r.post('/staff/invites', can('staff.create'), validate({ body: inviteSchema }), send((req) => s.inviteStaff(req.ctx, req.valid.body), 201));
r.post('/staff/invites/:id/resend', can('staff.create'), validate({ params: idParam }), send((req) => s.resendInvite(req.ctx, req.valid.params.id), 201));
r.delete('/staff/invites/:id', can('staff.delete'), validate({ params: idParam }), send((req) => s.revokeInvite(req.ctx, req.valid.params.id)));
r.patch('/staff/:id', can('staff.update'), validate({ params: idParam, body: memberPatchSchema }),
  send((req) => s.patchMember(req.ctx, req.valid.params.id, req.valid.body)));

r.get('/permissions', can('roles.view', 'staff.view'), send((req) => s.listPermissions(req.ctx)));
r.get('/roles', can('roles.view', 'staff.view'), send((req) => s.listRoles(req.ctx)));
r.post('/roles', can('roles.create'), validate({ body: roleCreateSchema }), send((req) => s.createRole(req.ctx, req.valid.body), 201));
r.put('/roles/:id', can('roles.update'), validate({ params: idParam, body: roleUpdateSchema }), send((req) => s.updateRole(req.ctx, req.valid.params.id, req.valid.body)));
r.delete('/roles/:id', can('roles.delete'), validate({ params: idParam }), send((req) => s.deleteRole(req.ctx, req.valid.params.id)));

r.get('/audit-logs', can('roles.view'), validate({ query: auditQuery }), send((req) => s.listAuditLogs(req.ctx, req.valid.query)));

export default r;
