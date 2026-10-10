import * as pdf from '../../utils/pdf.js';
import { confirmDispatch } from './confirm.service.js';
import * as svc from './dispatches.service.js';

const id = (req) => req.valid.params.id;

export const list = async (req, res) => {
  const query = req.valid.query;
  const { rows, total } = await svc.listDispatches(req.ctx, query);
  res.json({ data: rows, meta: { page: query.page, limit: query.limit, total } });
};
export const create = async (req, res) => res.status(201).json({ data: await svc.createDispatch(req.ctx, req.valid.body) });
export const get = async (req, res) => res.json({ data: await svc.getDispatch(req.ctx, id(req)) });
export const scan = async (req, res) => res.status(201).json({ data: await svc.scanRoll(req.ctx, id(req), req.valid.body) });
export const removeRoll = async (req, res) => res.json({ data: await svc.removeRoll(req.ctx, id(req), req.valid.params.rollId) });
export const confirm = async (req, res) => res.json({ data: await confirmDispatch(req.ctx, id(req)) });
export const status = async (req, res) => res.json({ data: await svc.updateStatus(req.ctx, id(req), req.valid.body.status) });

export async function packingList(req, res) {
  const data = await svc.packingListData(req.ctx, id(req));
  pdf.sendPdf(res, await pdf.packingList(data), `packing-list-${data.dispatch.dispatch_no}.pdf`);
}
