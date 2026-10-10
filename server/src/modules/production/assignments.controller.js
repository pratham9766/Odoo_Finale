import { assignments } from './assignments.service.js';

export const save = async (req, res) => res.json({ data: await assignments.save(req.ctx, req.valid.body) });
