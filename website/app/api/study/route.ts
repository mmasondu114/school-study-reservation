import { env } from 'cloudflare:workers';
import { cookie,hex,parseCookies,sign } from '@/lib/gateway';

const allowed=new Set(['webPasswordLogin','me','logout','availability','book','bookings','cancel','reports','report','uploadEvidence','evidenceUrls','review','previewPenalty','users','audit','settings','createUser','role','ban','resetPassword','changePassword','submitFeedback','feedbackList']);
const config=()=>env as unknown as Record<string,string|undefined>;
const response=(data:unknown,status=200,headers=new Headers())=>{headers.set('Content-Type','application/json; charset=utf-8');headers.set('Cache-Control','no-store');headers.set('X-Content-Type-Options','nosniff');return new Response(JSON.stringify(data),{status,headers});};
export async function GET(){const e=config();return response({ready:!!(e.STUDY_API_URL&&e.STUDY_GATEWAY_SECRET&&e.STUDY_GATEWAY_SECRET.length>=32)});}
export async function POST(request:Request) {
  const origin=new URL(request.url).origin;
  if(request.headers.get('origin')!==origin) return response({ok:false,message:'请求来源无效'},403);
  const e=config();
  if(!e.STUDY_API_URL || !e.STUDY_GATEWAY_SECRET || e.STUDY_GATEWAY_SECRET.length<32) return response({ok:false,message:'网站尚未连接学校后台，请先体验界面'},503);
  if(!e.STUDY_API_URL.startsWith('https://'))return response({ok:false,message:'后台连接配置无效'},503);
  const headers=new Headers(),secure=new URL(request.url).protocol==='https:';
  try {
    if(Number(request.headers.get('content-length')||0)>1100000) return response({ok:false,message:'上传内容过大'},413);
    const raw=await request.text();if(raw.length>1100000)return response({ok:false,message:'上传内容过大'},413);
    const {action,input={}}=JSON.parse(raw);
    if(!allowed.has(action))return response({ok:false,message:'不支持的操作'},400);
    const cookies=parseCookies(request.headers.get('cookie')||'');
    const clientId=/^[a-f0-9]{64}$/.test(cookies.study_client||'')?cookies.study_client:hex(crypto.getRandomValues(new Uint8Array(32)));
    headers.append('Set-Cookie',cookie('study_client',clientId,secure,365*86400));
    const actualInput={...input};
    headers.append('Set-Cookie',cookie('study_pending','',secure,0));
    const body=JSON.stringify({action,input:actualInput,token:cookies.study_session||'',clientId,origin});
    const timestamp=Date.now().toString(),nonce=hex(crypto.getRandomValues(new Uint8Array(16)));
    const result=await fetch(e.STUDY_API_URL,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','x-study-timestamp':timestamp,'x-study-nonce':nonce,'x-study-signature':await sign(e.STUDY_GATEWAY_SECRET,timestamp,nonce,body)},body,signal:AbortSignal.timeout(20000)});
    let answer=await result.json() as {ok:boolean;message?:string;data?:Record<string,unknown>;body?:string};
    // Supports CloudBase HTTP direct responses and explicitly configured integrated responses.
    if(answer.body && typeof answer.body==='string')answer=JSON.parse(answer.body);
    if(answer.data?.token && typeof answer.data.token==='string') {
      headers.append('Set-Cookie',cookie('study_session',answer.data.token,secure,43200));

      delete answer.data.token;
    }
    if((action==='logout'||action==='changePassword')&&answer.ok)headers.append('Set-Cookie',cookie('study_session','',secure,0));
    return response(answer,answer.ok?200:400,headers);
  } catch {return response({ok:false,message:'暂时无法连接学校后台，请稍后重试'},502,headers);}
}
