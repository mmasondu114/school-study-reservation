'use strict';

const HALF_HOUR = 30 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const OFFSET = 8 * 60 * 60 * 1000;
const WEEKLY_MINUTES = 600;

function assert(ok, message) { if (!ok) throw new Error(message); }
function dateKey(time) { return new Date(time + OFFSET).toISOString().slice(0, 10); }
function dayStart(date) {
  assert(/^\d{4}-\d{2}-\d{2}$/.test(date), '日期格式错误');
  const time = Date.parse(date + 'T00:00:00+08:00');
  assert(Number.isFinite(time) && dateKey(time) === date, '日期无效');
  return time;
}
function weekKey(time) {
  const local = new Date(time + OFFSET);
  const weekday = (local.getUTCDay() + 6) % 7;
  return dateKey(dayStart(dateKey(time)) - weekday * DAY);
}
function nextWeek(key) { return dateKey(dayStart(key) + 7 * DAY); }
function interval(date, start, end) {
  assert(Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end <= 48 && end > start, '请选择有效的30分钟时段');
  const midnight = dayStart(date);
  return { startAt: midnight + start * HALF_HOUR, endAt: midnight + end * HALF_HOUR, minutes: (end - start) * 30 };
}
function quota(user, time) {
  const key = weekKey(time);
  const entry = (user.weeks || {})[key] || {};
  const used = entry.used || 0, deducted = entry.deducted || 0;
  return { key, total: WEEKLY_MINUTES, used, deducted, remaining: Math.max(0, WEEKLY_MINUTES - used - deducted) };
}
function ledger(user, key) {
  user.weeks = user.weeks || {};
  return user.weeks[key] || (user.weeks[key] = { used: 0, deducted: 0 });
}
function penaltyState(user, now) {
  const p = user.penalty;
  if (!p) return { level: -1, banned: false, permanent: false, until: 0, decayAt: 0, warned: false };
  if (p.level === 3) return { ...p, banned: true, permanent: true, decayAt: 0 };
  let level = p.level, decayAt = 0;
  if (level === 2) {
    if (now >= p.until + 37 * DAY) level = -1;
    else if (now >= p.until + 30 * DAY) { level = 1; decayAt = p.until + 37 * DAY; }
    else decayAt = p.until + 30 * DAY;
  } else if (level === 1) {
    if (now >= p.until + 7 * DAY) level = -1;
    else decayAt = p.until + 7 * DAY;
  } else if (now >= p.until) level = -1;
  return { ...p, level, banned: now < p.until, permanent: false, decayAt, warned: true };
}
function imposePenalty(user, now, reason, sourceId) {
  const previous = penaltyState(user, now);
  assert(!previous.permanent, '该学生已被永久封禁');
  const level = !user.penalty ? 0 : Math.min(3, Math.max(1, previous.level + 1));
  const days = [1, 3, 7, 0][level];
  const until = level === 3 ? 0 : Math.max(now + days * DAY, previous.until || 0);
  const deductions = [300, 360, 600, 0];
  ledger(user, weekKey(now)).deducted += deductions[level];
  if (level === 2) ledger(user, nextWeek(weekKey(now))).deducted += 300;
  user.penalty = { level, imposedAt: now, until, reason, sourceId, warned: true };
  return { ...user.penalty, deducted: deductions[level], nextWeekDeducted: level === 2 ? 300 : 0 };
}
function revokePenalty(user, penalty, now) {
  if (!penalty) return;
  const level = penalty.level;
  const deductions = [300, 360, 600, 0];
  const deducted = penalty.deducted !== undefined ? penalty.deducted : deductions[level] || 0;
  const nextDeducted = penalty.nextWeekDeducted !== undefined ? penalty.nextWeekDeducted : (level === 2 ? 300 : 0);
  if (penalty.imposedAt) {
    const wk = weekKey(penalty.imposedAt);
    if (user.weeks && user.weeks[wk]) {
      user.weeks[wk].deducted = Math.max(0, (user.weeks[wk].deducted || 0) - deducted);
    }
    if (nextDeducted > 0) {
      const nwk = nextWeek(wk);
      if (user.weeks && user.weeks[nwk]) {
        user.weeks[nwk].deducted = Math.max(0, (user.weeks[nwk].deducted || 0) - nextDeducted);
      }
    }
  }
  if (user.penalty && (user.penalty.sourceId === penalty.sourceId || user.penalty.imposedAt === penalty.imposedAt)) {
    user.penalty = null;
  }
}
function publicUser(user, now) {
  return {
    id: user.id, name: user.name, role: user.role,
    authSource: isSchoolAccount(user) ? 'school' : 'local',
    mustChangePassword: !!user.mustChangePassword,
    quota: quota(user, now), nextQuota: quota(user, dayStart(nextWeek(weekKey(now)))),
    penalty: penaltyState(user, now)
  };
}
function isSchoolAccount(user) { return !!user && (user.authSource === 'school' || user.role === 'student'); }
module.exports = { HALF_HOUR, DAY, WEEKLY_MINUTES, assert, dateKey, dayStart, weekKey, nextWeek, interval, quota, ledger, penaltyState, imposePenalty, revokePenalty, publicUser, isSchoolAccount };
