// Client-side check of an order form's lines before it is sent (the server validates again).
export function validateLines(lines) {
  if (!Array.isArray(lines) || !lines.length) return 'Add at least one fabric or material line.';
  if (lines.some(line => !line.item_id || !line.uom || !Number.isFinite(Number(line.qty)) || Number(line.qty) <= 0)) return 'Every line needs an item, unit and quantity greater than zero.';
  if (lines.some(line => line.rate != null && (!Number.isFinite(Number(line.rate)) || Number(line.rate) < 0))) return 'Rates must be zero or greater.';
  return null;
}
