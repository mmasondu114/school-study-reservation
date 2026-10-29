'use strict';

const crypto = require('node:crypto');
const d = require('./domain');
const { assert } = d;
const newId = () => crypto.randomBytes(12).toString('hex');
const defaults = { id: 'main', seatCount: 0, openSlot: 16, closeSlot: 44, notice: '请按预约时段就座，共同维护安静、有序的自习环境。' };
const text = (value, min, max, label) => {
  assert(typeof value === 'string' && value.trim().length >= min && value.trim().length <= max, label + '长度应为' + min + '～' + max + '字');
  return value.trim();
};
const username = value => { assert(typeof value === 'string' && /^[a-zA-Z0-9_-]{3,32}$/.test(value), '账号须为3～32位字母、数字、下划线或短横线'); return value.toLowerCase(); };
const seatKey = (date, seat) => date + '_' + seat;
function staff(user) { assert(['admin', 'reviewer'].includes(user.role), '需要审核权限'); }
function admin(user) { assert(user.role === 'admin', '需要管理员权限'); }
function student(user) { assert(user.role === 'student', '请使用学生账号预约'); }
async function cancelBooking(tx, booking, user, now, reason) {
  assert(booking.status === 'active' && booking.startAt > now, '仅可取消尚未开始的预约');
  const schedule = await tx.get('schedules', seatKey(booking.date, booking.seat));
  if (schedule) {
    for (let i = booking.start; i < booking.end; i++) if (schedule.slots[i] === booking.id) delete schedule.slots[i];
    tx.put('schedules', schedule.id, schedule);
  }
  booking.status = 'cancelled'; booking.cancelReason = reason; booking.cancelledAt = now;
  d.ledger(user, d.weekKey(booking.startAt)).used = Math.max(0, d.ledger(user, d.weekKey(booking.startAt)).used - booking.minutes);
  user.active = (user.active || []).filter(item => item.id !== booking.id);
  tx.put('bookings', booking.id, booking);
}
async function punish(tx, user, now, reason, sourceId, actorId) {
  // Cancel first to refund only unstarted bookings; completed/in-progress usage stays charged.
  for (const brief of user.active || []) {
    if (brief.startAt > now) {
      const booking = await tx.get('bookings', brief.id);
      if (booking && booking.status === 'active') await cancelBooking(tx, booking, user, now, '违规封禁，自动取消');
    }
  }
  const penalty = d.imposePenalty(user, now, reason, sourceId);
  tx.put('users', user.id, user);
  tx.put('audit', sourceId, { id: sourceId, actorId, targetId: user.id, action: 'penalty', penalty, createdAt: now });
  return penalty;
}

// All mutations run inside the repository's transaction. No client-supplied role or clock is trusted.
async function execute(tx, actorId, action, input, now, dependencies = {}) {
  const user = await tx.get('users', actorId);
  assert(user, '账号不存在');
  assert(!user.mustChangePassword || ['me', 'changePassword'].includes(action), '请先修改初始密码');
  const settings = await tx.get('settings', 'main') || { ...defaults };
  switch (action) {
    case 'me': return { user: d.publicUser(user, now), settings, serverNow: now };
    case 'submitFeedback': {
      assert(Number.isInteger(input.rating) && input.rating >= 1 && input.rating <= 5, '请选择1～5星的使用体验评分');
      const comment = text(input.comment === undefined ? '' : input.comment, 0, 1000, '问题反馈');
      assert(typeof input.requestId === 'string' && /^[a-f0-9]{24,64}$/.test(input.requestId), '操作标识无效');
      const id = user.id + '_' + input.requestId;
      if (await tx.get('feedback', id)) return { id };
      tx.put('feedback', id, { id, ownerId: user.id, ownerName: user.name, rating: input.rating, comment, createdAt: now });
      return { id };
    }
    case 'changePassword': {
      assert(!d.isSchoolAccount(user), '学校账号密码请通过学校原系统修改');
      assert(await dependencies.verifyPassword(input.oldPassword, user.password), '原密码错误');
      assert(input.newPassword !== input.oldPassword, '新密码不能与原密码相同');
      user.password = await dependencies.hashPassword(input.newPassword);
      user.mustChangePassword = false; user.sessionVersion = (user.sessionVersion || 0) + 1;
      tx.put('users', user.id, user); return { relogin: true };
    }
    case 'book': {
      student(user);
      assert(!d.penaltyState(user, now).banned, '当前处于封禁期，暂不能预约');
      assert(Number.isInteger(input.seat) && input.seat > 0 && input.seat <= settings.seatCount, '座位不存在');
      const range = d.interval(input.date, input.start, input.end);
      assert(range.startAt > now && range.startAt < d.dayStart(d.dateKey(now)) + 7 * d.DAY, '仅可预约未来7天内的时段');
      assert(input.start >= settings.openSlot && input.end <= settings.closeSlot, '预约超出开放时间');
      const active = (user.active || []).filter(b => b.endAt > now);
      assert(!active.some(b => b.startAt < range.endAt && b.endAt > range.startAt), '你在该时间已有预约');
      assert(d.quota(user, range.startAt).remaining >= range.minutes, '预约所在周的剩余时长不足');
      const key = seatKey(input.date, input.seat);
      const schedule = await tx.get('schedules', key) || { id: key, date: input.date, seat: input.seat, slots: {} };
      for (let i = input.start; i < input.end; i++) assert(!schedule.slots[i], '该座位刚被预约，请重新选择');
      const id = newId();
      const booking = { id, ownerId: user.id, ownerName: user.name, seat: input.seat, date: input.date, start: input.start, end: input.end, ...range, status: 'active', createdAt: now };
      for (let i = input.start; i < input.end; i++) schedule.slots[i] = id;
      user.active = [...active, { id, startAt: range.startAt, endAt: range.endAt }];
      d.ledger(user, d.weekKey(range.startAt)).used += range.minutes;
      tx.put('schedules', key, schedule); tx.put('bookings', id, booking); tx.put('users', user.id, user);
      return booking;
    }
    case 'cancel': {
      const booking = await tx.get('bookings', input.id);
      assert(booking && (booking.ownerId === user.id || user.role === 'admin'), '无权取消该预约');
      const owner = booking.ownerId === user.id ? user : await tx.get('users', booking.ownerId);
      await cancelBooking(tx, booking, owner, now, user.role === 'admin' ? '管理员取消预约' : '主动取消');
      tx.put('users', owner.id, owner);
      if (user.role === 'admin') { const id = newId(); tx.put('audit', id, { id, actorId, action: 'cancel', bookingId: booking.id, createdAt: now }); }
      return { cancelled: true };
    }
    case 'report': {
      student(user);
      const range = d.interval(input.date, input.start, input.end);
      assert(range.startAt <= now && range.startAt >= now - 7 * d.DAY && range.endAt <= Math.ceil(now / d.HALF_HOUR) * d.HALF_HOUR, '只能举报最近7天内已发生或正在发生的时段');
      assert(Number.isInteger(input.seat) && input.seat > 0 && input.seat <= settings.seatCount, '座位不存在');
      const reason = text(input.reason, 5, 300, '举报说明');
      assert(Array.isArray(input.photos) && input.photos.length >= 1 && input.photos.length <= 3, '必须提供1～3张现场照片');
      const photos = [];
      for (const id of new Set(input.photos)) {
        const evidence = await tx.get('evidence', id);
        assert(evidence && evidence.ownerId === user.id && evidence.fileID && !evidence.reportId, '照片无效或已用于其他举报，请重新上传');
        photos.push(evidence);
      }
      const schedule = await tx.get('schedules', seatKey(input.date, input.seat));
      assert(schedule, '该座位和时段没有预约记录，请核对');
      const ids = new Set();
      for (let i = input.start; i < input.end; i++) { assert(schedule.slots[i], '举报时段须完整对应一条预约'); ids.add(schedule.slots[i]); }
      assert(ids.size === 1, '举报时段涉及多条预约，请缩小范围');
      const booking = await tx.get('bookings', [...ids][0]);
      assert(booking.ownerId !== user.id, '不能举报自己');
      const duplicateKey = user.id + '_' + booking.id;
      assert(!(await tx.get('reportKeys', duplicateKey)), '你已举报过这条预约');
      const id = newId();
      const report = { id, ownerId: user.id, targetId: booking.ownerId, bookingId: booking.id, seat: input.seat, date: input.date, start: input.start, end: input.end, reason, photos: photos.map(p => p.fileID), status: 'pending', createdAt: now };
      for (const evidence of photos) { evidence.reportId = id; tx.put('evidence', evidence.id, evidence); }
      tx.put('reports', id, report); tx.put('reportKeys', duplicateKey, { id: duplicateKey, reportId: id });
      return { id };
    }
    case 'review': {
      staff(user);
      const report = await tx.get('reports', input.id);
      assert(report && report.status === 'pending', '举报不存在或已处理');
      assert(report.ownerId !== user.id && report.targetId !== user.id, '不能审核与自己相关的举报');
      assert(['approve', 'reject'].includes(input.decision), '审核结果无效');
      const note = text(input.note, 5, 300, '审核意见');
      if (input.decision === 'approve') {
        const existing = await tx.get('incidents', report.bookingId);
        if (existing) { report.status = 'duplicate'; report.penalty = existing.penalty; }
        else {
          const target = await tx.get('users', report.targetId);
          if (d.penaltyState(target, now).permanent) report.status = 'already_banned';
          else {
            report.penalty = await punish(tx, target, now, note, report.id, user.id);
            report.status = 'approved';
            tx.put('incidents', report.bookingId, { id: report.bookingId, reportId: report.id, penalty: report.penalty });
          }
        }
      } else report.status = 'rejected';
      report.reviewedAt = now; report.reviewerId = user.id; report.reviewNote = note;
      tx.put('reports', report.id, report); return report;
    }
    case 'settings': {
      admin(user);
      assert(typeof input.requestId === 'string' && /^[a-f0-9]{24,64}$/.test(input.requestId), '操作标识无效');
      const auditId = 'settings_' + input.requestId;
      const existing = await tx.get('audit', auditId);
      if (existing) { assert(existing.actorId === actorId, '操作标识冲突'); return existing.settings; }
      assert(Number.isInteger(input.addSeats) && input.addSeats >= 0 && input.addSeats <= 200 && settings.seatCount + input.addSeats <= 999, '单次可增加0～200个座位，总数最多999');
      assert(Number.isInteger(input.openSlot) && Number.isInteger(input.closeSlot) && input.openSlot >= 0 && input.closeSlot <= 48 && input.openSlot < input.closeSlot, '开放时段无效');
      settings.seatCount += input.addSeats; settings.openSlot = input.openSlot; settings.closeSlot = input.closeSlot;
      settings.notice = text(input.notice, 1, 300, '公告');
      tx.put('settings', 'main', settings);
      tx.put('audit', auditId, { id: auditId, actorId, action: 'settings', settings, createdAt: now });
      return settings;
    }
    case 'createUser': {
      admin(user);
      const id = username(input.username);
      assert(['student', 'reviewer'].includes(input.role), '仅可发放学生或审核账号');
      assert(!(await tx.get('users', id)), '该账号已存在');
      const school = input.role === 'student';
      const account = { id, name: text(input.name, 1, 30, '姓名'), role: input.role, authSource: school ? 'school' : 'local', password: await (school ? dependencies.hashSchoolPassword : dependencies.hashPassword)(input.password), mustChangePassword: !school, sessionVersion: 0, createdAt: now, weeks: {}, active: [] };
      tx.put('users', id, account);
      const auditId = newId(); tx.put('audit', auditId, { id: auditId, actorId, action: 'createUser', targetId: id, role: input.role, createdAt: now });
      return d.publicUser(account, now);
    }
    case 'role': {
      admin(user);
      const target = await tx.get('users', username(input.username));
      assert(target && target.role !== 'admin' && target.id !== user.id, '不能修改该账号权限');
      assert(['student', 'reviewer'].includes(input.role), '权限无效');
      assert(!d.penaltyState(target, now).banned, '封禁中的学生不能提升为审核员');
      if (input.role === 'reviewer') {
        for (const brief of target.active || []) {
          if (brief.startAt > now) { const booking = await tx.get('bookings', brief.id); if (booking && booking.status === 'active') await cancelBooking(tx, booking, target, now, '转为审核账号，取消学生预约'); }
        }
      }
      target.role = input.role; target.sessionVersion = (target.sessionVersion || 0) + 1;
      tx.put('users', target.id, target);
      const id = newId(); tx.put('audit', id, { id, actorId, targetId: target.id, action: 'role', role: input.role, createdAt: now });
      return d.publicUser(target, now);
    }
    case 'resetPassword': {
      admin(user);
      const target = await tx.get('users', username(input.username));
      assert(target && target.role !== 'admin', '不能重置该账号');
      assert(!d.isSchoolAccount(target), '学校账号密码请通过学校原系统重置');
      target.password = await dependencies.hashPassword(input.password); target.mustChangePassword = true; target.sessionVersion = (target.sessionVersion || 0) + 1;
      tx.put('users', target.id, target);
      const id = newId(); tx.put('audit', id, { id, actorId, targetId: target.id, action: 'resetPassword', createdAt: now });
      return { reset: true };
    }
    case 'ban': {
      admin(user);
      const target = await tx.get('users', username(input.username));
      assert(target && target.role === 'student', '只能封禁学生账号');
      const reason = text(input.reason, 5, 300, '封禁原因');
      assert(typeof input.requestId === 'string' && /^[a-f0-9]{24,64}$/.test(input.requestId), '操作标识无效');
      const id = 'manual_' + input.requestId;
      const existing = await tx.get('audit', id);
      if (existing) { assert(existing.targetId === target.id && existing.actorId === user.id, '操作标识冲突'); return existing.penalty; }
      return punish(tx, target, now, reason, id, user.id);
    }
    case 'submitAppeal': {
      student(user);
      assert(user.penalty && user.penalty.level >= 0, '当前账号没有违规处罚记录，无需申诉');
      const reason = text(input.reason, 5, 500, '申诉说明');
      const existingKey = await tx.get('appealKeys', user.id);
      assert(!existingKey || !existingKey.pending, '你已有一项申诉正在审核中，请耐心等待');
      const photos = [];
      if (Array.isArray(input.photos) && input.photos.length > 0) {
        assert(input.photos.length <= 3, '最多上传3张证明材料');
        for (const pid of new Set(input.photos)) {
          const evidence = await tx.get('evidence', pid);
          assert(evidence && evidence.ownerId === user.id && evidence.fileID && !evidence.reportId && !evidence.appealId, '照片无效或已使用，请重新上传');
          photos.push(evidence);
        }
      }
      const id = newId();
      const appeal = {
        id,
        ownerId: user.id,
        ownerName: user.name,
        penalty: { ...user.penalty },
        reason,
        photos: photos.map(p => p.fileID),
        status: 'pending',
        createdAt: now
      };
      for (const evidence of photos) {
        evidence.appealId = id;
        tx.put('evidence', evidence.id, evidence);
      }
      tx.put('appeals', id, appeal);
      tx.put('appealKeys', user.id, { id: user.id, pending: true, appealId: id, createdAt: now });
      return { id };
    }
    case 'reviewAppeal': {
      staff(user);
      const appeal = await tx.get('appeals', input.id);
      assert(appeal && appeal.status === 'pending', '申诉记录不存在或已处理');
      assert(appeal.ownerId !== user.id, '不能审核自己的申诉');
      assert(['approve', 'reject'].includes(input.decision), '审核结果无效');
      const note = text(input.note, 5, 300, '审核意见');
      if (input.decision === 'approve') {
        const target = await tx.get('users', appeal.ownerId);
        if (target) {
          d.revokePenalty(target, appeal.penalty, now);
          tx.put('users', target.id, target);
        }
        appeal.status = 'approved';
        const auditId = newId();
        tx.put('audit', auditId, { id: auditId, actorId, targetId: appeal.ownerId, action: 'appeal_approved', appealId: appeal.id, note, createdAt: now });
      } else {
        appeal.status = 'rejected';
        const auditId = newId();
        tx.put('audit', auditId, { id: auditId, actorId, targetId: appeal.ownerId, action: 'appeal_rejected', appealId: appeal.id, note, createdAt: now });
      }
      appeal.reviewedAt = now;
      appeal.reviewerId = user.id;
      appeal.reviewNote = note;
      tx.put('appealKeys', appeal.ownerId, { id: appeal.ownerId, pending: false, appealId: appeal.id, resolvedAt: now });
      tx.put('appeals', appeal.id, appeal);
      return appeal;
    }
    default: throw new Error('不支持的操作');
  }
}
module.exports = { execute, defaults, username, newId };
