// CONTRACT STUB (owner: Hrishikesh) — signatures agreed in §22.2:
//   pdf.invoice(data), pdf.packingList(data), pdf.rollLabel(data), pdf.badge(data), pdf.payslip(data)
// Each returns Promise<Buffer>. These produce a plain text layout so callers work today;
// Hrishikesh replaces the bodies with the real layouts.
import PDFDocument from 'pdfkit';

function render(build, opts = { size: 'A4', margin: 40 }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument(opts);
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    build(doc);
    doc.end();
  });
}

const dump = (title) => (data) =>
  render((doc) => {
    doc.fontSize(16).text(title).moveDown();
    doc.fontSize(9).text(JSON.stringify(data, null, 2));
  });

export const invoice = dump('Tax Invoice');
export const packingList = dump('Packing List / Delivery Challan');
export const rollLabel = dump('Roll Label');
export const badge = dump('Worker Badge');
export const payslip = dump('Payslip');

export default { invoice, packingList, rollLabel, badge, payslip };
