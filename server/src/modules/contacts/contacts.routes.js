import { Router } from 'express';
import { can } from '../../middleware/rbac.js';
import { validate, idParam } from '../../middleware/validate.js';
import { send } from '../../utils/http.js';
import * as s from './contacts.service.js';
import { contactSchema, contactUpdateSchema, contactQuery } from './contacts.schema.js';

const r = Router();

r.get('/contacts', can('contacts.view'), validate({ query: contactQuery }), send((req) => s.listContacts(req.ctx, req.valid.query)));
r.post('/contacts', can('contacts.manage'), validate({ body: contactSchema }), send((req) => s.createContact(req.ctx, req.valid.body), 201));
r.put('/contacts/:id', can('contacts.manage'), validate({ params: idParam, body: contactUpdateSchema }), send((req) => s.updateContact(req.ctx, req.valid.params.id, req.valid.body)));
r.delete('/contacts/:id', can('contacts.manage'), validate({ params: idParam }), send((req) => s.deleteContact(req.ctx, req.valid.params.id)));

export default r;
