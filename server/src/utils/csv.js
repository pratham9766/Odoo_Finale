// CSV for report exports. Excel is the usual reader, so: a UTF-8 BOM (₹ and Indian names survive), CRLF line ends,
// quotes where needed, and a guard against spreadsheet formula injection (a text cell starting with = + - @ would run as a formula).

const BOM = String.fromCharCode(0xfeff);                    // tells Excel the file is UTF-8
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  let text = String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * @param {Array<{ key: string, label: string }>} columns
 * @param {Array<object>} rows
 */
export function toCsv(columns, rows) {
  const lines = [columns.map((c) => cell(c.label)), ...rows.map((row) => columns.map((c) => cell(row[c.key])))];
  return `${BOM}${lines.map((l) => l.join(',')).join('\r\n')}\r\n`;
}

/** Send a CSV as a download. */
export function sendCsv(res, filename, csv) {
  res.type('text/csv; charset=utf-8')
    .set('Content-Disposition', `attachment; filename="${filename.replace(/[^\w.-]/g, '_')}"`)
    .set('Cache-Control', 'private, no-store')
    .send(csv);
}
