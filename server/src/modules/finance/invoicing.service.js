// Invoice from what was physically scanned onto a dispatch: quantity = the roll lengths, rate from the order line.

import { AppError } from '../../utils/errors.js';
import { round2 } from '../../utils/money.js';
import { nextNumber } from '../../utils/numbering.js';
import { convertQty } from '../../utils/textile.js';
import { addDays, istParts } from '../../utils/time.js';

const DEFAULT_TAX_PCT = 5;                // GST on fabric; the mill can override with settings.tax_pct
export const PAYMENT_TERMS_DAYS = 30;

/** One line per order line: Σ roll lengths in the order line's unit × its rate. */
async function invoiceLines(db, dispatchId, taxPct) {
  const { rows } = await db.query(
    `select l.id as order_line_id, l.item_id, l.rate, l.uom, l.colour, l.description, i.name, i.uom as item_uom, i.width_m, i.gsm, i.roll_length_m,
            sum(dr.length_m)::numeric as metres
       from dispatch_rolls dr join rolls r on r.id = dr.roll_id join order_lines l on l.id = r.order_line_id join items i on i.id = l.item_id
      where dr.dispatch_id = $1 group by l.id, i.id order by i.name, l.colour, l.id`, [dispatchId]);
  return rows.map((row) => {
    const qty = round2(convertQty(Number(row.metres), 'm', { name: row.name, uom: row.uom, width_m: row.width_m, gsm: row.gsm, roll_length_m: row.roll_length_m }));
    return {
      item_id: row.item_id, uom: row.uom, qty, rate: Number(row.rate), tax_pct: taxPct, amount: round2(qty * Number(row.rate)),
      description: row.description ?? `${row.name}${row.colour ? ` ${row.colour}` : ''}`,
    };
  });
}

/**
 * Create the sales invoice for a dispatch being confirmed. Runs inside the confirm transaction.
 * @returns the invoice row (with `lines`)
 */
export async function createInvoiceFromDispatch(db, ctx, dispatch, at) {
  const { rows: [mill] } = await db.query(`select settings from mill`);
  const taxPct = Number(mill.settings?.tax_pct ?? DEFAULT_TAX_PCT);
  const lines = await invoiceLines(db, dispatch.id, taxPct);
  if (!lines.length) throw new AppError(422, 'VALIDATION_FAILED', `Dispatch ${dispatch.dispatch_no} has no rolls to invoice`);

  const subtotal = round2(lines.reduce((sum, l) => sum + l.amount, 0));
  const tax = round2(lines.reduce((sum, l) => sum + (l.amount * l.tax_pct) / 100, 0));
  const today = istParts(at).date;

  const { rows: [invoice] } = await db.query(
    `insert into invoices (invoice_no, buyer_contact_id, order_id, dispatch_id, invoice_date, due_date,
                           subtotal, tax, total, created_at, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning *`,
    [await nextNumber(db, mill.settings?.invoice_prefix ?? 'INV'), dispatch.to_contact_id, dispatch.order_id, dispatch.id,
     today, addDays(today, PAYMENT_TERMS_DAYS), subtotal, tax, round2(subtotal + tax), at, ctx.userId]);

  for (const l of lines) {
    await db.query(
      `insert into invoice_lines (invoice_id, item_id, description, qty, uom, rate, tax_pct, amount)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [invoice.id, l.item_id, l.description, l.qty, l.uom, l.rate, l.tax_pct, l.amount]);
  }
  return { ...invoice, lines };
}
