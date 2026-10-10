import { logProduction } from './productionLogs.service.js';
import { finishWorkOrder, pauseWorkOrder, startWorkOrder } from './workOrderActions.service.js';

const id = (req) => req.valid.params.id;

export const start = async (req, res) => res.json({ data: await startWorkOrder(req.ctx, id(req)) });
export const pause = async (req, res) => res.json({ data: await pauseWorkOrder(req.ctx, id(req), req.valid.body) });
export const finish = async (req, res) => res.json({ data: await finishWorkOrder(req.ctx, id(req), req.valid.body) });
export const log = async (req, res) => res.status(201).json({ data: await logProduction(req.ctx, id(req), req.valid.body) });
