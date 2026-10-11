// HTTP handlers for machine breakdowns and repair tickets.
import { crudHandlers } from '../../utils/crud/index.js';
import { reportBreakdown, resolveTicket, startTicket, tickets } from './maintenance.service.js';

const id = (req) => req.valid.params.id;

export const breakdown = async (req, res) => res.status(201).json({ data: await reportBreakdown(req.ctx, id(req), req.valid.body) });
export const start = async (req, res) => res.json({ data: await startTicket(req.ctx, id(req)) });
export const resolve = async (req, res) => res.json({ data: await resolveTicket(req.ctx, id(req), req.valid.body) });
export const { list, get } = crudHandlers(tickets);
