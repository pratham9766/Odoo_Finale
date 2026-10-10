// Money helpers. Amounts are INR numeric(14,2); values from pg may be numbers or strings.

const grouped = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Round to paise. EPSILON keeps 1.005 → 1.01 instead of 1.00. */
export const round2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

/** 1234567.5 → "12,34,567.50" (Indian digit grouping). */
export const formatAmount = (v) => grouped.format(Number(v ?? 0));

/** 1234567.5 → "₹12,34,567.50". PDFs pass symbol "Rs. " because the built-in fonts have no ₹ glyph. */
export const formatINR = (v, symbol = '₹') => `${symbol}${formatAmount(v)}`;
