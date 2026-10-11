// HTTP handler that plans a confirmed order into work orders.
import { planOrder } from './planning.service.js';

export const plan = async (req, res) =>
  res.status(201).json({ data: { order_id: req.valid.params.id, work_orders: await planOrder(req.ctx, req.valid.params.id) } });
