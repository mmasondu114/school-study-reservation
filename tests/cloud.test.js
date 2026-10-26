const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { NOW } = require('./helpers');
const crypto = require('node:crypto');
const { signature } = require('../cloudfunctions/study/web-gateway');
const WEB_SECRET = 'test-only-server-secret-'.repeat(3);
const WEB_ORIGIN = 'https://study.example.invalid';

// Contract fake for wx-server-sdk: exercises the real cloud entrypoint and auth,
// but deliberately does not claim to validate a deployed CloudBase transaction.
function cloudFixture() {
  let records = new Map(), openid = 'wechat-admin', now = NOW, lock = Promise.resolve();
  const storage = new Map();
  function collection(snapshot) {
    return {
      doc(id) { return {
        async get() { return { data: structuredClone(snapshot.get(id) || null) }; },
        async set({ data }) { snapshot.set(id, { ...structuredClone(data), _id: id }); },
        async remove() { snapshot.delete(id); }
      }; },
      where(filter) {
        let offset = 0, limit = 30, sort;
        const query = {
          orderBy(field) { sort = field; return query; }, skip(value) { offset = value; return query; }, limit(value) { limit = value; return query; },
          async get() { let values = [...snapshot.values()].filter(item => Object.entries(filter).every(([key,value]) => item[key] === value)); if (sort) values.sort((a,b) => b[sort]-a[sort]); return { data: structuredClone(values.slice(offset,offset+limit)) }; }
        };
        return query;
      }
    };
  }
  const db = {
    collection: () => collection(records),
    runTransaction(work) {
      const result = lock.then(async () => {
        const snapshot = structuredClone(records);
        const result = await work({ collection: () => collection(snapshot) });
        records = snapshot; return result;
      });
      lock = result.catch(() => {}); return result;
    }
  };
  const cloud = { init() {}, database: () => db, getWXContext: () => ({ OPENID: openid }),
    async uploadFile({ cloudPath, fileContent }) { const fileID = 'cloud://private/' + cloudPath; storage.set(fileID,fileContent); return {fileID}; },
    async deleteFile({fileList}) { fileList.forEach(id => storage.delete(id)); },
    async getTempFileURL({fileList}) { return {fileList:fileList.map(id=>({tempFileURL:storage.has(id)?'https://example.invalid/signed/'+encodeURIComponent(id):''}))}; }
  };
  const main = require('../cloudfunctions/study/application').createStudy(cloud, {now:()=>now,env:{WEB_GATEWAY_SECRET:WEB_SECRET,WEB_SITE_ORIGIN:WEB_ORIGIN,INITIAL_ADMIN_USERNAME:'admin',INITIAL_ADMIN_PASSWORD:'BootstrapSecret123'}});
  const call = (action,input={},token='')=>main({action,input,token});
  const httpEvent = (action,input={},token='',clientId='a'.repeat(64)) => {
    const body=JSON.stringify({action,input,token,clientId,origin:WEB_ORIGIN}),timestamp=String(now),nonce=crypto.randomBytes(16).toString('hex');
    return {httpMethod:'POST',body,headers:{'x-study-timestamp':timestamp,'x-study-nonce':nonce,'x-study-signature':signature(WEB_SECRET,timestamp,nonce,body)}};
  };
  const rawHttp = async event => JSON.parse((await main(event)).body);
  const web = (action,input={},token='',clientId='a'.repeat(64))=>rawHttp(httpEvent(action,input,token,clientId));
  return {call,web,httpEvent,rawHttp, setOpenid(value){openid=value;},setNow(value){now=value;},records:()=>records,storage};
}
async function adminLogin(fx) {
  const first=await fx.web('webPasswordLogin',{username:'admin',password:'BootstrapSecret123'});assert.equal(first.ok,true,first.message);
  assert.equal((await fx.web('changePassword',{oldPassword:'BootstrapSecret123',newPassword:'AdminSecret456'},first.data.token)).ok,true);
  const login=await fx.web('webPasswordLogin',{username:'admin',password:'AdminSecret456'});assert.equal(login.ok,true);return login.data.token;
}
async function schoolFixture(){
  const fx=cloudFixture(),admin=await adminLogin(fx);
  for(const username of ['xjy900','xjy901'])assert.equal((await fx.web('createUser',{username,name:username,role:'student',password:'old123'},admin)).ok,true);
  return{fx,admin};
}
test('website bootstraps admin, forces password change, binds sessions to browser and expires them',async()=>{
 const fx=cloudFixture();
 assert.equal((await fx.web('webPasswordLogin',{username:'admin',password:'wrong'})).ok,false);
 const first=await fx.web('webPasswordLogin',{username:'admin',password:'BootstrapSecret123'});
 assert.equal(first.ok,true);assert.equal(first.data.user.mustChangePassword,true);
 assert.equal((await fx.web('users',{},first.data.token)).ok,false);
 assert.equal((await fx.web('changePassword',{oldPassword:'BootstrapSecret123',newPassword:'AdminSecret456'},first.data.token)).ok,true);
 assert.equal((await fx.web('me',{},first.data.token)).ok,false);
 const login=await fx.web('webPasswordLogin',{username:'admin',password:'AdminSecret456'});
 assert.equal((await fx.web('me',{},login.data.token,'b'.repeat(64))).ok,false);
 assert.equal((await fx.web('me',{},login.data.token)).ok,true);
 fx.setNow(NOW+12*3600000);assert.equal((await fx.web('me',{},login.data.token)).ok,false);
});
test('school password login needs no WeChat data and cannot expose or mutate staff resources',async()=>{
 const {fx}=await schoolFixture();
 const first=await fx.web('webPasswordLogin',{username:'xjy900',password:'old123'});assert.equal(first.ok,true);
 const token=first.data.token;assert.equal(first.data.user.mustChangePassword,false);
 for(const field of ['password','wechatKey','wechatBound','bindingId'])assert.equal(first.data.user[field],undefined);
 for(const action of ['users','audit','createUser','settings','ban'])assert.equal((await fx.web(action,{},token)).ok,false,action);
 assert.equal((await fx.web('bookings',{all:true},token)).data.items.length,0);
 const wrong=await fx.web('webPasswordLogin',{username:'xjy900',password:'wrong'});
 const missing=await fx.web('webPasswordLogin',{username:'missing',password:'wrong'});assert.equal(wrong.message,missing.message);
 assert.equal(fx.records().has('users:missing'),false);
 await fx.web('logout',{},token);assert.equal((await fx.web('me',{},token)).ok,false);
});
test('retired mini-program, binding and QR routes fail even with valid website sessions',async()=>{
 const {fx}=await schoolFixture();const token=(await fx.web('webPasswordLogin',{username:'xjy900',password:'old123'})).data.token;
 for(const action of ['login','wechatLogin','bindStudent','webLoginStart','webLoginPoll','webLoginInfo','approveWebLogin','rejectWebLogin','unbindWechat']){
  assert.equal((await fx.web(action,{},token)).ok,false,action+' HTTP');
  assert.equal((await fx.call(action,{},token)).ok,false,action+' mini');
 }
 assert.equal((await fx.call('me',{},token)).ok,false);
 assert.equal([...fx.records().keys()].some(k=>k.startsWith('webLogins:')||k.startsWith('wechatBindings:')),false);
});
test('legacy QR and mini sessions cannot authenticate after password-only migration',async()=>{
 const {fx}=await schoolFixture();const token='f'.repeat(64),key='sessions:'+crypto.createHash('sha256').update(token).digest('hex');
 for(const channel of ['web','mini']){
  fx.records().set(key,{ownerId:'xjy900',openid:'web:'+'a'.repeat(64),client:'web:'+'a'.repeat(64),channel,version:0,expiresAt:NOW+3600000});
  assert.equal((await fx.web('me',{},token)).ok,false);
 }
 const user=fx.records().get('users:xjy900');user.wechatKey='archived-binding';user.bindingId='legacy';user.weeks={'2026-10-19':{used:60,deducted:0}};
 const login=await fx.web('webPasswordLogin',{username:'xjy900',password:'old123'});assert.equal(login.ok,true);assert.equal(login.data.user.quota.remaining,540);
 assert.equal(fx.records().get('users:xjy900').wechatKey,'archived-binding','historical data is preserved, unused');
});
test('website booking cancellation refunds once and admin penalty applies to website',async()=>{
 const {fx,admin}=await schoolFixture();const token=(await fx.web('webPasswordLogin',{username:'xjy900',password:'old123'})).data.token;
 assert.equal((await fx.web('settings',{addSeats:5,openSlot:16,closeSlot:44,notice:'测试公告',requestId:'c'.repeat(32)},admin)).ok,true);
 const booked=await fx.web('book',{seat:1,date:'2026-10-21',start:20,end:22},token);assert.equal(booked.ok,true,booked.message);
 assert.equal((await fx.web('me',{},token)).data.user.quota.remaining,540);
 assert.equal((await fx.web('cancel',{id:booked.data.id},token)).ok,true);
 assert.equal((await fx.web('me',{},token)).data.user.quota.remaining,600);
 assert.equal((await fx.web('bookings',{},token)).data.items[0].status,'cancelled');
 assert.equal((await fx.web('ban',{username:'xjy900',reason:'现场已核实独立违规',requestId:'d'.repeat(32)},admin)).ok,true);
 const me=(await fx.web('me',{},token)).data.user;assert.equal(me.penalty.banned,true);assert.equal(me.quota.remaining,300);
 assert.equal((await fx.web('book',{seat:2,date:'2026-10-21',start:24,end:26},token)).ok,false);
});
test('school account inactivity and role changes revoke website access appropriately',async()=>{
 const {fx,admin}=await schoolFixture();const token=(await fx.web('webPasswordLogin',{username:'xjy900',password:'old123'})).data.token;
 assert.equal((await fx.web('role',{username:'xjy900',role:'reviewer'},admin)).ok,true);
 assert.equal((await fx.web('me',{},token)).ok,false);
 const reviewer=await fx.web('webPasswordLogin',{username:'xjy900',password:'old123'});assert.equal(reviewer.data.user.role,'reviewer');
 assert.equal((await fx.web('reports',{},reviewer.data.token)).ok,true);
 fx.records().get('users:xjy900').enrollmentStatus='inactive';
 assert.equal((await fx.web('me',{},reviewer.data.token)).ok,false);
 assert.equal((await fx.web('webPasswordLogin',{username:'xjy900',password:'old123'})).ok,false);
});
test('password attempts are throttled per browser and account',async()=>{
 const fx=cloudFixture();
 for(let i=0;i<20;i++)await fx.web('webPasswordLogin',{username:'invalid'+i,password:'wrong'});
 assert.match((await fx.web('webPasswordLogin',{username:'admin',password:'BootstrapSecret123'})).message,/尝试过多/);
 fx.setNow(NOW+15*60000);assert.equal((await fx.web('webPasswordLogin',{username:'admin',password:'BootstrapSecret123'})).ok,true);
 const other=cloudFixture();for(let i=0;i<20;i++)await other.web('webPasswordLogin',{username:'student',password:'wrong'},'',i.toString(16).padStart(64,'0'));
 assert.match((await other.web('webPasswordLogin',{username:'student',password:'wrong'},'','f'.repeat(64))).message,/尝试过多/);
});
test('gateway rejects unsigned calls, tampering, replay, expiry and foreign origins',async()=>{
 const {fx}=await schoolFixture(),input={username:'xjy900',password:'old123'};
 const r=fx.httpEvent('webPasswordLogin',input);assert.equal((await fx.rawHttp(r)).ok,true);assert.equal((await fx.rawHttp(r)).ok,false);
 const tampered=fx.httpEvent('webPasswordLogin',input);tampered.body=tampered.body.replace('xjy900','xjy901');assert.equal((await fx.rawHttp(tampered)).ok,false);
 const stale=fx.httpEvent('webPasswordLogin',input);fx.setNow(NOW+60001);assert.equal((await fx.rawHttp(stale)).ok,false);
 const wrong=fx.httpEvent('webPasswordLogin',input);wrong.body=wrong.body.replace(WEB_ORIGIN,'https://evil.example.invalid');wrong.headers['x-study-signature']=signature(WEB_SECRET,wrong.headers['x-study-timestamp'],wrong.headers['x-study-nonce'],wrong.body);assert.equal((await fx.rawHttp(wrong)).ok,false);
 const unsigned=fx.httpEvent('webPasswordLogin',input);unsigned.headers={};assert.equal((await fx.rawHttp(unsigned)).ok,false);
});
test('SDK adapter retains set semantics and blocks prototype pollution',()=>{
 const moduleRequire=createRequire(path.resolve(__dirname,'../cloudfunctions/study/package.json'));const set=moduleRequire('lodash.set'),target={};set(target,'a.b',3);assert.deepEqual(target,{a:{b:3}});
 set({},'__proto__.studyPollution',true);set({},'constructor.prototype.studyPollution',true);assert.equal({}.studyPollution,undefined);
});
