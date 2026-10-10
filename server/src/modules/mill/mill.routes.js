// Mill profile, module toggles and floor settings. Reads are open to any staff member; writes need settings.create / update / delete.

import { Router } from 'express';
import { can } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { mountCrud } from '../../utils/crud/index.js';
import * as c from './mill.controller.js';
import * as s from './mill.schema.js';

const r = Router();
const update = can('settings.update');
const remove = can('settings.delete');
const guards = { create: [can('settings.create')], update: [update], remove: [remove] };

r.get('/mill', c.getMill);
r.put('/mill', update, validate({ body: s.updateMillSchema }), c.updateMill);
r.get('/mill/modules', update, c.getModules);
r.put('/mill/modules', update, validate({ body: s.updateModulesSchema }), c.updateModules);

// stages come back with their losses; PUT /stages/order sets the production sequence
r.put('/stages/order', update, validate({ body: s.reorderStagesSchema }), c.reorderStages);
mountCrud(r, '/stages', { handlers: c.stages, ...guards, schemas: { create: s.createStageSchema, update: s.updateStageSchema } });

// stage losses are keyed by stage: PUT creates or replaces
r.get('/stage-losses', c.listStageLosses);
r.put('/stage-losses/:stageId', update, validate({ params: s.stageIdParams, body: s.upsertStageLossSchema }), c.upsertStageLoss);
r.delete('/stage-losses/:stageId', remove, validate({ params: s.stageIdParams }), c.removeStageLoss);

mountCrud(r, '/shifts', { handlers: c.shifts, ...guards, schemas: { create: s.createShiftSchema, update: s.updateShiftSchema } });
mountCrud(r, '/defect-types', { handlers: c.defectTypes, ...guards, schemas: { create: s.createDefectTypeSchema, update: s.updateDefectTypeSchema } });
mountCrud(r, '/warehouses', { handlers: c.warehouses, ...guards, schemas: { create: s.createWarehouseSchema, update: s.updateWarehouseSchema } });

export default r;
