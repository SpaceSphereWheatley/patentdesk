'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

function load(vacations) {
  return loadFunctions(
    ['easterSunday', 'getNorwegianHolidays', 'isNonWorkday', 'workDaysUntil', 'daysUntil'],
    { globals: { vacations: vacations || [], _holidayCache: {} } }
  );
}

test('easterSunday computes the known Easter Sunday date for a given year', () => {
  const { easterSunday } = load();
  // 1. påskedag 2026 falls on 5 April.
  const d = easterSunday(2026);
  assert.strictEqual(d.getFullYear(), 2026);
  assert.strictEqual(d.getMonth(), 3);
  assert.strictEqual(d.getDate(), 5);
});

test('getNorwegianHolidays returns 14 fixed/movable holidays for a year', () => {
  const { getNorwegianHolidays } = load();
  const holidays = getNorwegianHolidays(2026);
  assert.strictEqual(holidays.length, 14);
  assert.ok(holidays.some((h) => h.date === '2026-01-01' && h.name === 'Nyttårsdag'));
  assert.ok(holidays.some((h) => h.date === '2026-12-25' && h.name === '1. juledag'));
});

test('isNonWorkday flags weekends', () => {
  const { isNonWorkday } = load();
  // 2026-06-20 is a Saturday, 2026-06-22 is a Monday.
  assert.strictEqual(isNonWorkday(new Date(2026, 5, 20)), true);
  assert.strictEqual(isNonWorkday(new Date(2026, 5, 22)), false);
});

test('isNonWorkday flags public holidays', () => {
  const { isNonWorkday } = load();
  assert.strictEqual(isNonWorkday(new Date(2026, 0, 1)), true); // Nyttårsdag
});

test('isNonWorkday flags days within a registered vacation period', () => {
  const { isNonWorkday } = load([{ from: '2026-07-01', to: '2026-07-14' }]);
  assert.strictEqual(isNonWorkday(new Date(2026, 6, 5)), true);
  assert.strictEqual(isNonWorkday(new Date(2026, 6, 20)), false);
});

test('workDaysUntil returns 0 for a date in the past or today', () => {
  const { workDaysUntil } = load();
  const past = new Date(); past.setDate(past.getDate() - 5);
  const iso = past.getFullYear() + '-' + String(past.getMonth() + 1).padStart(2, '0') + '-' + String(past.getDate()).padStart(2, '0');
  assert.strictEqual(workDaysUntil(iso), 0);
});

test('workDaysUntil excludes weekends from the count', () => {
  const { workDaysUntil } = load();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  // Find next Monday, then count work days to the following Monday (7 days later, 5 workdays).
  const target = new Date(today); target.setDate(target.getDate() + 7);
  const iso = target.getFullYear() + '-' + String(target.getMonth() + 1).padStart(2, '0') + '-' + String(target.getDate()).padStart(2, '0');
  const result = workDaysUntil(iso);
  // 7 calendar days ahead always contains exactly one full weekend (2 days) baseline,
  // so work days should be 5, unless a holiday also falls in the window.
  assert.ok(result === 5 || result === 4, 'expected 4 or 5 workdays in a 7-day window, got ' + result);
});

test('daysUntil computes calendar day difference from today', () => {
  const { daysUntil } = load();
  const d = new Date(); d.setDate(d.getDate() + 10);
  const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  assert.strictEqual(daysUntil(iso), 10);
});
