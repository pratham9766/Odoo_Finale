import { Router } from 'express';
import { can } from '../../middleware/rbac.js';
import { validate, idParam } from '../../middleware/validate.js';
import { send } from '../../utils/http.js';
import * as s from './staff.service.js';
import { inviteSchema, memberPatchSchema, roleCreateSchema, roleUpdateSchema, membershipParam, auditQuery } from './staff.schema.js';

const r = Router();

r.get('/staff', can('staff.view'), send((req) => s.listStaff(req.ctx)));
r.post('/staff/invites', can('staff.invite'), validate({ body: inviteSchema }), send((req) => s.inviteStaff(req.ctx, req.valid.body), 201));
r.delete('/staff/invites/:id', can('staff.invite'), validate({ params: idParam }), send((req) => s.revokeInvite(req.ctx, req.valid.params.id)));
r.patch('/staff/:membershipId', can('staff.edit_role'), validate({ params: membershipParam, body: memberPatchSchema }),
  send((req) => s.patchMember(req.ctx, req.valid.params.membershipId, req.valid.body)));

r.get('/permissions', can('staff.view'), send((req) => s.listPermissions(req.ctx)));
r.get('/roles', can('staff.view'), send((req) => s.listRoles(req.ctx)));
r.post('/roles', can('roles.manage'), validate({ body: roleCreateSchema }), send((req) => s.createRole(req.ctx, req.valid.body), 201));
r.put('/roles/:id', can('roles.manage'), validate({ params: idParam, body: roleUpdateSchema }), send((req) => s.updateRole(req.ctx, req.valid.params.id, req.valid.body)));
r.delete('/roles/:id', can('roles.manage'), validate({ params: idParam }), send((req) => s.deleteRole(req.ctx, req.valid.params.id)));

r.get('/audit-logs', can('roles.manage'), validate({ query: auditQuery }), send((req) => s.listAuditLogs(req.ctx, req.valid.query)));

export default r;
