import * as svc from './gate.service.js';

export const log = async (req, res) => res.status(201).json({ data: await svc.logEntry(req.ctx, req.valid.body) });

export const list = async (req, res) => {
  const query = req.valid.query;
  const { rows, total } = await svc.listEntries(req.ctx, query);
  res.json({ data: rows, meta: { page: query.page, limit: query.limit, total } });
};

export const expected = async (req, res) => res.json({ data: await svc.expectedSupply(req.ctx) });
