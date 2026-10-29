import test from 'node:test';
import assert from 'node:assert/strict';
import { nextOccurrence, assertSchedule, IST_OFFSET_MS } from '../src/schedule.js';
const utc = (s) => Date.parse(s);
test('Monday 04:00 IST maps to Sunday 22:30 UTC', () => {
  const s = assertSchedule({ days: [1], time: '04:00' });
  assert.equal(nextOccurrence(s, utc('2026-10-25T00:00:00Z')), utc('2026-10-25T22:30:00Z'));
});
test('Sunday 01:00 IST maps to Saturday 19:30 UTC', () => {
  const s = assertSchedule({ days: [0], time: '01:00' });
  assert.equal(nextOccurrence(s, utc('2026-10-24T00:00:00Z')), utc('2026-10-24T19:30:00Z'));
});
test('already passed moves to next week, not same minute', () => {
  const s = assertSchedule({ days: [0], time: '01:00' });
  assert.equal(nextOccurrence(s, utc('2026-10-24T19:30:00Z')), utc('2026-10-31T19:30:00Z'));
});
test('daily trigger after local midnight', () => {
  const s = assertSchedule({ days: [0, 1, 2, 3, 4, 5, 6], time: '00:10' });
  assert.equal(nextOccurrence(s, utc('2026-10-28T18:00:00Z')), utc('2026-10-28T18:40:00Z'));
});
test('invalid duplicate and malformed schedules rejected', () => {
  assert.throws(() => assertSchedule({ days: [1, 1], time: '04:00' }));
  assert.throws(() => assertSchedule({ days: [7], time: '04:00' }));
  assert.throws(() => assertSchedule({ days: [0], time: '24:00' }));
  assert.equal(IST_OFFSET_MS, 19_800_000);
});
test('IST year and leap day boundaries stay on their intended weekday', () => {
  const daily = assertSchedule({ days: [0, 1, 2, 3, 4, 5, 6], time: '00:00' });
  assert.equal(nextOccurrence(daily, utc('2026-12-31T18:29:59Z')), utc('2026-12-31T18:30:00Z'));
  assert.equal(nextOccurrence(daily, utc('2028-02-28T18:30:00Z')), utc('2028-02-29T18:30:00Z'));
  assert.equal(nextOccurrence({ ...daily, enabled: false }, Date.now()), null);
  assert.throws(() => assertSchedule({ days: [0], time: '04:00', enabled: 'false' }));
});
