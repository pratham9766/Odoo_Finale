// HTTP handlers for rolls and quality: create a roll, trace, label, QC queue, inspect, override, summaries.
import { crudHandlers } from '../../utils/crud/index.js';
import { readIdempotencyKey } from '../../utils/idempotency.js';
import { sendPdf } from '../../utils/pdf.js';
import { inspectRoll, overrideResult } from './inspections.service.js';
import { defectsBy, qcSummary } from './qcReports.service.js';
import { createRoll, labelPdf, rollByNo, rolls } from './rolls.service.js';
import { traceRoll } from './trace.service.js';

const rollNo = (req) => req.valid.params.rollNo;

/** Send an `Idempotency-Key` header, one per logical roll, and reuse it when retrying; see utils/idempotency.js. */
export const create = async (req, res) => {
  const { replayed, ...roll } = await createRoll(req.ctx, req.valid.body, { idempotencyKey: readIdempotencyKey(req) });
  res.status(replayed ? 200 : 201).json({ data: roll, meta: { replayed } });
};
export const getRoll = async (req, res) => res.json({ data: await rollByNo(req.ctx, rollNo(req)) });
export const trace = async (req, res) => res.json({ data: await traceRoll(req.ctx, rollNo(req)) });
export const label = async (req, res) => {
  const { buffer, filename } = await labelPdf(req.ctx, rollNo(req));
  sendPdf(res, buffer, filename);
};

export const queue = crudHandlers(rolls).list;
export const inspect = async (req, res) => res.status(201).json({ data: await inspectRoll(req.ctx, req.valid.body) });
export const override = async (req, res) => res.status(201).json({ data: await overrideResult(req.ctx, req.valid.params.id, req.valid.body) });
export const summary = async (req, res) => res.json({ data: await qcSummary(req.ctx, req.valid.query) });
export const defects = async (req, res) => res.json({ data: await defectsBy(req.ctx, req.valid.query) });
