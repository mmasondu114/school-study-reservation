'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {promisify}=require('node:util');
const {createStore}=require('./store');
const {createStudy}=require('../cloudfunctions/study/application');
const {signature}=require('../cloudfunctions/study/web-gateway');
const scrypt=promisify(crypto.scrypt);
const allowed=new Set(['webPasswordLogin','me','logout','availability','book','bookings','cancel','reports','report','uploadEvidence','evidenceUrls','review','previewPenalty','users','audit','settings','createUser','role','ban','resetPassword','changePassword','submitFeedback','feedbackList']);
const cookie=(name,value,maxAge)=>`${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;
async function createLocalApp({directory,origin}){
  const store=await createStore(directory),secret=crypto.randomBytes(32).toString('hex');
  const photoRoot=path.join(directory,'photos');await fs.mkdir(photoRoot,{recursive:true,mode:0o700});
  let initial;
  try { initial=JSON.parse(await fs.readFile(path.join(directory,'initial-accounts.json'),'utf8')); }
  catch(e){if(e.code!=='ENOENT'){await store.close();throw e;}initial={accounts:[],shortcutUsername:''};}
  async function seed(){
    if(store.read('settings','localInitialized'))return;
    const accounts=[];
    if(!Array.isArray(initial.accounts)||!initial.accounts.length)throw new Error('首次启动请按照 docs/local-website.md 配置 .local-study/initial-accounts.json');
    const ids=new Set();
    for(const item of initial.accounts){
      const {id,name,role,password}=item;
      if(typeof id!=='string'||!/^[a-z0-9_-]{3,32}$/.test(id)||ids.has(id)||typeof name!=='string'||!name.trim()||!['student','reviewer','admin'].includes(role)||typeof password!=='string'||password.length<1||password.length>100)throw new Error('初始化账号配置无效');
      ids.add(id);
      const salt=crypto.randomBytes(16).toString('hex');accounts.push({id,name,role,authSource:role==='student'?'school':'local',mustChangePassword:item.mustChangePassword??role!=='student',password:{salt,digest:(await scrypt(password,salt,32)).toString('hex')},sessionVersion:0,weeks:{},active:[],createdAt:Date.now()});
    }
    await store.transaction(async tx=>{if(await tx.get('settings','localInitialized'))return;for(const user of accounts)if(!await tx.get('users',user.id))tx.put('users',user.id,user);if(!await tx.get('settings','main'))tx.put('settings','main',{id:'main',seatCount:10,openSlot:16,closeSlot:44,notice:'本地测试自习区：请选择具体座位和时间，预约记录保存在本机。'});tx.put('settings','localInitialized',{id:'localInitialized',createdAt:Date.now()});});
  }
  try{await seed();}catch(e){await store.close();throw e;}
  const photoName=id=>{if(!/^local:\/\/[a-f0-9]{32}\.(jpg|png)$/.test(id))throw new Error('照片地址无效');return id.slice(8);};
  const signPhoto=(id,expires)=>crypto.createHmac('sha256',secret).update(id+'\n'+expires).digest('hex');
  const cloud={init(){},database:store.database,
    async uploadFile({cloudPath,fileContent}){const name=crypto.randomBytes(16).toString('hex')+(cloudPath.endsWith('.png')?'.png':'.jpg');await fs.writeFile(path.join(photoRoot,name),fileContent,{flag:'wx',mode:0o600});return{fileID:'local://'+name};},
    async deleteFile({fileList}){for(const id of fileList)await fs.unlink(path.join(photoRoot,photoName(id))).catch(e=>{if(e.code!=='ENOENT')throw e;});},
    async getTempFileURL({fileList}){const expires=Date.now()+300000;return{fileList:await Promise.all(fileList.map(async id=>{const name=photoName(id);await fs.access(path.join(photoRoot,name));return{tempFileURL:'/api/evidence/'+name+'?expires='+expires+'&sig='+signPhoto(id,expires)};}))};}
  };
  const main=createStudy(cloud,{env:{WEB_GATEWAY_SECRET:secret,WEB_SITE_ORIGIN:origin}});
  function send(res,status,data,headers={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(data));}
  async function handle(req,res){
    const url=new URL(req.url,origin);
    if(!url.pathname.startsWith('/api/'))return false;
    if(req.headers.host!==new URL(origin).host){send(res,403,{ok:false,message:'请求地址无效'});return true;}
    if(req.headers['sec-fetch-site']==='cross-site'){send(res,403,{ok:false,message:'请求来源无效'});return true;}
    try{
      if(url.pathname.startsWith('/api/evidence/')){
        if(req.method!=='GET')return send(res,405,{ok:false,message:'请求方式无效'}),true;
        const name=url.pathname.slice('/api/evidence/'.length),id='local://'+name,expires=url.searchParams.get('expires'),sig=url.searchParams.get('sig')||'';
        photoName(id);
        if(!/^\d{13}$/.test(expires||'')||Number(expires)<=Date.now()||! /^[a-f0-9]{64}$/.test(sig)||!crypto.timingSafeEqual(Buffer.from(sig,'hex'),Buffer.from(signPhoto(id,expires),'hex')))return send(res,403,{ok:false,message:'照片链接无效或已过期'}),true;
        const bytes=await fs.readFile(path.join(photoRoot,name));res.writeHead(200,{'Content-Type':name.endsWith('.png')?'image/png':'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});res.end(bytes);return true;
      }
      if(url.pathname!=='/api/study')return send(res,404,{ok:false,message:'接口不存在'}),true;
      if(req.method==='GET')return send(res,200,{ready:true,mode:'local'}),true;
      if(req.method!=='POST')return send(res,405,{ok:false,message:'请求方式无效'}),true;
      if(req.headers.origin!==origin)return send(res,403,{ok:false,message:'请求来源无效'}),true;
      const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1100000)return send(res,413,{ok:false,message:'上传内容过大'}),true;chunks.push(chunk);}
      const {action,input={}}=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!allowed.has(action))return send(res,400,{ok:false,message:'不支持的操作'}),true;
      const cookies=Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim().split('=')).filter(x=>x.length===2));
      const clientId=/^[a-f0-9]{64}$/.test(cookies.study_client||'')?cookies.study_client:crypto.randomBytes(32).toString('hex');
      // An empty username selects the local shortcut account; normal password/session checks still apply.
      const actualInput=action==='webPasswordLogin'&&(input.username===undefined||input.username==='')?{...input,username:initial.shortcutUsername||''}:input;
      const body=JSON.stringify({action,input:actualInput,token:cookies.study_session||'',clientId,origin}),timestamp=String(Date.now()),nonce=crypto.randomBytes(16).toString('hex');
      const response=await main({httpMethod:'POST',body,headers:{'x-study-timestamp':timestamp,'x-study-nonce':nonce,'x-study-signature':signature(secret,timestamp,nonce,body)}});
      const answer=JSON.parse(response.body),setCookies=[cookie('study_client',clientId,365*86400)];
      if(answer.data?.token){setCookies.push(cookie('study_session',answer.data.token,43200));delete answer.data.token;}
      if((action==='logout'||action==='changePassword')&&answer.ok)setCookies.push(cookie('study_session','',0));
      send(res,answer.ok?200:400,answer,{'Set-Cookie':setCookies});return true;
    }catch(e){send(res,500,{ok:false,message:'本地请求失败，请检查输入或服务日志'});return true;}
  }
  return{handle,close:store.close,store};
}
module.exports={createLocalApp};
