// Textile unit conversions and wastage maths (overall plan §12).
// Pure functions, no I/O. Weights are kg unless the name says grams.
// Callers round for display; these return full precision.

export const METRES_PER_KG_PER_NE = 1693.3;   // yarn: m per kg = Ne × 1693.3
export const METRES_PER_INCH = 0.0254;

/** Units of measure allowed on items and machine capacities (items.uom check in migration 004). */
export const UOMS = ['kg', 'm', 'roll', 'pcs', 'litre'];

const qtyFormat = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });

/** Round to the 3 decimals of numeric(14,3) quantities. */
export const round3 = (value) => Math.round(value * 1000) / 1000;

/** 1250.5, 'm' → "1,250.5 m" (Indian digit grouping, up to 3 decimals, unit optional). */
export const formatQty = (value, uom) => `${qtyFormat.format(Number(value ?? 0))}${uom ? ` ${uom}` : ''}`;

function positive(name, v) {
  if (!Number.isFinite(v) || v <= 0) throw new RangeError(`${name} must be a positive number, got ${v}`);
}
function pct(name, v) {
  if (!Number.isFinite(v) || v < 0 || v >= 100) throw new RangeError(`${name} must be in [0, 100), got ${v}`);
}

// ---- wastage ---------------------------------------------------------------

/** Input needed to get `output` after a `wastagePct` loss: output ÷ (1 − w%). 10% loss on 100 → 111.1, not 110. */
export function grossInput(output, wastagePct) {
  pct('wastagePct', wastagePct);
  return output / (1 - wastagePct / 100);
}

/** Output left from `input` after a `wastagePct` loss. Inverse of grossInput. */
export function netOutput(input, wastagePct) {
  pct('wastagePct', wastagePct);
  return input * (1 - wastagePct / 100);
}

/** Actual waste % of a finished work order: (1 − output ÷ input) × 100. Null when nothing was issued. */
export function actualWastePct(inputWeight, outputWeight) {
  if (!inputWeight) return null;
  return (1 - outputWeight / inputWeight) * 100;
}

// ---- fabric ----------------------------------------------------------------

export function inchesToMetres(inches) {
  return inches * METRES_PER_INCH;
}

/** Grams per running metre: GSM × width. 120 GSM × 1.47 m → 176.4 g/m. */
export function fabricGramsPerMetre(widthM, gsm) {
  positive('widthM', widthM); positive('gsm', gsm);
  return widthM * gsm;
}

/** kg = m × width_m × GSM ÷ 1000 */
export function fabricMetresToKg(metres, widthM, gsm) {
  return (metres * fabricGramsPerMetre(widthM, gsm)) / 1000;
}

/** m = kg × 1000 ÷ (width_m × GSM) */
export function fabricKgToMetres(kg, widthM, gsm) {
  return (kg * 1000) / fabricGramsPerMetre(widthM, gsm);
}

/**
 * Input needed from one BOM line to make `outputQty` of the BOM's output: net qty per output unit, grossed up for the
 * line's loss. The one formula behind explode() (backend plan §11.4) and the material issue at work order start.
 * @param {{ qty: number, wastage_pct: number }} line
 */
export function bomInputQty(outputQty, line, bomOutputQty = 1) {
  return grossInput((outputQty * line.qty) / bomOutputQty, line.wastage_pct);
}

/**
 * An order-line quantity in the unit the item is stored in (items.uom), e.g. 40 rolls → 2,000 m, 500 kg → metres.
 * `item` needs uom plus roll_length_m (rolls) or width_m and gsm (kg ↔ m). Throws RangeError when it cannot be done.
 */
export function convertQty(qty, from, item) {
  const to = item.uom;
  if (from === to) return qty;
  const need = (...fields) => {
    const missing = fields.filter((f) => !(Number(item[f]) > 0));
    if (missing.length) throw new RangeError(`Cannot convert ${from} to ${to} for ${item.name}: ${missing.join(' and ')} not set on the item`);
  };

  let metres;                                    // everything goes through metres
  if (from === 'm') metres = qty;
  else if (from === 'roll') { need('roll_length_m'); metres = rollsToMetres(qty, item.roll_length_m); }
  else if (from === 'kg') { need('width_m', 'gsm'); metres = fabricKgToMetres(qty, item.width_m, item.gsm); }
  else throw new RangeError(`Cannot convert ${from} to ${to} for ${item.name}`);

  if (to === 'm') return metres;
  if (to === 'kg') { need('width_m', 'gsm'); return fabricMetresToKg(metres, item.width_m, item.gsm); }
  if (to === 'roll') { need('roll_length_m'); return metres / item.roll_length_m; }
  throw new RangeError(`Cannot convert ${from} to ${to} for ${item.name}`);
}

// ---- yarn ------------------------------------------------------------------

/** Metres of yarn per kg for an English cotton count (Ne). */
export function yarnMetresPerKg(ne) {
  positive('ne', ne);
  return ne * METRES_PER_KG_PER_NE;
}

export function yarnKgToMetres(kg, ne) {
  return kg * yarnMetresPerKg(ne);
}

export function yarnMetresToKg(metres, ne) {
  return metres / yarnMetresPerKg(ne);
}

/** Split a yarn requirement by warp share: 340 g at 55% → { warp: 187, weft: 153 }. */
export function splitWarpWeft(totalKg, warpPct) {
  pct('warpPct', warpPct);
  const warp = (totalKg * warpPct) / 100;
  return { warp, weft: totalKg - warp };
}

// ---- dye -------------------------------------------------------------------

/** dye kg = fabric kg × shade % (a 2% shade on 293 kg → 5.86 kg). */
export function dyeKg(fabricKg, shadePct) {
  pct('shadePct', shadePct);
  return (fabricKg * shadePct) / 100;
}

// ---- rolls -----------------------------------------------------------------

/** Nominal metres in `rolls` rolls of `rollLengthM` each (use rollsTotalMetres when actual lengths are known). */
export function rollsToMetres(rolls, rollLengthM) {
  positive('rollLengthM', rollLengthM);
  return rolls * rollLengthM;
}

/** Whole rolls needed to cover `metres` at a nominal roll length. */
export function metresToRolls(metres, rollLengthM) {
  positive('rollLengthM', rollLengthM);
  return Math.ceil(metres / rollLengthM);
}

/** Sum of actual roll lengths, e.g. for invoice qty. Accepts numbers or `{ length_m }` rows (pg numerics arrive as strings).
 *  Rounded to 2 dp to match rolls.length_m numeric(10,2). */
export function rollsTotalMetres(rolls) {
  const sum = rolls.reduce((acc, r) => acc + Number(typeof r === 'object' ? r.length_m : r), 0);
  return Math.round(sum * 100) / 100;
}
