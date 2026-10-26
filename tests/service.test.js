const test = require('node:test');
const assert = require('node:assert/strict');
const d = require('../cloudfunctions/study/domain');
const { NOW, fixture, booking, reportFixture } = require('./helpers');

test('competing requests produce one booking, one seat lock and one quota charge', async () => {
  const fx = fixture();
  const results = await Promise.allSettled([fx.run('alice','book',booking()),fx.run('bob','book',booking())]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(fx.all('bookings').length, 1);
  assert.equal(d.quota(fx.get('users','alice'),NOW).used + d.quota(fx.get('users','bob'),NOW).used, 60);
});
test('a student cannot double book different seats; adjacent bookings are allowed', async () => {
  const fx = fixture(); await fx.run('alice','book',booking());
  await assert.rejects(fx.run('alice','book',booking(2,21,23)), /已有预约/);
  await fx.run('alice','book',booking(2,22,23));
  assert.equal(d.quota(fx.get('users','alice'),NOW).used, 90);
});
test('quota is charged to reservation week and enforces exactly 10 hours', async () => {
  const fx = fixture(); const sunday = Date.parse('2026-10-18T09:05:00+08:00');
  await fx.run('alice','book',booking(1,16,36,'2026-10-19'),sunday);
  assert.equal(d.quota(fx.get('users','alice'),sunday).used,0);
  assert.equal(d.quota(fx.get('users','alice'),NOW).used,600);
  await assert.rejects(fx.run('alice','book',booking(2,38,39),sunday),/时长不足/);
});
test('booking validates roles, existing seats, horizon, open hours, and future time', async () => {
  const fx=fixture();
  for (const actor of ['admin','reviewer']) await assert.rejects(fx.run(actor,'book',booking()), /学生/);
  for (const input of [booking(0),booking(21),booking(1,14,15),booking(1,44,46),booking(1,16,17),booking(1,20,22,'2026-10-26')]) await assert.rejects(fx.run('alice','book',input));
  assert.equal(fx.all('bookings').length,0);
});
test('cancellation releases seats and refunds original week exactly once', async () => {
  const fx=fixture(); const b=await fx.run('alice','book',booking());
  await assert.rejects(fx.run('bob','cancel',{id:b.id}), /无权/);
  await fx.run('alice','cancel',{id:b.id});
  await assert.rejects(fx.run('alice','cancel',{id:b.id}));
  assert.equal(d.quota(fx.get('users','alice'),NOW).used,0);
  await fx.run('bob','book',booking());
});
test('in-progress reservations cannot be cancelled by student or admin', async () => {
  const fx=fixture(); const b=await fx.run('alice','book',booking());
  for (const actor of ['alice','admin']) await assert.rejects(fx.run(actor,'cancel',{id:b.id},b.startAt), /尚未开始/);
});
test('reports require owned photos, real booking, observed interval and cannot target self', async () => {
  const fx=fixture(); await fx.run('alice','book',booking());
  const input={...booking(),reason:'现场持续大声交谈',photos:[]};
  await assert.rejects(fx.run('bob','report',input,NOW+2*3600000), /照片/);
  fx.put('evidence','photo',{id:'photo',ownerId:'carol',fileID:'cloud://private/photo.jpg'});
  await assert.rejects(fx.run('bob','report',{...input,photos:['photo']},NOW+2*3600000), /照片无效/);
  fx.put('evidence','photo',{id:'photo',ownerId:'alice',fileID:'cloud://private/photo.jpg'});
  await assert.rejects(fx.run('alice','report',{...input,photos:['photo']},NOW+2*3600000), /自己/);
  await assert.rejects(reportFixture(fx,{now:NOW}), /已发生/);
});
test('reporter cannot submit duplicate report for same booking or reuse attached evidence', async () => {
  const fx=fixture(); await fx.run('alice','book',booking());
  await reportFixture(fx);
  await assert.rejects(reportFixture(fx), /已举报/);
  assert.equal(fx.all('reports').length,1);
});
test('review atomically bans, deducts quota, cancels future bookings, and preserves past usage', async () => {
  const fx=fixture(); await fx.run('alice','book',booking());
  const future=await fx.run('alice','book',booking(2,24,26));
  const report=await reportFixture(fx);
  const now=NOW+2*3600000;
  await fx.run('reviewer','review',{id:report.id,decision:'approve',note:'照片证据清晰，核实违规成立'},now);
  const user=fx.get('users','alice');
  assert.equal(user.penalty.level,0);
  assert.equal(d.quota(user,now).used,60); assert.equal(d.quota(user,now).deducted,300);
  assert.equal(fx.get('bookings',future.id).status,'cancelled');
  await assert.rejects(fx.run('alice','book',booking(2,26,28),now),/封禁/);
});
test('multiple reporters and simultaneous reviewers cannot penalize one booking twice', async () => {
  const fx=fixture(); await fx.run('alice','book',booking());
  const first=await reportFixture(fx), second=await reportFixture(fx,{reporter:'carol'});
  const now=NOW+2*3600000;
  const results=await Promise.allSettled([
    fx.run('reviewer','review',{id:first.id,decision:'approve',note:'现场照片核实成立'},now),
    fx.run('admin','review',{id:first.id,decision:'approve',note:'现场照片核实成立'},now),
    fx.run('admin','review',{id:second.id,decision:'approve',note:'同一预约重复举报'},now)
  ]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,2);
  assert.equal(fx.get('users','alice').penalty.level,0);
  assert.equal(fx.get('reports',second.id).status,'duplicate');
  assert.equal(fx.all('audit').filter(a=>a.action==='penalty').length,1);
});
test('rejection has no quota or ban side effects and students cannot review', async () => {
  const fx=fixture(); await fx.run('alice','book',booking()); const report=await reportFixture(fx);
  const args={id:report.id,decision:'reject',note:'照片无法支持所述违规'};
  await assert.rejects(fx.run('bob','review',args),/审核权限/);
  await fx.run('reviewer','review',args);
  assert.equal(fx.get('users','alice').penalty,undefined);
  assert.equal(d.quota(fx.get('users','alice'),NOW).used,60);
});
test('reviewers cannot review their own historical report after a role change', async () => {
  const fx=fixture(); await fx.run('alice','book',booking()); const r=await reportFixture(fx);
  const bob=fx.get('users','bob'); bob.role='reviewer'; fx.put('users','bob',bob);
  await assert.rejects(fx.run('bob','review',{id:r.id,decision:'approve',note:'现场照片核实成立'}),/自己/);
});
test('manual bans require admin role and repeated request ID is idempotent', async () => {
  const fx=fixture(); const input={username:'alice',reason:'管理员现场核实违规事实',requestId:'a'.repeat(32)};
  await assert.rejects(fx.run('reviewer','ban',input), /管理员权限/);
  const first=await fx.run('admin','ban',input), repeat=await fx.run('admin','ban',input);
  assert.equal(first.level,0); assert.deepEqual(first,repeat);
  assert.equal(fx.all('audit').length,1);
});
test('admin can add sequential seats but students and reviewers cannot change settings', async () => {
  const fx=fixture(); const input={addSeats:10,openSlot:16,closeSlot:44,notice:'请安静自习',requestId:'c'.repeat(32)};
  for (const actor of ['alice','reviewer']) await assert.rejects(fx.run(actor,'settings',input),/管理员权限/);
  assert.equal((await fx.run('admin','settings',input)).seatCount,30);
  assert.equal((await fx.run('admin','settings',input)).seatCount,30);
  await assert.rejects(fx.run('admin','settings',{...input,addSeats:-1,requestId:'d'.repeat(32)}));
});
test('reviewer creation and role changes are admin-only; passwords never returned', async () => {
  const fx=fixture(); const input={username:'new-user',name:'新审核员',role:'reviewer',password:'TempPassword123'};
  await assert.rejects(fx.run('reviewer','createUser',input), /管理员权限/);
  const result=await fx.run('admin','createUser',input);
  assert.equal(result.role,'reviewer'); assert.equal(result.password,undefined); assert.equal(result.mustChangePassword,true);
  await assert.rejects(fx.run('admin','createUser',input), /已存在/);
  await assert.rejects(fx.run('new-user','review',{}), /修改初始密码/);
});
test('granting reviewer cancels future bookings; banning prevents promotion', async () => {
  const fx=fixture(); const b=await fx.run('alice','book',booking());
  await fx.run('admin','role',{username:'alice',role:'reviewer'});
  assert.equal(fx.get('bookings',b.id).status,'cancelled');
  assert.equal(fx.get('users','alice').sessionVersion,1);
  await fx.run('admin','ban',{username:'bob',reason:'管理员核实违规成立',requestId:'b'.repeat(32)});
  await assert.rejects(fx.run('admin','role',{username:'bob',role:'reviewer'}),/封禁/);
});
test('local staff password changes revoke sessions; school passwords stay with school', async () => {
  const fx=fixture();
  await fx.run('admin','ban',{username:'alice',reason:'管理员核实违规成立',requestId:'a'.repeat(32)});
  await assert.rejects(fx.run('admin','resetPassword',{username:'alice',password:'NewPassword123'}),/学校原系统/);
  await assert.rejects(fx.run('alice','changePassword',{oldPassword:'old',newPassword:'NewPassword123'}),/学校原系统/);
  assert.equal(fx.get('users','alice').penalty.level,0);
  assert.equal(d.quota(fx.get('users','alice'),NOW).deducted,300);
  await fx.run('admin','resetPassword',{username:'reviewer',password:'NewPassword123'});
  await fx.run('reviewer','changePassword',{oldPassword:'NewPassword123',newPassword:'AnotherPassword123'});
  assert.equal(fx.get('users','reviewer').sessionVersion,2);
  assert.equal(fx.get('users','reviewer').mustChangePassword,false);
});
