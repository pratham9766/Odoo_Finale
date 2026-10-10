// owner: Hrishikesh (shared helpers; extend freely)
export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const round3 = (n) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;

export const inr = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n ?? 0);

// GST-style line: amount = qty × rate, tax on top
export function lineAmount(qty, rate, taxPct = 0) {
  const amount = round2(qty * rate);
  const tax = round2((amount * taxPct) / 100);
  return { amount, tax, total: round2(amount + tax) };
}
