const test = require('node:test');
const assert = require('node:assert/strict');
const d = require('../cloudfunctions/study/domain');
const { person, NOW } = require('./helpers');

test('Shanghai week flips at Monday midnight, independent of host timezone', () => {
  assert.equal(d.weekKey(Date.parse('2026-10-18T23:59:59+08:00')), '2026-10-12');
  assert.equal(d.weekKey(Date.parse('2026-10-19T00:00:00+08:00')), '2026-10-19');
  assert.equal(d.weekKey(Date.parse('2027-01-01T00:00:00+08:00')), '2026-12-28');
  assert.equal(d.nextWeek('2026-12-28'), '2027-01-04');
});
test('invalid calendar dates and non-half-hour ranges are rejected', () => {
  for (const date of ['2026-02-30', '2026-13-01', 'xxx', '2026-1-1']) assert.throws(() => d.dayStart(date));
  for (const [start, end] of [[20.5,21],[-1,1],[1,49],[2,2],[4,3]]) assert.throws(() => d.interval('2026-10-19', start, end));
  assert.equal(d.interval('2026-10-19', 47, 48).minutes, 30);
});
test('warning is once in lifetime and ban ends at the exact expiry boundary', () => {
  const user = person('alice');
  const first = d.imposePenalty(user, NOW, 'reason', '1');
  assert.equal(first.level, 0); assert.equal(first.deducted, 300);
  assert.equal(d.penaltyState(user, first.until - 1).banned, true);
  assert.equal(d.penaltyState(user, first.until).banned, false);
  assert.equal(d.imposePenalty(user, NOW + 200 * d.DAY, 'repeat', '2').level, 1);
});
test('new independent offenses during a ban escalate 0 → 1 → 2 → permanent', () => {
  const user = person('alice');
  for (const level of [0,1,2,3]) assert.equal(d.imposePenalty(user, NOW + level, 'reason', String(level)).level, level);
  assert.equal(d.penaltyState(user, NOW + 5000 * d.DAY).permanent, true);
  assert.throws(() => d.imposePenalty(user, NOW, 'repeat', '5'), /永久/);
});
test('level 1 escalation window starts at unban and expires after 7 days', () => {
  const user = person('alice'); user.penalty = { level: 1, until: NOW, warned: true };
  const inside = structuredClone(user), boundary = structuredClone(user);
  assert.equal(d.imposePenalty(inside, NOW + 7 * d.DAY - 1, 'reason', '1').level, 2);
  assert.equal(d.imposePenalty(boundary, NOW + 7 * d.DAY, 'reason', '1').level, 1);
});
test('level 2 drops to 1 at 30 days, then base at 37; warning never resets', () => {
  const user = person('alice'); user.penalty = { level: 2, until: NOW, warned: true };
  for (const [delta, state, next] of [[30*d.DAY-1,2,3],[30*d.DAY,1,2],[37*d.DAY-1,1,2],[37*d.DAY,-1,1]]) {
    const copy = structuredClone(user);
    assert.equal(d.penaltyState(copy, NOW + delta).level, state);
    assert.equal(d.imposePenalty(copy, NOW + delta, 'reason', '1').level, next);
  }
});
test('level 2 deducts this week 10h and next calendar week 5h, including Sunday review', () => {
  const user = person('alice'); const sunday = Date.parse('2026-10-25T23:59:59+08:00');
  user.penalty = { level: 1, until: sunday, warned: true };
  d.imposePenalty(user, sunday, 'reason', '1');
  assert.equal(d.quota(user, sunday).remaining, 0);
  assert.equal(d.quota(user, sunday + 1000).remaining, 300);
  assert.equal(d.quota(user, sunday + 8*d.DAY).remaining, 600);
});
test('deductions do not make quota negative or refund completed usage', () => {
  const user = person('alice'); d.ledger(user, d.weekKey(NOW)).used = 570;
  d.imposePenalty(user, NOW, 'reason', '1');
  assert.deepEqual(d.quota(user, NOW), { key:'2026-10-19', total:600, used:570, deducted:300, remaining:0 });
});
test('public profile never returns password or active booking identifiers', () => {
  const user = person('alice');
  const safe = d.publicUser(user, NOW);
  assert.equal('password' in safe, false); assert.equal('active' in safe, false);
});
