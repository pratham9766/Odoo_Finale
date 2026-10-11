// HTTP handlers for payments, receivables and payables.
import { recordPayment, listPayments } from './payments.service.js';
import { payables, receivables } from './receivables.service.js';

export const record = async (req, res) => res.status(201).json({ data: await recordPayment(req.ctx, req.valid.body) });

export const listPaymentsHandler = async (req, res) => {
  const query = req.valid.query;
  const { rows, total } = await listPayments(req.ctx, query);
  res.json({ data: rows, meta: { page: query.page, limit: query.limit, total } });
};

export const getReceivables = async (req, res) => res.json({ data: await receivables(req.ctx) });
export const getPayables = async (req, res) => res.json({ data: await payables(req.ctx) });
