import * as pdf from '../../utils/pdf.js';
import { getInvoice, invoiceFromDispatch, invoicePdfData, listInvoices } from './invoices.service.js';

export const list = async (req, res) => {
  const query = req.valid.query;
  const { rows, total } = await listInvoices(req.ctx, query);
  res.json({ data: rows, meta: { page: query.page, limit: query.limit, total } });
};
export const get = async (req, res) => res.json({ data: await getInvoice(req.ctx, req.valid.params.id) });
export const fromDispatch = async (req, res) => res.status(201).json({ data: await invoiceFromDispatch(req.ctx, req.valid.params.id) });

export async function invoicePdf(req, res) {
  const data = await invoicePdfData(req.ctx, req.valid.params.id);
  pdf.sendPdf(res, await pdf.invoice(data), `invoice-${data.invoice.invoice_no}.pdf`);
}
