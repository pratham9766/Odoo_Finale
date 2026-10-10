import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  grossInput, netOutput, actualWastePct, inchesToMetres, fabricGramsPerMetre, fabricMetresToKg,
  fabricKgToMetres, yarnMetresPerKg, yarnKgToMetres, yarnMetresToKg, splitWarpWeft, dyeKg,
  rollsToMetres, metresToRolls, rollsTotalMetres,
} from '../src/utils/textile.js';

const near = (actual, expected, tol, msg) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg ?? ''} expected ${expected} ± ${tol}, got ${actual}`);

test('1 shirt walks back to ≈ 387 g fibre (overall plan §12.2)', () => {
  const width = 1.47, gsm = 120;
  near(fabricGramsPerMetre(width, gsm), 176.4, 1e-9, 'g/m');

  const shirtM = 1.6;
  const shirtG = fabricMetresToKg(shirtM, width, gsm) * 1000;
  near(shirtG, 282, 0.5, 'shirt');

  const finishedM = grossInput(shirtM, 10);            // cutting 10%
  const finishedG = grossInput(shirtG, 10);
  near(finishedM, 1.78, 0.005, 'finished m');
  near(finishedG, 314, 0.5, 'finished g');

  const greyM = grossInput(finishedM, 4);              // dyeing shrinkage 4%
  const greyG = grossInput(finishedG, 5);              // dyeing weight loss 5%
  near(greyM, 1.85, 0.005, 'grey m');
  near(greyG, 330, 0.5, 'grey g');

  const yarnG = grossInput(greyG, 3);                  // weaving 3%
  near(yarnG, 340, 0.5, 'yarn g');
  const { warp, weft } = splitWarpWeft(yarnG, 55);
  near(warp, 187, 0.5, 'warp');
  near(weft, 153, 0.5, 'weft');

  const fibreG = grossInput(yarnG, 12);                // spinning 12%
  near(fibreG, 387, 0.5, 'fibre');
});

test('wastage divides, not multiplies', () => {
  near(grossInput(100, 10), 111.111, 0.001);
  assert.equal(grossInput(100, 0), 100);
  near(netOutput(grossInput(250, 7.5), 7.5), 250, 1e-9, 'round trip');
  near(actualWastePct(100, 94), 6, 1e-9);
  assert.equal(actualWastePct(0, 10), null);
  assert.throws(() => grossInput(100, 100), RangeError);
  assert.throws(() => grossInput(100, -1), RangeError);
});

test('fabric metres ↔ kg', () => {
  near(inchesToMetres(58), 1.4732, 1e-9);
  near(fabricMetresToKg(1000, 1.47, 120), 176.4, 1e-9);
  near(fabricKgToMetres(176.4, 1.47, 120), 1000, 1e-9);
  assert.throws(() => fabricMetresToKg(10, 0, 120), RangeError);
});

test('yarn count Ne ↔ length', () => {
  near(yarnMetresPerKg(40), 67732, 1e-6);
  near(yarnKgToMetres(2, 40), 135464, 1e-6);
  near(yarnMetresToKg(67732, 40), 1, 1e-9);
});

test('dye by shade %', () => {
  near(dyeKg(293, 2), 5.86, 1e-9);                     // §12.3: 2% shade ≈ 5.9 kg
});

test('rolls ↔ metres', () => {
  assert.equal(rollsToMetres(4, 50), 200);
  assert.equal(metresToRolls(201, 50), 5);
  assert.equal(metresToRolls(200, 50), 4);
  assert.equal(rollsTotalMetres([{ length_m: '50.10' }, { length_m: '49.90' }, { length_m: '0.20' }]), 100.2);
  assert.equal(rollsTotalMetres([10.1, 20.2]), 30.3);
  assert.equal(rollsTotalMetres([]), 0);
});
