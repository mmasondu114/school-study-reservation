export const hex = (bytes: Uint8Array) => Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
export async function sign(secret:string,timestamp:string,nonce:string,body:string) {
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(timestamp+'\n'+nonce+'\n'+body))));
}
export function parseCookies(header:string) {
  return Object.fromEntries(header.split(';').map(s=>s.trim().split('=')).filter(p=>p.length===2));
}
export function cookie(name:string,value:string,secure:boolean,maxAge:number) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure?'; Secure':''}`;
}
