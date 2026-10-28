'use strict';
// Sommertid: node --test kjører hver fil i egen prosess, så tidssonen kan
// settes her uten å påvirke de andre testene.
process.env.TZ = 'Europe/Oslo';

const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

function iso(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

const { addDaysLocal } = loadFunctions(['addDaysLocal']);

// Regression: today + i * 86400000 lands at 23:00 the day before once summer
// time ends (25 Oct 2026), so every later day was off by one.
test('addDaysLocal steps whole calendar days across the end of summer time', () => {
  const start = new Date(2026, 8, 1);
  assert.strictEqual(iso(addDaysLocal(start, 54)), '2026-10-25');
  assert.strictEqual(iso(addDaysLocal(start, 55)), '2026-10-26');
  assert.strictEqual(addDaysLocal(start, 55).getHours(), 0);
  assert.strictEqual(iso(addDaysLocal(new Date(2027, 2, 1), 30)), '2027-03-31');
});

test('addDaysLocal does not change its argument', () => {
  const start = new Date(2026, 8, 1);
  addDaysLocal(start, 10);
  assert.strictEqual(iso(start), '2026-09-01');
});

// computeBelegg med «i dag» låst til 1. september 2026 og helger som fridager.
// Antall arbeidsdager i en 60-dagersperiode som krysser 25. oktober (1. sep.–
// 30. okt.) skal være det samme som en ren kalendertelling gir. Med feilen ble
// søndag 25. oktober telt to ganger og fredag 30. oktober falt ut.
test('computeBelegg counts workdays correctly across the end of summer time', () => {
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor(...args) { if (args.length) super(...args); else super(2026, 8, 1, 9, 0); }
    static now() { return new RealDate(2026, 8, 1, 9, 0).getTime(); }
  }
  const { computeBelegg } = loadFunctions(
    ['computeBelegg', 'addDaysLocal', 'countsInBelegg', 'countsAsPotentialBelegg', 'isUnassigned', 'canBeUnassigned'],
    {
      vars: ['OVERDUE_PENALTY_WORKDAYS'],
      globals: {
        Date: FixedDate,
        cases: [],
        vacations: [],
        isNonWorkday: (d) => d.getDay() === 0 || d.getDay() === 6,
      },
    }
  );
  let expected = 0;
  for (let i = 0; i < 60; i++) {
    const d = new RealDate(2026, 8, 1 + i);
    if (d.getDay() !== 0 && d.getDay() !== 6) expected++;
  }
  assert.strictEqual(computeBelegg(60).avail, expected);
});
