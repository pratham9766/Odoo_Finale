import { sendPdf } from '../../utils/pdf.js';
import { badgePdf } from './workers.service.js';

export async function badge(req, res) {
  const { buffer, filename } = await badgePdf(req.ctx, req.valid.params.id);
  sendPdf(res, buffer, filename);
}
