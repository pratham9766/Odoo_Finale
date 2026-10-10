import { Router } from 'express';
import { can } from '../../middleware/rbac.js';
import { authLimiter } from '../../middleware/rateLimit.js';
import { validate, idParam } from '../../middleware/validate.js';
import { send } from '../../utils/http.js';
import * as s from './partners.service.js';
import { connectCodeSchema, inviteEmailSchema, orgIdParam, contactSchema, contactUpdateSchema, contactQuery } from './partners.schema.js';

const r = Router();

r.get('/partners', can('partners.view'), send((req) => s.listPartners(req.ctx)));
r.post('/partners/connect-code', can('partners.connect'), authLimiter, validate({ body: connectCodeSchema }), send((req) => s.connectByCode(req.ctx, req.valid.body), 201));
r.post('/partners/invite-email', can('partners.connect'), authLimiter, validate({ body: inviteEmailSchema }), send((req) => s.inviteByEmail(req.ctx, req.valid.body), 201));
r.post('/partners/:id/accept', can('partners.approve'), validate({ params: idParam }), send((req) => s.acceptPartner(req.ctx, req.valid.params.id)));
r.post('/partners/:id/reject', can('partners.approve'), validate({ params: idParam }), send((req) => s.rejectPartner(req.ctx, req.valid.params.id)));
r.post('/partners/:id/block', can('partners.approve'), validate({ params: idParam }), send((req) => s.blockPartner(req.ctx, req.valid.params.id)));
r.get('/partners/:orgId/catalog', can('orders.create'), validate({ params: orgIdParam }), send((req) => s.sellerCatalog(req.ctx, req.valid.params.orgId)));

r.get('/contacts', can('partners.view'), validate({ query: contactQuery }), send((req) => s.listContacts(req.ctx, req.valid.query)));
r.post('/contacts', can('partners.connect'), validate({ body: contactSchema }), send((req) => s.createContact(req.ctx, req.valid.body), 201));
r.put('/contacts/:id', can('partners.connect'), validate({ params: idParam, body: contactUpdateSchema }), send((req) => s.updateContact(req.ctx, req.valid.params.id, req.valid.body)));
r.delete('/contacts/:id', can('partners.connect'), validate({ params: idParam }), send((req) => s.deleteContact(req.ctx, req.valid.params.id)));

export default r;
