import { approveOvertime, listDay, monthlyRegister, saveAttendance, todayBoard } from './attendance.service.js';

const id = (req) => req.valid.params.id;

export const bulk = async (req, res) => res.json({ data: await saveAttendance(req.ctx, req.valid.body) });
export const day = async (req, res) => res.json({ data: await listDay(req.ctx, req.valid.query) });
export const today = async (req, res) => res.json({ data: await todayBoard(req.ctx, req.valid.query) });
export const register = async (req, res) => res.json({ data: await monthlyRegister(req.ctx, req.valid.query) });
export const otApprove = async (req, res) => res.json({ data: await approveOvertime(req.ctx, id(req)) });
