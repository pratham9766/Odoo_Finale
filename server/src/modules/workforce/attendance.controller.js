import { crudHandlers } from '../../utils/crud/index.js';
import { approveOvertime, listDay, monthlyRegister, saveAttendance, todayBoard } from './attendance.service.js';
import { corrections, decideCorrection, requestCorrection } from './corrections.service.js';
import { decideLeave, leave } from './leave.service.js';

const id = (req) => req.valid.params.id;

export const bulk = async (req, res) => res.json({ data: await saveAttendance(req.ctx, req.valid.body) });
export const day = async (req, res) => res.json({ data: await listDay(req.ctx, req.valid.query) });
export const today = async (req, res) => res.json({ data: await todayBoard(req.ctx, req.valid.query) });
export const register = async (req, res) => res.json({ data: await monthlyRegister(req.ctx, req.valid.query) });
export const otApprove = async (req, res) => res.json({ data: await approveOvertime(req.ctx, id(req)) });

export const listCorrections = crudHandlers(corrections).list;
export const requestChange = async (req, res) => res.status(201).json({ data: await requestCorrection(req.ctx, req.valid.body) });
export const decideChange = async (req, res) => res.json({ data: await decideCorrection(req.ctx, id(req), req.valid.body) });

export const listLeave = crudHandlers(leave).list;
export const requestLeave = crudHandlers(leave).create;
export const decideLeaveRequest = async (req, res) => res.json({ data: await decideLeave(req.ctx, id(req), req.valid.body) });
