'use strict';

const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
const d = require('./domain');
const service = require('./service');
const schoolAuth = require('./school-auth');
const { verifyGateway } = require('./web-gateway');
function createStudy(cloud, options = {}) {
const env = options.env || process.env;
const clock = options.now || Date.now;
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const collection = 'study_records';
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const key = (kind, id) => kind + ':' + id;
const dependencies = {
  async hashSchoolPassword(password) {
    d.assert(typeof password === 'string' && password.length >= 1 && password.length <= 100, '请填写学校账号的原密码');
    const salt = crypto.randomBytes(16).toString('hex');
    return { salt, digest: (await scrypt(password, salt, 32)).toString('hex') };
  },
  async hashPassword(password) {
    d.assert(typeof password === 'string' && password.length >= 10 && password.length <= 100 && /[A-Za-z]/.test(password) && /\d/.test(password), '密码须为10～100位，包含字母和数字');
    const salt = crypto.randomBytes(16).toString('hex');
    return { salt, digest: (await scrypt(password, salt, 32)).toString('hex') };
  },
  async verifyPassword(password, stored) {
    if (typeof password !== 'string' || password.length > 100) return false;
    const salt = stored && typeof stored.salt === 'string' ? stored.salt : 'invalid-account-timing-salt';
    const actual = await scrypt(password, salt, 32);
    return !!stored && typeof stored.digest === 'string' && /^[a-f0-9]{64}$/.test(stored.digest) && crypto.timingSafeEqual(actual, Buffer.from(stored.digest, 'hex'));
  }
};
async function getFrom(source, kind, id) {
  try {
    const result = await source.collection(collection).doc(key(kind, id)).get();
    const record = Array.isArray(result.data) ? result.data[0] : result.data;
    if (!record) return null;
    const { _id, _type, ...data } = record;
    return data;
  } catch (error) {
    if (/document.*(not exist|not found)|DATABASE_DOCUMENT_NOT_EXIST/i.test(error.message || error.errMsg || '')) return null;
    throw error;
  }
}
const read = (kind, id) => getFrom(db, kind, id);
async function transaction(work) {
  return db.runTransaction(async native => {
    const cache = new Map(), writes = new Map();
    const tx = {
      async get(kind, id) {
        const k = key(kind, id);
        if (!cache.has(k)) cache.set(k, await getFrom(native, kind, id));
        return cache.get(k);
      },
      put(kind, id, value) {
        cache.set(key(kind, id), value);
        writes.set(key(kind, id), { ...value, _type: kind });
      }
    };
    const result = await work(tx);
    for (const [id, data] of writes) await native.collection(collection).doc(id).set({ data });
    return result;
  });
}
async function list(kind, filter = {}, offset = 0, limit = 30) {
  d.assert(Number.isInteger(offset) && offset >= 0 && offset <= 10000, '分页参数无效');
  const result = await db.collection(collection).where({ _type: kind, ...filter }).orderBy('createdAt', 'desc').skip(offset).limit(limit).get();
  return result.data.map(({ _id, _type, ...data }) => data);
}
async function limitLogin(identity, now) {
  // Counters cover both the browser identity and account name.
  const counterId = hash(identity);
  await transaction(async tx => {
    let counter = await tx.get('loginLimits', counterId);
    if (!counter || counter.resetAt <= now) counter = { id: counterId, count: 0, resetAt: now + 15 * 60 * 1000 };
    d.assert(counter.count < 20, '登录尝试过多，请15分钟后再试');
    counter.count += 1; tx.put('loginLimits', counterId, counter);
  });
}
function sessionRecord(tx, token, user, client, now) {
  tx.put('sessions', hash(token), { id: hash(token), ownerId: user.id, client, channel: 'web', authMethod: 'password', version: user.sessionVersion || 0, expiresAt: now + 12 * 60 * 60 * 1000, createdAt: now });
}
async function authenticate(token, client, now, source = { get: read }) {
  d.assert(typeof token === 'string' && /^[a-f0-9]{64}$/.test(token), '请先登录');
  const session = await source.get('sessions', hash(token));
  d.assert(session && session.channel === 'web' && session.authMethod === 'password' && session.client === client && session.expiresAt > now, '登录已过期，请重新登录');
  const user = await source.get('users', session.ownerId);
  d.assert(user && (user.sessionVersion || 0) === session.version, '账号信息已变更，请重新登录');
  if (d.isSchoolAccount(user)) d.assert(user.enrollmentStatus !== 'inactive', '学校账号已停用，请联系管理员');
  return user;
}
function cleanReport(report, user) {
  if (user.role !== 'student') return report;
  const { targetId, reviewerId, photos, ...safe } = report;
  return safe;
}
async function webPasswordLogin(input, client, now) {
  const id = service.username(input.username);
  await limitLogin(client,now); await limitLogin('web-account:' + id,now);
  let user = await read('users',id);
  // Bootstrap is available only for the exact credential supplied in server environment variables.
  if (!user && env.INITIAL_ADMIN_USERNAME && id === env.INITIAL_ADMIN_USERNAME.toLowerCase() && env.INITIAL_ADMIN_PASSWORD && input.password === env.INITIAL_ADMIN_PASSWORD) {
    const password = await dependencies.hashPassword(input.password);
    user = await transaction(async tx => {
      const existing = await tx.get('users', id);
      if (existing) return existing;
      d.assert(!(await tx.get('settings', 'bootstrap')), '管理员已初始化');
      const first = { id, name: '议事委员会管理员', role: 'admin', password, mustChangePassword: true, sessionVersion: 0, weeks: {}, active: [], createdAt: now };
      tx.put('users', id, first); tx.put('settings', 'bootstrap', { id: 'bootstrap', createdAt: now });
      return first;
    });
  }
  const valid = d.isSchoolAccount(user) ? await schoolAuth.verifyExistingAccount(user,input.password,dependencies.verifyPassword) : await dependencies.verifyPassword(input.password,user && user.password);
  d.assert(user && valid, '账号或密码错误，或学校账号尚未接入');
  const token = crypto.randomBytes(32).toString('hex');
  return transaction(async tx => {
    const current = await tx.get('users',id);
    d.assert(current && JSON.stringify(current.password) === JSON.stringify(user.password) && (current.sessionVersion || 0) === (user.sessionVersion || 0) && current.enrollmentStatus !== 'inactive', '账号信息已变化，请重新登录');
    sessionRecord(tx,token,current,client,now);
    return {token,user:d.publicUser(current,now)};
  });
}
async function dispatch(event, client, now) {
  const { action, input = {}, token } = event;
  if (action === 'webPasswordLogin') return webPasswordLogin(input,client,now);
  const allowed = new Set(['me','logout','availability','book','bookings','cancel','reports','report','uploadEvidence','evidenceUrls','review','previewPenalty','users','audit','settings','createUser','role','ban','resetPassword','changePassword','submitFeedback','feedbackList','submitAppeal','appeals','reviewAppeal']);
  d.assert(allowed.has(action), '该入口已停用，请使用网站账号密码登录');
  const user = await authenticate(token, client, now);
  if (action === 'logout') {
    await db.collection(collection).doc(key('sessions', hash(token))).remove(); return { loggedOut: true };
  }
  d.assert(!user.mustChangePassword || ['me', 'changePassword'].includes(action), '请先修改初始密码');
  if (action === 'availability') {
    d.interval(input.date, input.start, input.end);
    const settings = await read('settings', 'main') || service.defaults;
    const unavailable = new Set();
    for (let offset = 0; ; offset += 100) {
      const { data } = await db.collection(collection).where({ _type: 'schedules', date: input.date }).skip(offset).limit(100).get();
      for (const schedule of data) for (let i = input.start; i < input.end; i++) if (schedule.slots[i]) unavailable.add(schedule.seat);
      if (data.length < 100) break;
    }
    return { seats: Array.from({ length: settings.seatCount }, (_, i) => ({ number: i + 1, label: String(i + 1).padStart(3, '0'), unavailable: unavailable.has(i + 1) })), settings };
  }
  if (action === 'feedbackList') {
    d.assert(user.role === 'admin', '需要管理员权限');
    d.assert(input.offset === undefined || (Number.isSafeInteger(input.offset) && input.offset >= 0), '分页参数无效');
    return { items: await list('feedback', {}, input.offset || 0) };
  }
  if (action === 'bookings') {
    const filter = user.role === 'admin' && input.all ? {} : { ownerId: user.id };
    if (input.date) { d.dayStart(input.date); filter.date = input.date; }
    return { items: await list('bookings', filter, input.offset || 0), serverNow: now };
  }
  if (action === 'reports') {
    const filter = user.role === 'student' ? { ownerId: user.id } : {};
    if (input.pending && user.role !== 'student') filter.status = 'pending';
    return { items: (await list('reports', filter, input.offset || 0)).map(r => cleanReport(r, user)) };
  }
  if (action === 'appeals') {
    const filter = user.role === 'student' ? { ownerId: user.id } : {};
    if (input.pending && user.role !== 'student') filter.status = 'pending';
    return { items: await list('appeals', filter, input.offset || 0) };
  }
  if (action === 'evidenceUrls') {
    let report = await read('reports', input.id);
    if (!report) report = await read('appeals', input.id);
    d.assert(report && (['admin', 'reviewer'].includes(user.role) || report.ownerId === user.id), '无权查看照片');
    const result = await cloud.getTempFileURL({ fileList: report.photos || [] });
    d.assert(result.fileList.every(f => f.tempFileURL), '照片暂时无法读取，请重试');
    return { urls: result.fileList.map(f => f.tempFileURL) };
  }
  if (action === 'users') {
    d.assert(user.role === 'admin', '需要管理员权限');
    if (input.username) {
      const target = await read('users', service.username(input.username));
      return { items: target ? [d.publicUser(target, now)] : [] };
    }
    return { items: (await list('users', {}, input.offset || 0)).map(u => d.publicUser(u, now)) };
  }
  if (action === 'audit') {
    d.assert(user.role === 'admin', '需要管理员权限');
    return { items: await list('audit', {}, input.offset || 0) };
  }
  if (action === 'previewPenalty') {
    d.assert(['admin', 'reviewer'].includes(user.role), '需要审核权限');
    let target;
    if (input.reportId) {
      const report = await read('reports', input.reportId);
      d.assert(report && report.status === 'pending', '举报不存在或已处理');
      d.assert(report.ownerId !== user.id && report.targetId !== user.id, '不能审核与自己相关的举报');
      if (await read('incidents', report.bookingId)) return { message: '同一预约已有成立举报，本次将合并处理，不重复处罚。' };
      target = await read('users', report.targetId);
    } else {
      d.assert(user.role === 'admin', '需要管理员权限');
      target = await read('users', service.username(input.username));
    }
    d.assert(target && target.role === 'student', '学生账号不存在');
    if (d.penaltyState(target, now).permanent) return { message: '该学生已经永久封禁，不重复处罚。' };
    const p = d.imposePenalty(structuredClone(target), now, 'preview', 'preview');
    return { message: p.level === 3 ? '将升级为3级：永久封禁预约权限，并取消全部未开始预约。' : '将执行' + p.level + '级处罚：封禁' + [1,3,7][p.level] + '天，扣当周' + p.deducted / 60 + '小时' + (p.nextWeekDeducted ? '及下周5小时' : '') + '，并取消全部未开始预约。' };
  }
  if (action === 'uploadEvidence') {
    d.assert(user.role === 'student', '请使用学生账号举报');
    d.assert(typeof input.base64 === 'string' && input.base64.length <= 960000 && /^[A-Za-z0-9+/]*={0,2}$/.test(input.base64), '照片过大，请压缩到700KB以内');
    const buffer = Buffer.from(input.base64, 'base64');
    const jpeg = buffer.length > 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
    const png = buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    d.assert(buffer.length > 100 && buffer.length <= 700 * 1024 && (jpeg || png), '请上传有效的JPG或PNG照片（最大700KB）');
    const counterId = user.id + '_' + d.dateKey(now);
    await transaction(async tx => {
      const counter = await tx.get('uploadLimits', counterId) || { id: counterId, count: 0 };
      d.assert(counter.count < 30, '今日照片上传已达30张，请明天再试');
      counter.count++; tx.put('uploadLimits', counterId, counter);
    });
    const id = service.newId();
    const result = await cloud.uploadFile({ cloudPath: 'evidence/' + user.id + '/' + id + (jpeg ? '.jpg' : '.png'), fileContent: buffer });
    try {
      await transaction(async tx => tx.put('evidence', id, { id, ownerId: user.id, fileID: result.fileID, createdAt: now }));
    } catch (error) { await cloud.deleteFile({ fileList: [result.fileID] }); throw error; }
    return { id };
  }
  const result = await transaction(async tx => {
    const fresh = await authenticate(token, client, now, tx);
    return service.execute(tx, fresh.id, action, input, now, dependencies);
  });
  return result;
}
return async event => {
  const http = !!(event && event.httpMethod);
  const respond = result => http ? {statusCode:result.ok ? 200 : 400,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},isBase64Encoded:false,body:JSON.stringify(result)} : result;
  try {
    const now = clock();
    if (http) {
      const payload = await verifyGateway(event,now,env.WEB_GATEWAY_SECRET,transaction,env.WEB_SITE_ORIGIN);
      return respond({ok:true,data:await dispatch(payload,'web:'+payload.clientId,now)});
    }
    return respond({ ok: false, message: '小程序及微信登录已封存，请使用网站账号密码登录' });
  }
  catch (error) {
    // Do not return credentials, stack traces, or database diagnostics to the client.
    const message = error.message || '';
    const safe = /[\u4e00-\u9fff]/.test(message) && !error.errCode;
    if (!safe) console.error('study request failed', error.code || error.errCode || 'internal_error');
    return respond({ ok: false, message: safe ? message : '服务暂不可用，请稍后重试或联系管理员' });
  }
};

}
module.exports = { createStudy };
