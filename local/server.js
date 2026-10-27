'use strict';
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const {createLocalApp}=require('./app');
async function start({port=Number(process.env.STUDY_PORT||5173),directory=path.resolve(process.env.STUDY_DATA_DIR||path.join(__dirname,'../.local-study')),assets=path.resolve(__dirname,'../website/local-dist'),origin=process.env.STUDY_ORIGIN||'http://127.0.0.1:'+port,basePath=process.env.STUDY_BASE_PATH||'/'}={}){
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('STUDY_PORT 无效');
  const publicUrl=new URL(origin);
  if(!['http:','https:'].includes(publicUrl.protocol)||publicUrl.origin!==origin)throw new Error('STUDY_ORIGIN 必须是完整来源地址（不含路径）');
  if(!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(basePath))throw new Error('STUDY_BASE_PATH 必须以斜杠开头和结尾');
  await fs.access(path.join(assets,'index.html'));
  const mode=['localhost','127.0.0.1','[::1]'].includes(publicUrl.hostname)?'local':'server';
  const app=await createLocalApp({directory,origin,basePath,mode});
  const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
  const server=http.createServer(async(req,res)=>{
    try{
      if(req.headers.host!==new URL(origin).host){res.writeHead(403);res.end('Use '+origin);return;}
      if(await app.handle(req,res))return;
      if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
      const url=new URL(req.url,origin),name=decodeURIComponent(url.pathname);
      if(name.includes('..')||name.includes('\\')||name.split('/').some(x=>x.startsWith('.'))){res.writeHead(403);res.end();return;}
      const filename=path.join(assets,name==='/'?'index.html':name);
      const data=await fs.readFile(filename);res.writeHead(200,{'Content-Type':types[path.extname(filename)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'});res.end(req.method==='HEAD'?undefined:data);
    }catch(e){res.writeHead(e.code==='ENOENT'?404:500);res.end('Not available');}
  });
  try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});}catch(e){await app.close();throw e;}
  return{server,app,origin:origin+basePath,async close(){await new Promise(resolve=>server.close(resolve));await app.close();}};
}
if(require.main===module){start().then(runtime=>{console.log('\n自习区已启动：'+runtime.origin+'\n数据保存在配置的数据目录，按 Ctrl+C 停止。\n');if(process.argv.includes('--open')&&process.platform==='darwin')require('node:child_process').execFile('open',[runtime.origin],error=>{if(error)console.error('浏览器未能自动打开，请手动访问：'+runtime.origin);});let closing=false;for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{if(closing)return;closing=true;await runtime.close();process.exit(0);});}).catch(e=>{const hint=e.code==='ENOENT'?'网页文件缺失，请先执行 npm run build:local。':e.code==='EADDRINUSE'?'端口 5173 已被其他程序占用，请关闭占用程序后再启动。':e.message.includes('另一个服务')?'网站可能已在运行，请打开 http://127.0.0.1:5173/ 或双击启动网站.command。':'';console.error('启动失败：'+e.message+(hint?'\n'+hint:''));process.exitCode=1;});}
module.exports={start};
