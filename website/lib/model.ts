export type User={id:string;name:string;role:'student'|'reviewer'|'admin';authSource:string;mustChangePassword:boolean;quota:{remaining:number;used:number;deducted:number;key:string};nextQuota:{remaining:number};penalty:{banned:boolean;permanent:boolean;level:number;until:number;reason?:string;decayAt?:number}};
export type Settings={seatCount:number;openSlot:number;closeSlot:number;notice:string};
export type Booking={id:string;ownerId:string;ownerName:string;seat:number;date:string;start:number;end:number;startAt:number;endAt:number;minutes:number;status:string;cancelReason?:string};
export type Report={id:string;seat:number;date:string;start:number;end:number;reason:string;status:string;photos?:string[];targetId?:string;ownerId?:string;reviewNote?:string;penalty?:{level:number}};
export type Appeal={id:string;ownerId:string;ownerName:string;penalty:{level:number;reason?:string;until?:number};reason:string;photos?:string[];status:'pending'|'approved'|'rejected';createdAt:number;reviewedAt?:number;reviewerId?:string;reviewNote?:string};
export const day=(ms=Date.now())=>new Date(ms+28800000).toISOString().slice(0,10);
export const time=(n:number)=>String(Math.floor(n/2)).padStart(2,'0')+':'+(n%2?'30':'00');
export const stamp=(ms:number)=>new Date(ms+28800000).toISOString().slice(0,16).replace('T',' ');
export const seatLabel=(n:number)=>String(n).padStart(3,'0');
export const hours=(n:number)=>Number((n/60).toFixed(1));
export const status=(b:Booking)=>b.status==='cancelled'?'已取消':b.endAt<Date.now()?'已结束':b.startAt<Date.now()?'使用中':'待使用';
export const reportStatus:Record<string,string>={pending:'待审核',approved:'举报成立',rejected:'未通过',duplicate:'已合并处理',already_banned:'对象已永久封禁'};
export const appealStatus:Record<string,string>={pending:'申诉待审核',approved:'申诉成立（已撤销处罚）',rejected:'申诉已驳回'};
export function week(ms:number){const weekday=(new Date(ms+28800000).getUTCDay()+6)%7;return day(ms-weekday*86400000);}
export const id=()=>crypto.randomUUID().replaceAll('-','');
