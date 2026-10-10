// PDF documents (pdfkit). Every builder takes plain data and resolves to a Buffer;
// callers decide whether to stream it or upload it to Storage `documents/<org_id>/...`.
//
//   import * as pdf from '../utils/pdf.js';
//   const buf = await pdf.invoice({ invoice, seller, buyer, lines });
//
// Numbers may arrive as strings (pg numeric); every formatter coerces with Number().
// Built-in Helvetica has no ₹ glyph, so amounts print as "Rs.".
//
// Skeleton status (backend plan §22.3): signatures and input shapes are fixed now.
// Layouts are basic and get finished in their build steps: roll label (step 5),
// invoice + packing list (step 6: GST layout, amount in words), payslip (step 7).
// QR codes are drawn as vector squares from the `qrcode` package's module matrix, so they stay sharp at any print size.

import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { formatAmount, formatINR } from './money.js';
import { formatQty } from './textile.js';
import { formatDate, formatMonth } from './time.js';

export const MM = 72 / 25.4;                 // pdfkit works in points
const A4_MARGIN = 40;

// ---- formatting --------------------------------------------------------------

export const fmt = {
  money: (v) => formatINR(v, 'Rs. '),
  amount: formatAmount,
  qty: formatQty,
  date: formatDate,
  month: formatMonth,
};

// ---- core --------------------------------------------------------------------

/** Send a generated PDF to the browser (opens inline; the filename is only used if the user saves it). */
export function sendPdf(res, buffer, filename) {
  res.type('application/pdf')
    .set('Content-Disposition', `inline; filename="${filename.replace(/[^\w.-]/g, '_')}"`)
    .set('Cache-Control', 'private, no-store')      // badges carry QR tokens, invoices carry prices
    .send(buffer);
}

/** Run `draw(doc)` on a fresh document and collect the output into a Buffer. */
export function render(options, draw) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: A4_MARGIN, ...options });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      draw(doc);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

const contentWidth = (doc) => doc.page.width - doc.page.margins.left - doc.page.margins.right;
const bottomLimit = (doc) => doc.page.height - doc.page.margins.bottom;

/** Org name on the left, document title and number on the right, rule underneath. */
function header(doc, { org, title, number }) {
  const x = doc.page.margins.left, y = doc.page.margins.top, w = contentWidth(doc);
  doc.font('Helvetica-Bold').fontSize(16).text(org?.name ?? '', x, y, { width: w * 0.6 });
  doc.font('Helvetica').fontSize(8).text(addressLine(org), { width: w * 0.6 });
  if (org?.gstin) doc.text(`GSTIN: ${org.gstin}`, { width: w * 0.6 });
  doc.font('Helvetica-Bold').fontSize(14).text(title, x + w * 0.6, y, { width: w * 0.4, align: 'right' });
  if (number) doc.font('Helvetica').fontSize(10).text(number, { width: w * 0.4, align: 'right' });
  const ruleY = Math.max(doc.y, y + 44) + 6;
  doc.moveTo(x, ruleY).lineTo(x + w, ruleY).lineWidth(0.8).stroke();
  doc.x = x;
  doc.y = ruleY + 10;
}

function addressLine(p) {
  return [p?.address, p?.city, p?.state, p?.pincode].filter(Boolean).join(', ');
}

/** Two party boxes side by side (e.g. Billed by / Billed to). */
function parties(doc, left, right) {
  const x = doc.page.margins.left, y = doc.y, w = contentWidth(doc) / 2 - 6;
  const block = (bx, { label, party }) => {
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#555').text(label.toUpperCase(), bx, y, { width: w });
    doc.fillColor('#000').font('Helvetica-Bold').fontSize(10).text(party?.name ?? '-', { width: w });
    doc.font('Helvetica').fontSize(9);
    const addr = addressLine(party);
    if (addr) doc.text(addr, { width: w });
    if (party?.gstin) doc.text(`GSTIN: ${party.gstin}`, { width: w });
    if (party?.phone) doc.text(`Phone: ${party.phone}`, { width: w });
    return doc.y;
  };
  const endY = Math.max(block(x, left), block(x + w + 12, right));
  doc.x = x;
  doc.y = endY + 12;
}

/** Label: value rows, two per line. */
function keyValues(doc, pairs) {
  const x = doc.page.margins.left, colW = contentWidth(doc) / 2;
  const shown = pairs.filter(([, v]) => v !== undefined && v !== null && v !== '');
  for (let i = 0; i < shown.length; i += 2) {
    const y = doc.y;
    shown.slice(i, i + 2).forEach(([k, v], j) => {
      doc.font('Helvetica-Bold').fontSize(9).text(`${k}: `, x + j * colW, y, { continued: true, width: colW - 8 });
      doc.font('Helvetica').text(String(v));
    });
    doc.y = Math.max(doc.y, y + 12);
  }
  doc.x = x;
  doc.moveDown(0.6);
}

/**
 * Simple ruled table with page breaks.
 * columns: [{ key, label, width (fraction of content width), align?, format?(value, row, index) }]
 */
function table(doc, columns, rows) {
  const x0 = doc.page.margins.left, w = contentWidth(doc), pad = 4;
  const widths = columns.map((c) => c.width * w);
  const cellText = (c, row, i) => (c.format ? c.format(row[c.key], row, i) : String(row[c.key] ?? ''));

  const drawRow = (cells, { bold = false, shade = false } = {}) => {
    const font = () => doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
    font();
    const h = Math.max(...cells.map((t, i) => doc.heightOfString(t, { width: widths[i] - 2 * pad }))) + 2 * pad;
    if (doc.y + h > bottomLimit(doc)) {
      doc.addPage();
      if (!bold) drawRow(columns.map((c) => c.label), { bold: true, shade: true });   // repeat header
      font();                                                                           // header left the font bold
    }
    const y = doc.y;
    if (shade) doc.rect(x0, y, w, h).fill('#eeeeee').fillColor('#000');
    let x = x0;
    cells.forEach((t, i) => {
      doc.text(t, x + pad, y + pad, { width: widths[i] - 2 * pad, align: columns[i].align ?? 'left' });
      x += widths[i];
    });
    doc.moveTo(x0, y + h).lineTo(x0 + w, y + h).lineWidth(0.4).strokeColor('#999').stroke().strokeColor('#000');
    doc.y = y + h;
  };

  drawRow(columns.map((c) => c.label), { bold: true, shade: true });
  rows.forEach((row, i) => drawRow(columns.map((c) => cellText(c, row, i))));
  doc.x = x0;
  doc.moveDown(0.8);
}

/** Right-aligned label / amount lines under a table (subtotal, tax, total). */
function totals(doc, lines) {
  const x0 = doc.page.margins.left, w = contentWidth(doc);
  for (const [label, value, bold] of lines) {
    const y = doc.y;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 9);
    doc.text(label, x0 + w * 0.5, y, { width: w * 0.3, align: 'right' });
    doc.text(value, x0 + w * 0.8, y, { width: w * 0.2, align: 'right' });
    doc.y = Math.max(doc.y, y + 12);
  }
  doc.x = x0;
  doc.moveDown(0.8);
}

function footer(doc, text) {
  doc.font('Helvetica').fontSize(8).fillColor('#666')
    .text(text, doc.page.margins.left, doc.y, { width: contentWidth(doc), align: 'center' })
    .fillColor('#000');
}

/** QR code for `text` in a `size`-point square at (x, y), including the 2-module quiet zone scanners need. */
function drawQr(doc, text, x, y, size) {
  const { modules } = QRCode.create(String(text), { errorCorrectionLevel: 'M' });
  const quiet = 2;
  const cell = size / (modules.size + 2 * quiet);
  for (let row = 0; row < modules.size; row++) {
    for (let col = 0; col < modules.size; col++) {
      if (modules.get(row, col)) doc.rect(x + (col + quiet) * cell, y + (row + quiet) * cell, cell, cell);
    }
  }
  doc.fill('#000');
}

// ---- documents ---------------------------------------------------------------

const INVOICE_TITLES = { sales: 'TAX INVOICE', supply: 'TAX INVOICE', freight: 'FREIGHT INVOICE' };

/**
 * Sales, supply or freight invoice.
 * @param {{
 *   invoice: { invoice_no, kind: 'sales'|'supply'|'freight', invoice_date, due_date, subtotal, tax, total },
 *   seller: { name, gstin?, address?, city?, state?, pincode?, phone? },
 *   buyer:  { name, gstin?, address?, city?, state?, pincode?, phone? },
 *   lines:  Array<{ description, qty, uom, rate, tax_pct, amount }>,
 *   refs?:  { order_no?, dispatch_no?, po_no?, trip_no?, vehicle_no? }
 * }} data
 * @returns {Promise<Buffer>}
 */
export function invoice({ invoice: inv, seller, buyer, lines, refs = {} }) {
  return render({ info: { Title: `Invoice ${inv.invoice_no}` } }, (doc) => {
    header(doc, { org: seller, title: INVOICE_TITLES[inv.kind] ?? 'INVOICE', number: inv.invoice_no });
    keyValues(doc, [
      ['Invoice date', fmt.date(inv.invoice_date)], ['Due date', fmt.date(inv.due_date)],
      ['Order', refs.order_no], ['Dispatch', refs.dispatch_no],
      ['PO', refs.po_no], ['Trip', refs.trip_no], ['Vehicle', refs.vehicle_no],
    ]);
    parties(doc, { label: 'Billed by', party: seller }, { label: 'Billed to', party: buyer });
    table(doc, [
      { key: 'n', label: '#', width: 0.05, format: (_, __, i) => String(i + 1) },
      { key: 'description', label: 'Description', width: 0.39 },
      { key: 'qty', label: 'Qty', width: 0.14, align: 'right', format: (v, r) => fmt.qty(v, r.uom) },
      { key: 'rate', label: 'Rate', width: 0.13, align: 'right', format: fmt.amount },
      { key: 'tax_pct', label: 'GST %', width: 0.09, align: 'right', format: (v) => `${Number(v ?? 0)}%` },
      { key: 'amount', label: 'Amount', width: 0.2, align: 'right', format: fmt.amount },
    ], lines);
    totals(doc, [
      ['Subtotal', fmt.money(inv.subtotal)],
      ['GST', fmt.money(inv.tax)],
      ['Total', fmt.money(inv.total), true],
    ]);
    footer(doc, 'This is a computer-generated invoice.');
  });
}

/**
 * Packing list / delivery challan for a dispatch: one row per scanned roll.
 * @param {{
 *   dispatch: { dispatch_no, confirmed_at?, created_at?, vehicle_no?, driver_name?, driver_phone? },
 *   seller: object, buyer: object,
 *   order?: { order_no },
 *   rolls: Array<{ roll_no, item, colour?, length_m, weight_kg? }>
 * }} data
 * @returns {Promise<Buffer>}
 */
export function packingList({ dispatch, seller, buyer, order = {}, rolls }) {
  return render({ info: { Title: `Packing list ${dispatch.dispatch_no}` } }, (doc) => {
    header(doc, { org: seller, title: 'PACKING LIST', number: dispatch.dispatch_no });
    keyValues(doc, [
      ['Date', fmt.date(dispatch.confirmed_at ?? dispatch.created_at)], ['Order', order.order_no],
      ['Vehicle', dispatch.vehicle_no], ['Driver', [dispatch.driver_name, dispatch.driver_phone].filter(Boolean).join(' · ')],
    ]);
    parties(doc, { label: 'From', party: seller }, { label: 'Deliver to', party: buyer });
    table(doc, [
      { key: 'n', label: '#', width: 0.06, format: (_, __, i) => String(i + 1) },
      { key: 'roll_no', label: 'Roll no', width: 0.2 },
      { key: 'item', label: 'Item', width: 0.32 },
      { key: 'colour', label: 'Colour', width: 0.14 },
      { key: 'length_m', label: 'Length (m)', width: 0.14, align: 'right', format: (v) => fmt.qty(v) },
      { key: 'weight_kg', label: 'Weight (kg)', width: 0.14, align: 'right', format: (v) => (v == null ? '' : fmt.qty(v)) },
    ], rolls);
    const totalM = rolls.reduce((s, r) => s + Number(r.length_m ?? 0), 0);
    const totalKg = rolls.reduce((s, r) => s + Number(r.weight_kg ?? 0), 0);
    totals(doc, [
      ['Rolls', String(rolls.length)],
      ['Total length', fmt.qty(totalM, 'm'), true],
      ...(totalKg ? [['Total weight', fmt.qty(totalKg, 'kg')]] : []),
    ]);
    footer(doc, 'Received the above rolls in good condition.   Receiver signature: ____________________');
  });
}

/**
 * Roll QR label, 60 × 40 mm.
 * @param {{
 *   roll: { roll_no, qr_token, length_m, weight_kg?, dye_batch? },
 *   item: { name, colour? }, order?: { order_no }, org?: { name }
 * }} data
 * @returns {Promise<Buffer>}
 */
export function rollLabel({ roll, item, order = {}, org = {} }) {
  const W = 60 * MM, H = 40 * MM, m = 2.5 * MM, qr = H - 2 * m;
  return render({ size: [W, H], margin: m, info: { Title: `Roll ${roll.roll_no}` } }, (doc) => {
    drawQr(doc, roll.qr_token, m, m, qr);
    const x = m + qr + 2 * MM, w = W - x - m;
    doc.font('Helvetica-Bold').fontSize(9).text(roll.roll_no, x, m, { width: w, lineBreak: false });
    doc.font('Helvetica').fontSize(6.5);
    for (const line of [
      item.name, item.colour, `${fmt.qty(roll.length_m, 'm')}${roll.weight_kg ? ` · ${fmt.qty(roll.weight_kg, 'kg')}` : ''}`,
      roll.dye_batch ? `Batch ${roll.dye_batch}` : null, order.order_no, org.name,
    ].filter(Boolean)) {
      doc.text(line, x, doc.y + 1, { width: w, height: 9, ellipsis: true, lineBreak: false });
    }
  });
}

/**
 * Worker ID badge (credit-card size, 86 × 54 mm) with the kiosk QR.
 * @param {{
 *   worker: { name, emp_code, qr_token, stage?, shift? },
 *   org: { name }, photo?: Buffer
 * }} data
 * @returns {Promise<Buffer>}
 */
export function badge({ worker, org, photo }) {
  const W = 86 * MM, H = 54 * MM, m = 3 * MM, qr = 22 * MM;
  return render({ size: [W, H], margin: m, info: { Title: `Badge ${worker.emp_code}` } }, (doc) => {
    doc.rect(0, 0, W, 9 * MM).fill('#1f3b57').fillColor('#fff');
    doc.font('Helvetica-Bold').fontSize(10).text(org.name, m, 3 * MM, { width: W - 2 * m, lineBreak: false, ellipsis: true });
    doc.fillColor('#000');
    const top = 12 * MM, photoW = 18 * MM, photoH = 22 * MM;
    if (photo) doc.image(photo, m, top, { fit: [photoW, photoH], align: 'center', valign: 'center' });
    else doc.rect(m, top, photoW, photoH).lineWidth(0.5).stroke();
    const x = m + photoW + 3 * MM, w = W - x - qr - 2 * m;
    doc.font('Helvetica-Bold').fontSize(9).text(worker.name, x, top, { width: w });
    doc.font('Helvetica').fontSize(7.5).text(worker.emp_code, { width: w });
    if (worker.stage) doc.text(worker.stage, { width: w });
    if (worker.shift) doc.text(`Shift ${worker.shift}`, { width: w });
    drawQr(doc, worker.qr_token, W - m - qr, top, qr);
  });
}

/**
 * Monthly payslip for one worker.
 * @param {{
 *   org: object,
 *   worker: { name, emp_code, wage_type: 'daily'|'hourly'|'piece', rate, ot_rate, piece_rate },
 *   month: string|Date,                           // first day of month
 *   line: { days, half_days, hours, ot_hours, pieces, gross, advances, deductions, net },
 *   status?: 'draft'|'approved'|'paid'
 * }} data
 * @returns {Promise<Buffer>}
 */
export function payslip({ org, worker, month, line, status }) {
  return render({ info: { Title: `Payslip ${worker.emp_code} ${fmt.month(month)}` } }, (doc) => {
    header(doc, { org, title: 'PAYSLIP', number: fmt.month(month) });
    keyValues(doc, [
      ['Worker', worker.name], ['Emp code', worker.emp_code],
      ['Wage type', worker.wage_type], ['Status', status],
    ]);
    const basis = {
      daily: ['Days worked', fmt.qty(line.days), fmt.amount(worker.rate)],
      hourly: ['Hours worked', fmt.qty(line.hours), fmt.amount(worker.rate)],
      piece: ['Pieces', fmt.qty(line.pieces), fmt.amount(worker.piece_rate)],
    }[worker.wage_type];
    table(doc, [
      { key: 'label', label: 'Earnings', width: 0.5 },
      { key: 'units', label: 'Units', width: 0.25, align: 'right' },
      { key: 'rate', label: 'Rate', width: 0.25, align: 'right' },
    ], [
      ...(basis ? [{ label: basis[0], units: basis[1], rate: basis[2] }] : []),
      ...(Number(line.half_days) ? [{ label: 'Half days (in days above)', units: String(line.half_days), rate: '' }] : []),
      { label: 'Overtime hours', units: fmt.qty(line.ot_hours), rate: fmt.amount(worker.ot_rate) },
    ]);
    totals(doc, [
      ['Gross', fmt.money(line.gross)],
      ['Advances recovered', `- ${fmt.money(line.advances)}`],
      ['Deductions', `- ${fmt.money(line.deductions)}`],
      ['Net pay', fmt.money(line.net), true],
    ]);
    footer(doc, 'This is a computer-generated payslip.');
  });
}
