'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

// One owner process, serialized transactions, atomic replacement; never overwrite a corrupt store.
async function createStore(directory) {
  await fs.mkdir(directory,{recursive:true,mode:0o700});
  const file=path.join(directory,'records.json'),lockFile=path.join(directory,'owner.lock');
  try {await fs.writeFile(lockFile,String(process.pid),{flag:'wx',mode:0o600});}
  catch(e){
    if(e.code!=='EEXIST')throw e;
    const pid=Number(await fs.readFile(lockFile,'utf8'));
    let alive=true;try{process.kill(pid,0);}catch(err){if(err.code==='ESRCH')alive=false;else throw err;}
    if(alive||!Number.isInteger(pid)||pid<=0)throw new Error('本地数据正在被另一个服务使用，请勿重复启动');
    await fs.unlink(lockFile);await fs.writeFile(lockFile,String(process.pid),{flag:'wx',mode:0o600});
  }
  let records,queue=Promise.resolve(),closed=false;
  try {const raw=JSON.parse(await fs.readFile(file,'utf8'));if(raw.version!==1||!Array.isArray(raw.records))throw new Error('本地数据库格式错误');records=new Map(raw.records);}
  catch(e){if(e.code==='ENOENT')records=new Map();else{await fs.unlink(lockFile);throw e;}}
  async function transaction(work){
    const result=queue.then(async()=>{
      if(closed)throw new Error('数据库已关闭');
      const snapshot=structuredClone(records);let dirty=false;
      const tx={get:async(kind,id)=>structuredClone(snapshot.get(kind+':'+id)||null),put(kind,id,value){snapshot.set(kind+':'+id,{...structuredClone(value),_id:kind+':'+id,_type:kind});dirty=true;},remove(kind,id){dirty=snapshot.delete(kind+':'+id)||dirty;}};
      const result=await work(tx,snapshot);
      if(dirty){
        const temp=file+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
        try{const handle=await fs.open(temp,'wx',0o600);try{await handle.writeFile(JSON.stringify({version:1,records:[...snapshot]}));await handle.sync();}finally{await handle.close();}await fs.rename(temp,file);}catch(e){await fs.unlink(temp).catch(()=>{});throw e;}
        records=snapshot;
      }
      return result;
    });queue=result.catch(()=>{});return result;
  }
  function collection(tx,snapshot){
    return{doc(key){const i=key.indexOf(':'),kind=key.slice(0,i),id=key.slice(i+1);return{
      async get(){return{data:tx?await tx.get(kind,id):structuredClone(records.get(key)||null)};},
      async set({data}){if(tx)tx.put(kind,id,data);else await transaction(t=>t.put(kind,id,data));},
      async remove(){if(tx)tx.remove(kind,id);else await transaction(t=>t.remove(kind,id));}
    };},where(filter){let offset=0,limit=30,field,desc=true;const query={
      orderBy(key,direction){field=key;desc=direction!=='asc';return query;},skip(n){offset=n;return query;},limit(n){limit=n;return query;},
      async get(){let rows=[...(snapshot||records).values()].filter(row=>Object.entries(filter).every(([k,v])=>row[k]===v));if(field)rows.sort((a,b)=>(desc?-1:1)*((a[field]||0)-(b[field]||0))||a._id.localeCompare(b._id));return{data:structuredClone(rows.slice(offset,offset+limit))};}
    };return query;}};
  }
  return{transaction,read:(kind,id)=>structuredClone(records.get(kind+':'+id)||null),database:()=>({collection:()=>collection(),runTransaction:work=>transaction((tx,snapshot)=>work({collection:()=>collection(tx,snapshot)}))}),async close(){await queue;closed=true;await fs.unlink(lockFile);}};
}
module.exports={createStore};
