import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageing, bucketOf } from '../src/modules/finance/receivables.service.js';
import { statementOf } from '../src/modules/reports/pnl.js';
import { columns, pct, totalsOf } from '../src/modules/reports/support.js';
import { toCsv } from '../src/utils/csv.js';
import { daysBetween } from '../src/utils/time.js';

test('ageing buckets count days past due; not yet due belongs to 0-30', () => {
  assert.deepEqual([0, 1, 30, 31, 60, 61, 400].map(bucketOf), ['0-30', '0-30', '0-30', '31-60', '31-60', '60+', '60+']);
  const rows = [
    { outstanding: 1000, days_overdue: 0 }, { outstanding: '2500.50', days_overdue: 12 }, { outstanding: 800, days_overdue: 45 }, { outstanding: 100.1, days_overdue: 90 }, { outstanding: 0.2, days_overdue: 90 },
  ];
  assert.deepEqual(ageing(rows), { '0-30': { count: 2, amount: 3500.5 }, '31-60': { count: 1, amount: 800 }, '60+': { count: 2, amount: 100.3 } });
  assert.deepEqual(ageing([]), { '0-30': { count: 0, amount: 0 }, '31-60': { count: 0, amount: 0 }, '60+': { count: 0, amount: 0 } });
});

test('days between two dates, for days overdue', () => {
  assert.equal(daysBetween('2026-10-01', '2026-10-10'), 9);
  assert.equal(daysBetween('2026-10-10', '2026-10-01'), -9);
  assert.equal(daysBetween('2026-02-27', '2026-03-02'), 3);
  assert.equal(daysBetween('2026-12-31', '2027-01-01'), 1);
});

test('CSV: header, quoting, numbers untouched, dates as ISO, BOM and CRLF for Excel', () => {
  const csv = toCsv([{ key: 'a', label: 'Name' }, { key: 'b', label: 'Qty' }, { key: 'c', label: 'When' }],
    [{ a: 'Smith, John', b: 12.5, c: new Date('2026-10-10T00:00:00Z') }, { a: 'He said "hi"', b: null, c: undefined }, { a: 'line\nbreak', b: 0, c: '' }]);
  assert.equal(csv, '\uFEFFName,Qty,When\r\n"Smith, John",12.5,2026-10-10T00:00:00.000Z\r\n"He said ""hi""",,\r\n"line\nbreak",0,\r\n');
});

test('CSV: text that a spreadsheet would run as a formula is neutralised, real negative numbers are not', () => {
  const csv = toCsv([{ key: 'v', label: 'V' }], [{ v: '=HYPERLINK("http://evil")' }, { v: '+91 98200' }, { v: '-5 off' }, { v: '@SUM(A1)' }, { v: -42.5 }, { v: 'ordinary' }]);
  const lines = csv.slice(1).trim().split('\r\n');
  assert.deepEqual(lines, ['V', '"\'=HYPERLINK(""http://evil"")"', "'+91 98200", "'-5 off", "'@SUM(A1)", '-42.5', 'ordinary']);
});

test('report helpers: totals, percentage, column descriptors', () => {
  assert.deepEqual(totalsOf([{ a: 1.1, b: '2.25' }, { a: 2.2, b: 3 }], ['a', 'b']), { a: 3.3, b: 5.25 });
  assert.equal(pct(1, 3), 33.3);
  assert.equal(pct(5, 0), null);
  assert.equal(pct(0, 10), 0);
  assert.deepEqual(columns(['x', 'X'], ['y', 'Y']), [{ key: 'x', label: 'X' }, { key: 'y', label: 'Y' }]);
});

test('P&L statement: costs are shown as negatives and the lines add up to the net profit', () => {
  const month = { revenue: 426000, material: 213000, wages: 78000, overhead: 21000.5, freight: 9000, expenses: 25000, net_profit: 79999.5 };
  const lines = statementOf(month);
  assert.deepEqual(lines.map((l) => l.line), ['Revenue', 'Raw material', 'Wages', 'Machine overhead', 'Freight', 'Expenses', 'Net profit']);
  assert.equal(lines[1].amount, -213000);
  assert.equal(lines.slice(0, -1).reduce((n, l) => n + l.amount, 0), lines.at(-1).amount);
  assert.equal(lines.at(-1).total, true);
});
