'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {Readable}=require('node:stream');
const {createLocalApp}=require('../local/app');
const ORIGIN='http://127.0.0.1:5173';
function client(app,jar={},origin=ORIGIN){
 return{jar,async call(action,input={},extra={}){
  const req=Readable.from([Buffer.from(JSON.stringify({action,input}))]);Object.assign(req,{method:'POST',url:'/api/study',headers:{host:new URL(origin).host,origin,cookie:Object.entries(jar).map(([k,v])=>k+'='+v).join('; '),...extra}});
  let status,headers,body;await app.handle(req,{writeHead(s,h){status=s;headers=h;},end(b){body=JSON.parse(b);}});
  for(const entry of headers['Set-Cookie']||[]){const [k,v]=entry.split(';')[0].split('=');jar[k]=v;}
  return{status,headers,...body};
 }};
}
async function fixture(t,options={}){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'study-local-test-'));await fs.writeFile(path.join(dir,'initial-accounts.json'),JSON.stringify({shortcutUsername:'quick-admin',accounts:[{id:'xjy900',name:'示例同学',role:'student',password:'StudentFixture2026!',mustChangePassword:false},{id:'admin',name:'本地管理员',role:'admin',password:'AdminFixture2026!',mustChangePassword:true},{id:'quick-admin',name:'快捷管理员',role:'admin',password:'QuickFixture2026!',mustChangePassword:false}]}));let app=await createLocalApp({directory:dir,origin:ORIGIN,...options});t.after(async()=>{await app.close();await fs.rm(dir,{recursive:true,force:true});});return{dir,get app(){return app},async restart(){await app.close();app=await createLocalApp({directory:dir,origin:ORIGIN,...options});return app;}};}
test('local login uses real password checks, safe cookies and rejects foreign origins and retired routes',async t=>{
 const fx=await fixture(t),c=client(fx.app);
 assert.equal((await c.call('webPasswordLogin',{username:'xjy900',password:'wrong'})).ok,false);
 assert.equal((await c.call('webPasswordLogin',{username:'xjy900',password:'StudentFixture2026!'},{origin:'https://evil.invalid'})).status,403);
 const login=await c.call('webPasswordLogin',{username:'xjy900',password:'StudentFixture2026!'});assert.equal(login.ok,true);assert.equal(login.data.token,undefined);assert.equal(login.data.user.name,'示例同学');
 assert.match(login.headers['Set-Cookie'].find(x=>x.startsWith('study_session=')),/HttpOnly; SameSite=Strict/);
 assert.equal((await c.call('users')).ok,false);
 assert.equal((await c.call('webLoginStart')).ok,false);
 assert.equal((await c.call('me')).data.settings.seatCount,10);
 await c.call('logout');assert.equal((await c.call('me')).ok,false);
});
test('local transaction serializes competing bookings, survives restart and refunds only once',async t=>{
 const fx=await fixture(t),c=client(fx.app);await c.call('webPasswordLogin',{username:'xjy900',password:'StudentFixture2026!'});
 const date=new Date(Date.now()+86400000+28800000).toISOString().slice(0,10),booking={date,seat:1,start:20,end:22};
 const results=await Promise.all([c.call('book',booking),c.call('book',booking)]);assert.equal(results.filter(r=>r.ok).length,1);
 const created=results.find(r=>r.ok).data;
 await assert.rejects(createLocalApp({directory:fx.dir,origin:ORIGIN}),/另一个服务/);
 const next=client(await fx.restart(),c.jar);assert.equal((await next.call('bookings')).data.items[0].id,created.id);
 const before=(await next.call('me')).data.user;assert.equal(before.quota.used+ (before.nextQuota.used||0),60);
 assert.equal((await next.call('cancel',{id:created.id})).ok,true);
 await next.call('cancel',{id:created.id});
 assert.equal((await next.call('bookings')).data.items[0].status,'cancelled');
 const after=(await next.call('me')).data.user;assert.equal(after.quota.used,0);
 const onDisk=await fs.readFile(path.join(fx.dir,'records.json'),'utf8');assert.equal(onDisk.includes('StudentFixture2026!'),false);
});
test('local evidence is private, durable and requires a short-lived signed URL',async t=>{
 const fx=await fixture(t),c=client(fx.app);await c.call('webPasswordLogin',{username:'xjy900',password:'StudentFixture2026!'});
 const bytes=Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(110)]);
 const uploaded=await c.call('uploadEvidence',{base64:bytes.toString('base64')});assert.equal(uploaded.ok,true);
 const evidence=fx.app.store.read('evidence',uploaded.data.id);assert.match(evidence.fileID,/^local:\/\//);
 await fx.app.store.transaction(tx=>tx.put('reports','photo-test',{id:'photo-test',ownerId:'xjy900',photos:[evidence.fileID],status:'pending'}));
 const urls=await c.call('evidenceUrls',{id:'photo-test'});assert.equal(urls.ok,true);
 async function photo(url){let status,body;await fx.app.handle({method:'GET',url,headers:{host:'127.0.0.1:5173'}},{writeHead(s){status=s},end(b){body=b}});return{status,body};}
 assert.equal((await photo('/api/evidence/'+evidence.fileID.slice(8))).status,403);
 const valid=await photo(urls.data.urls[0]);assert.equal(valid.status,200);assert.deepEqual(valid.body,bytes);
 await fx.restart();assert.equal((await photo(urls.data.urls[0])).status,403,'restart expires old photo links');
 const fresh=client(fx.app,c.jar);const freshUrls=await fresh.call('evidenceUrls',{id:'photo-test'});assert.equal((await photo(freshUrls.data.urls[0])).status,200);
});

test('feedback validates ratings, persists once across retries and restart, and is visible only to admins',async t=>{
 const fx=await fixture(t),student=client(fx.app);
 assert.equal((await student.call('submitFeedback',{rating:5,requestId:'a'.repeat(32)})).ok,false);
 await student.call('webPasswordLogin',{username:'xjy900',password:'StudentFixture2026!'});
 for(const rating of [0,6,2.5,'5',null])assert.equal((await student.call('submitFeedback',{rating,requestId:'a'.repeat(32)})).ok,false);
 assert.equal((await student.call('submitFeedback',{rating:4,comment:'x'.repeat(1001),requestId:'a'.repeat(32)})).ok,false);
 assert.equal((await student.call('submitFeedback',{rating:4,comment:{text:'bad'},requestId:'a'.repeat(32)})).ok,false);
 const request={rating:5,comment:'  提交后提示很清楚\n希望更好用  ',requestId:'b'.repeat(32),ownerId:'admin',ownerName:'伪造身份',createdAt:0};
 const submitted=await student.call('submitFeedback',request);assert.equal(submitted.ok,true);
 assert.equal((await student.call('submitFeedback',request)).data.id,submitted.data.id);
 assert.equal((await student.call('submitFeedback',{rating:1,requestId:'c'.repeat(32)})).ok,true,'text is optional');
 assert.equal((await student.call('feedbackList')).ok,false);
 // Isolated fixture setup; no production account or password is changed.
 await fx.app.store.transaction(async tx=>{const admin=await tx.get('users','admin');tx.put('users','admin',{...admin,mustChangePassword:false});const reviewer=await tx.get('users','xjy900');tx.put('users','reviewer',{...reviewer,id:'reviewer',name:'审核测试',role:'reviewer'});});
 const reviewer=client(fx.app);await reviewer.call('webPasswordLogin',{username:'reviewer',password:'StudentFixture2026!'});assert.equal((await reviewer.call('feedbackList')).ok,false);
 const admin=client(fx.app);await admin.call('webPasswordLogin',{username:'admin',password:'AdminFixture2026!'});
 assert.equal((await admin.call('feedbackList',{offset:-1})).ok,false);
 let list=(await admin.call('feedbackList')).data.items;assert.equal(list.length,2);
 const record=list.find(x=>x.id===submitted.data.id);assert.equal(record.ownerId,'xjy900');assert.equal(record.ownerName,'示例同学');assert.equal(record.rating,5);assert.equal(record.comment,'提交后提示很清楚\n希望更好用');assert.ok(record.createdAt>0);
 const restarted=client(await fx.restart(),admin.jar);assert.equal((await restarted.call('feedbackList')).data.items.length,2);
 await fx.app.store.transaction(async tx=>{for(let i=0;i<30;i++)tx.put('feedback','pagination-'+i,{id:'pagination-'+i,ownerId:'xjy900',ownerName:'测试',rating:3,comment:'',createdAt:Date.now()+1000+i});});
 list=(await restarted.call('feedbackList')).data.items;const tail=(await restarted.call('feedbackList',{offset:30})).data.items;assert.equal(list.length,30);assert.equal(tail.length,2);assert.equal(new Set([...list,...tail].map(x=>x.id)).size,32);assert.ok(list[0].createdAt>=list[29].createdAt);
});

test('local shortcut login still verifies the administrator password and keeps existing accounts',async t=>{
 const fx=await fixture(t),c=client(fx.app);
 assert.equal((await c.call('webPasswordLogin',{username:'',password:'incorrect'})).ok,false);
 assert.equal((await c.call('webPasswordLogin',{username:'',password:'StudentFixture2026!'})).ok,false);
 const login=await c.call('webPasswordLogin',{username:'',password:'QuickFixture2026!'});
 assert.equal(login.ok,true);assert.equal(login.data.user.id,'quick-admin');assert.equal(login.data.user.role,'admin');assert.equal(login.data.user.mustChangePassword,false);
 assert.equal((await c.call('feedbackList')).ok,true);
 assert.equal((await c.call('users',{username:'admin'})).data.items[0].role,'admin');
 await c.call('logout');assert.equal((await c.call('feedbackList')).ok,false);
 assert.equal((await c.call('webPasswordLogin',{username:'xjy900',password:'QuickFixture2026!'})).ok,false);
 assert.equal((await c.call('webPasswordLogin',{username:'quick-admin',password:'QuickFixture2026!'})).ok,true);
 const disk=await fs.readFile(path.join(fx.dir,'records.json'),'utf8');assert.equal(disk.includes('"digest":"QuickFixture2026!"'),false);
});

test('HTTPS subpath deployment uses scoped secure cookies and rejects mismatched origins',async t=>{
 const origin='https://school.example:1234';
 const fx=await fixture(t,{origin,basePath:'/study/',mode:'server'}),c=client(fx.app,{},origin);
 const login=await c.call('webPasswordLogin',{username:'',password:'QuickFixture2026!'});assert.equal(login.ok,true);
 for(const value of login.headers['Set-Cookie']){assert.match(value,/Path=\/study\//);assert.match(value,/; Secure/);assert.match(value,/HttpOnly/)}
 assert.equal((await c.call('feedbackList')).ok,true);
 assert.equal((await c.call('me',{}, {origin:'https://school.example'})).status,403,'port belongs to the origin');
 assert.equal((await c.call('me',{}, {host:'other.example'})).status,403);
 let data;await fx.app.handle({method:'GET',url:'/api/study',headers:{host:new URL(origin).host}},{writeHead(){},end(b){data=JSON.parse(b)}});
 assert.deepEqual(data,{ready:true,mode:'server',shortcutLogin:true});
 const student=client(fx.app,{},origin);await student.call('webPasswordLogin',{username:'xjy900',password:'StudentFixture2026!'});
 const photo=await student.call('uploadEvidence',{base64:Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(110)]).toString('base64')});
 const evidence=fx.app.store.read('evidence',photo.data.id);
 await fx.app.store.transaction(tx=>tx.put('reports','subpath-photo',{id:'subpath-photo',ownerId:'xjy900',photos:[evidence.fileID]}));
 const urls=await student.call('evidenceUrls',{id:'subpath-photo'});assert.match(urls.data.urls[0],/^\/study\/api\/evidence\//);
 let status;await fx.app.handle({method:'GET',url:urls.data.urls[0].replace(/^\/study/,''),headers:{host:new URL(origin).host}},{writeHead(s){status=s},end(){}});assert.equal(status,200);
});
