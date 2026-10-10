import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as pdf from '../src/utils/pdf.js';

const party = { name: 'Everest Textile Mills', gstin: '24AAACE4567F1Z2', city: 'Surat' };
const isPdf = (buf) => Buffer.isBuffer(buf) && buf.subarray(0, 5).toString() === '%PDF-' && buf.length > 500;
const pages = (buf) => (buf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;

test('every document builder returns a PDF buffer', async () => {
  const docs = {
    invoice: await pdf.invoice({
      invoice: { invoice_no: 'INV-2026-0001', kind: 'sales', invoice_date: '2026-10-10', due_date: '2026-11-09', subtotal: 1000, tax: 50, total: 1050 },
      seller: party, buyer: { name: 'Urban Threads' }, lines: [{ description: 'Poplin', qty: 10, uom: 'm', rate: 100, tax_pct: 5, amount: 1000 }],
    }),
    packingList: await pdf.packingList({
      dispatch: { dispatch_no: 'DSP-2026-0001' }, seller: party, buyer: { name: 'Urban Threads' }, rolls: [{ roll_no: 'R-1-001', item: 'Poplin', length_m: 50 }],
    }),
    rollLabel: await pdf.rollLabel({ roll: { roll_no: 'R-1-001', qr_token: 'abcDEF123456_-xy', length_m: 50 }, item: { name: 'Poplin' } }),
    badge: await pdf.badge({ worker: { name: 'Anil Kumar', emp_code: 'EMP-0001', qr_token: 'abcDEF123456_-xy' }, org: { name: 'Everest' } }),
    payslip: await pdf.payslip({
      org: party, worker: { name: 'Anil Kumar', emp_code: 'EMP-0001', wage_type: 'daily', rate: 650, ot_rate: 120, piece_rate: 0 }, month: '2026-09-01',
      line: { days: 24, half_days: 0, hours: 192, ot_hours: 4, pieces: 0, gross: 16080, advances: 0, deductions: 0, net: 16080 },
    }),
  };
  for (const [name, buf] of Object.entries(docs)) assert.ok(isPdf(buf), `${name} is not a PDF`);
});

test('a long invoice flows onto more pages and repeats the header row', async () => {
  const lines = Array.from({ length: 80 }, (_, i) => ({ description: `Item ${i + 1}`, qty: 1, uom: 'm', rate: 10, tax_pct: 5, amount: 10 }));
  const buf = await pdf.invoice({
    invoice: { invoice_no: 'INV-1', kind: 'sales', invoice_date: '2026-10-10', due_date: '2026-11-09', subtotal: 800, tax: 40, total: 840 },
    seller: party, buyer: { name: 'B' }, lines,
  });
  assert.ok(pages(buf) >= 2);
});

test('label and badge are single, small pages (60×40 mm and 86×54 mm)', async () => {
  const label = await pdf.rollLabel({ roll: { roll_no: 'R-1-001', qr_token: 'tok', length_m: 50 }, item: { name: 'A very long fabric name that must be cut off, not wrapped' }, org: { name: 'Everest' } });
  const badge = await pdf.badge({ worker: { name: 'A Very Long Worker Name Indeed', emp_code: 'EMP-0001', qr_token: 'tok' }, org: { name: 'Everest Textile Mills Private Limited' } });
  assert.equal(pages(label), 1);
  assert.equal(pages(badge), 1);
  const mediaBox = (buf) => buf.toString('latin1').match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/).slice(1).map(Number);
  const [lw, lh] = mediaBox(label), [bw, bh] = mediaBox(badge);
  assert.ok(Math.abs(lw / pdf.MM - 60) < 0.1 && Math.abs(lh / pdf.MM - 40) < 0.1, `label ${lw / pdf.MM} × ${lh / pdf.MM} mm`);
  assert.ok(Math.abs(bw / pdf.MM - 86) < 0.1 && Math.abs(bh / pdf.MM - 54) < 0.1, `badge ${bw / pdf.MM} × ${bh / pdf.MM} mm`);
});

test('sendPdf sets inline PDF headers, forbids caching and sanitises the filename', () => {
  const headers = {};
  const res = { type(t) { headers.type = t; return this; }, set(k, v) { headers[k] = v; return this; }, send(b) { headers.body = b; return this; } };
  pdf.sendPdf(res, Buffer.from('%PDF-x'), 'badge EMP/0001"; evil.pdf');
  assert.equal(headers.type, 'application/pdf');
  assert.equal(headers['Content-Disposition'], 'inline; filename="badge_EMP_0001___evil.pdf"');
  assert.match(headers['Cache-Control'], /no-store/);
  assert.equal(headers.body.toString(), '%PDF-x');
});
