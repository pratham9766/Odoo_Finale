import { crudHandlers } from '../../utils/crud/index.js';
import * as svc from './orgs.service.js';

// Express 5 forwards rejected promises to the error handler, so no try/catch here.
// Validated input is in req.valid (validate() middleware, backend plan §22.6).

export const getOrg = async (req, res) => res.json({ data: await svc.getOrg(req.ctx) });
export const updateOrg = async (req, res) => res.json({ data: await svc.updateOrg(req.ctx, req.valid.body) });

export const getModules = async (req, res) => res.json({ data: await svc.getModules(req.ctx) });
export const updateModules = async (req, res) => res.json({ data: await svc.updateModules(req.ctx, req.valid.body) });

export const reorderStages = async (req, res) => res.json({ data: await svc.reorderStages(req.ctx, req.valid.body) });

export const listStageLosses = async (req, res) => res.json({ data: await svc.listStageLosses(req.ctx) });
export const upsertStageLoss = async (req, res) =>
  res.json({ data: await svc.upsertStageLoss(req.ctx, req.valid.params.stageId, req.valid.body) });
export const removeStageLoss = async (req, res) =>
  res.json({ data: await svc.removeStageLoss(req.ctx, req.valid.params.stageId) });

export const stages = crudHandlers(svc.stages);
export const shifts = crudHandlers(svc.shifts);
export const defectTypes = crudHandlers(svc.defectTypes);
export const warehouses = crudHandlers(svc.warehouses);
