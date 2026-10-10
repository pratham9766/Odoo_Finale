// owner: Hrishikesh — textile conversions from overall plan §12.4
import { round3 } from './money.js';

const NE_M_PER_KG = 1693.3;

// fabric metres → kg: kg = m × width_m × GSM ÷ 1000
export const fabricMToKg = (m, widthM, gsm) => round3((m * widthM * gsm) / 1000);

// fabric kg → metres: m = kg × 1000 ÷ (width_m × GSM)
export const fabricKgToM = (kg, widthM, gsm) => round3((kg * 1000) / (widthM * gsm));

// yarn count Ne → metres per kg
export const yarnMetresPerKg = (ne) => round3(ne * NE_M_PER_KG);
export const yarnKgToM = (kg, ne) => round3(kg * ne * NE_M_PER_KG);
export const yarnMToKg = (m, ne) => round3(m / (ne * NE_M_PER_KG));

// dye kg = fabric kg × shade %
export const dyeKg = (fabricKg, shadePct) => round3((fabricKg * shadePct) / 100);

// rolls ↔ metres
export const rollsToM = (rolls, rollLengthM) => round3(rolls * rollLengthM);
export const mToRolls = (m, rollLengthM) => Math.ceil(m / rollLengthM);

// split yarn need into warp / weft by share %
export const warpWeft = (yarnKg, warpPct) => ({
  warp_kg: round3((yarnKg * warpPct) / 100),
  weft_kg: round3((yarnKg * (100 - warpPct)) / 100),
});

// input needed for a given output after wastage: input = output ÷ (1 − wastage%)
export const grossUp = (output, wastagePct) => round3(output / (1 - wastagePct / 100));
