// HTTP handlers for starting, pausing, logging output on and finishing a work order.
import { readIdempotencyKey } from '../../utils/idempotency.js';
import { logProduction } from './productionLogs.service.js';
import { finishWorkOrder, pauseWorkOrder, startWorkOrder } from './workOrderActions.service.js';

const id = (req) => req.valid.params.id;

export const start = async (req, res) => res.json({ data: await startWorkOrder(req.ctx, id(req)) });
export const pause = async (req, res) => res.json({ data: await pauseWorkOrder(req.ctx, id(req), req.valid.body) });
export const finish = async (req, res) => res.json({ data: await finishWorkOrder(req.ctx, id(req), req.valid.body) });
/** Send an `Idempotency-Key` header, one per logical entry, and reuse it when retrying; see utils/idempotency.js. */
export const log = async (req, res) => {
  const { replayed, ...data } = await logProduction(req.ctx, id(req), req.valid.body, { idempotencyKey: readIdempotencyKey(req) });
  res.status(replayed ? 200 : 201).json({ data, meta: { replayed } });
};
