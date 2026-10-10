// Org profile, module toggles and factory settings (backend plan §10.2).
// Mounted at the tenant root, so paths here are absolute: tenantRouter.use(orgsRoutes).
// Reads are open to any member of the org (the tenant middleware already checked membership);
// writes need settings.manage.

import { Router } from 'express';
import { can } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { mountCrud } from '../../utils/crud/index.js';
import * as c from './orgs.controller.js';
import * as s from './orgs.schema.js';

const r = Router();
const manage = can('settings.manage');
const write = [manage];

r.get('/org', c.getOrg);
r.put('/org', manage, validate({ body: s.updateOrgSchema }), c.updateOrg);
r.get('/org/modules', manage, c.getModules);
r.put('/org/modules', manage, validate({ body: s.updateModulesSchema }), c.updateModules);

// stages come back with their losses; PUT /stages/order sets the production sequence
r.put('/stages/order', manage, validate({ body: s.reorderStagesSchema }), c.reorderStages);
mountCrud(r, '/stages', { handlers: c.stages, write, schemas: { create: s.createStageSchema, update: s.updateStageSchema } });

// stage losses are keyed by stage: PUT creates or replaces
r.get('/stage-losses', c.listStageLosses);
r.put('/stage-losses/:stageId', manage, validate({ params: s.stageIdParams, body: s.upsertStageLossSchema }), c.upsertStageLoss);
r.delete('/stage-losses/:stageId', manage, validate({ params: s.stageIdParams }), c.removeStageLoss);

mountCrud(r, '/shifts', { handlers: c.shifts, write, schemas: { create: s.createShiftSchema, update: s.updateShiftSchema } });
mountCrud(r, '/defect-types', { handlers: c.defectTypes, write, schemas: { create: s.createDefectTypeSchema, update: s.updateDefectTypeSchema } });
mountCrud(r, '/warehouses', { handlers: c.warehouses, write, schemas: { create: s.createWarehouseSchema, update: s.updateWarehouseSchema } });

export default r;
