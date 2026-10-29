'use strict';
// Arbeidsvinduet regnes i arbeidsdager (v4.41.0): det strekker seg bakover
// forbi helger, røde dager og ferie, så en sak med frist rett etter ferien
// ikke ser billig ut.
process.env.TZ = 'Europe/Oslo';

const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

// Helg er fridag; ellers styres fridager av lista `off` (ISO-datoer).
function nonWorkday(off) {
  return (d) => {
    const dow = d.getDay();
    if (dow === 0 || dow === 6) return true;
    const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    return (off || []).indexOf(iso) !== -1;
  };
}

const { workWindowStart, nonWorkdayRuns, migrateWorkWindowsToWorkdays } = loadFunctions(
  ['workWindowStart', 'nonWorkdayRuns', 'migrateWorkWindowsToWorkdays', 'isoLocalDate']
);

// ── workWindowStart ─────────────────────────────────────────────────────────

test('workWindowStart counts back whole working weeks', () => {
  // Fre. 13.11.2026: 10 arbeidsdager = man. 2.11–fre. 13.11
  assert.strictEqual(workWindowStart('2026-11-13', 10, nonWorkday()), '2026-11-02');
  assert.strictEqual(workWindowStart('2026-11-13', 5, nonWorkday()), '2026-11-09');
});

test('workWindowStart includes the due date itself when it is a workday', () => {
  assert.strictEqual(workWindowStart('2026-11-11', 1, nonWorkday()), '2026-11-11');
});

test('workWindowStart skips a due date that falls on a weekend', () => {
  // Søn. 15.11: siste arbeidsdag er fre. 13.11
  assert.strictEqual(workWindowStart('2026-11-15', 1, nonWorkday()), '2026-11-13');
  assert.strictEqual(workWindowStart('2026-11-15', 3, nonWorkday()), '2026-11-11');
});

test('workWindowStart stretches back past a vacation', () => {
  // Ferie 7.–18.12; frist man. 21.12. 10 arbeidsdager: 21.12 + 9 dager før ferien.
  const off = [];
  for (let d = 7; d <= 18; d++) off.push('2026-12-' + String(d).padStart(2, '0'));
  assert.strictEqual(workWindowStart('2026-12-21', 10, nonWorkday(off)), '2026-11-24');
});

test('workWindowStart treats a window below one day as one day', () => {
  assert.strictEqual(workWindowStart('2026-11-11', 0, nonWorkday()), '2026-11-11');
});

test('workWindowStart stops on a calendar with no workdays at all', () => {
  const res = workWindowStart('2026-11-11', 10, () => true);
  assert.match(res, /^\d{4}-\d{2}-\d{2}$/);
});

// ── nonWorkdayRuns ──────────────────────────────────────────────────────────

test('nonWorkdayRuns groups consecutive days off inside the range', () => {
  const off = ['2026-12-07', '2026-12-08'];
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(nonWorkdayRuns('2026-11-30', '2026-12-09', nonWorkday(off)))),
    [['2026-12-05', '2026-12-08']]
  );
});

test('nonWorkdayRuns clips runs to the range and returns nothing on a plain week', () => {
  assert.deepStrictEqual(JSON.parse(JSON.stringify(nonWorkdayRuns('2026-11-02', '2026-11-06', nonWorkday()))), []);
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(nonWorkdayRuns('2026-11-08', '2026-11-14', nonWorkday()))),
    [['2026-11-08', '2026-11-08'], ['2026-11-14', '2026-11-14']]
  );
});

// ── migrateWorkWindowsToWorkdays ────────────────────────────────────────────

test('migrateWorkWindowsToWorkdays turns the old 14-day Ny default into 10 workdays', () => {
  assert.deepStrictEqual(
    { ...migrateWorkWindowsToWorkdays({ ny: 14, viderebehandling: 3, oppdrag: 2 }) },
    { ny: 10, viderebehandling: 3, oppdrag: 2 }
  );
});

test('migrateWorkWindowsToWorkdays keeps a Ny value the user chose', () => {
  assert.deepStrictEqual(
    migrateWorkWindowsToWorkdays({ ny: 20, viderebehandling: 4, oppdrag: 5 }),
    { ny: 20, viderebehandling: 4, oppdrag: 5 }
  );
});

test('migrateWorkWindowsToWorkdays passes through anything that is not a stored setting', () => {
  assert.strictEqual(migrateWorkWindowsToWorkdays(null), null);
  assert.strictEqual(migrateWorkWindowsToWorkdays('x'), 'x');
  const arr = [];
  assert.strictEqual(migrateWorkWindowsToWorkdays(arr), arr);
});

test('migrateWorkWindowsToWorkdays does not change its input', () => {
  const raw = { ny: 14, viderebehandling: 3, oppdrag: 2 };
  migrateWorkWindowsToWorkdays(raw);
  assert.strictEqual(raw.ny, 14);
});

// ── overduePenaltyOffsets ───────────────────────────────────────────────────

const { overduePenaltyOffsets } = loadFunctions(['overduePenaltyOffsets', 'addDaysLocal']);

test('overduePenaltyOffsets books the next workdays from today', () => {
  // Tor. 29.10.2026: tor, fre, man
  assert.deepStrictEqual([...overduePenaltyOffsets(new Date('2026-10-29T00:00:00'), 3, nonWorkday())], [0, 1, 4]);
});

test('overduePenaltyOffsets lands on the right weekday across the end of summer time', () => {
  // Fre. 23.10.2026; sommertiden slutter søn. 25.10. Fre, man, tir.
  assert.deepStrictEqual([...overduePenaltyOffsets(new Date('2026-10-23T00:00:00'), 3, nonWorkday())], [0, 3, 4]);
});

test('overduePenaltyOffsets gives up after 60 days off in a row', () => {
  assert.deepStrictEqual([...overduePenaltyOffsets(new Date('2026-10-29T00:00:00'), 3, () => true)], []);
});
