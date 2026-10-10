// Textile conversion helpers (for BOM editor and calculator)
// These are illustrative conversions — always use BOM-stored quantities
// as the authoritative source. Treat conversions as estimates unless
// width and GSM are known precisely.

/**
 * Convert fabric metres to kg.
 * Requires known width and GSM.
 */
export function mToKg(metres, widthM, gsm) {
  if (!widthM || !gsm) return null;
  return (metres * widthM * gsm) / 1000;
}

/**
 * Convert kg to metres.
 */
export function kgToM(kg, widthM, gsm) {
  if (!widthM || !gsm) return null;
  return (kg * 1000) / (widthM * gsm);
}

/**
 * English count yarn — metres per kg (Ne × 1693.3)
 */
export function yarnMetresPerKg(ne) {
  return ne * 1693.3;
}

/**
 * Gross input required given output and wastage %.
 * Formula: input = output / (1 - wastage_pct/100)
 * Use divide, not multiply — 10% loss on 100 kg needs 111.1 kg, not 110 kg.
 */
export function grossInput(output, wastagePct) {
  if (wastagePct >= 100 || wastagePct < 0) return null;
  return output / (1 - wastagePct / 100);
}

/**
 * Actual wastage % from issued input and good output.
 */
export function actualWastagePct(input, output) {
  if (!input) return null;
  return (1 - output / input) * 100;
}

/** Width in inches → metres */
export function inchesToM(inches) {
  return inches * 0.0254;
}

/** Weight per metre of fabric (linear density) */
export function linearDensity(widthM, gsm) {
  return widthM * gsm; // g/m
}
