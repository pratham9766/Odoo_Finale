import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reverseRejectedScrap } from '../src/modules/quality/inspections.service.js';
import { monthTotals } from '../src/modules/workforce/wages.service.js';

test('wage month totals use exactly the supplied from/to SQL parameters', async () => {
  let captured;
  const db = {
    query: async (sql, params) => {
      captured = { sql, params };
      return { rows: [] };
    },
  };
  await monthTotals(db, '2026-09-01', '2026-10-01');
  assert.deepEqual(captured.params, ['2026-09-01', '2026-10-01']);
  assert.doesNotMatch(captured.sql, /\$3/);
});

test('QC scrap reversal inserts only the negative net quantity and is a no-op when already reversed', async () => {
  const writes = [];
  const db = {
    query: async (sql, params) => {
      if (/select item_id, lot_id, sum\(qty\)/.test(sql)) {
        return { rows: [{ item_id: 'scrap-item', lot_id: 'scrap-lot', qty: '12.5' }] };
      }
      writes.push({ sql, params });
      return { rows: [] };
    },
  };
  await reverseRejectedScrap(db, { userId: 'qc-head' }, { id: 'roll-1' });
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].params, ['scrap-item', 'scrap-lot', -12.5, 'roll-1', 'qc-head']);

  const alreadyReversed = { query: async () => ({ rows: [] }) };
  await reverseRejectedScrap(alreadyReversed, { userId: 'qc-head' }, { id: 'roll-1' });
});
