import { sendPdf } from '../../utils/pdf.js';
import * as wages from './wages.service.js';

const id = (req) => req.valid.params.id;

export const listRuns = async (req, res) => res.json({ data: (await wages.listRuns(req.ctx)).rows });
export const prepare = async (req, res) => res.status(201).json({ data: await wages.prepareRun(req.ctx, req.valid.body) });
export const getRun = async (req, res) => res.json({ data: await wages.getRun(req.ctx, id(req)) });
export const approve = async (req, res) => res.json({ data: await wages.approveRun(req.ctx, id(req)) });
export const pay = async (req, res) => res.json({ data: await wages.payRun(req.ctx, id(req)) });

/** PDF by default (what the worker prints); ?format=json for the screen. */
export async function payslip(req, res) {
  const { workerId } = req.valid.params, { month, format } = req.valid.query;
  if (format === 'json') return res.json({ data: await wages.payslipData(req.ctx, workerId, month) });
  const { buffer, filename } = await wages.payslipPdf(req.ctx, workerId, month);
  sendPdf(res, buffer, filename);
}
