import {Booking,day,week,id,Settings,User} from './model';
const key='study-commons-demo-v1';
type State={bookings:Booking[]};
export const demoSettings:Settings={seatCount:40,openSlot:16,closeSlot:44,notice:'请在预约时段内使用座位，离开时带走随身物品。保持安静，让每一份专注都被温柔守护。'};
function load():State{try{return JSON.parse(localStorage.getItem(key)||'{"bookings":[]}');}catch{return{bookings:[]};}}
function save(s:State){localStorage.setItem(key,JSON.stringify(s));}
function used(s:State,w:string){return s.bookings.filter(b=>b.status==='active'&&week(b.startAt)===w).reduce((n,b)=>n+b.minutes,0);}
function user(s:State):User{const key=week(Date.now()),u=used(s,key);return{id:'demo-student',name:'体验同学',role:'student',authSource:'school',mustChangePassword:false,quota:{key,remaining:Math.max(0,600-u),used:u,deducted:0},nextQuota:{remaining:600-used(s,week(Date.now()+7*86400000))},penalty:{banned:false,permanent:false,level:-1,until:0}};}
// Deliberately isolated from real accounts. Demo bookings never reach the server.
export async function demoCall(action:string,input:Record<string,any>={}) {
  const s=load();
  if(action==='me')return{user:user(s),settings:demoSettings,serverNow:Date.now()};
  if(action==='bookings')return{items:s.bookings.filter(b=>!input.date||b.date===input.date).reverse().slice(input.offset||0,(input.offset||0)+30),serverNow:Date.now()};
  if(action==='reports')return{items:[]};
  if(action==='availability')return{seats:Array.from({length:demoSettings.seatCount},(_,i)=>({number:i+1,unavailable:[3,7,8,13,17,22,28,33].includes(i+1)||s.bookings.some(b=>b.status==='active'&&b.seat===i+1&&b.date===input.date&&b.start<input.end&&b.end>input.start)})),settings:demoSettings};
  if(action==='book') {
    const startAt=Date.parse(input.date+'T00:00:00+08:00')+input.start*1800000,endAt=Date.parse(input.date+'T00:00:00+08:00')+input.end*1800000,minutes=(input.end-input.start)*30;
    if(startAt<=Date.now()||input.date>=day(Date.now()+7*86400000)||minutes<=0||input.start<16||input.end>44)throw new Error('请选择未来7天内、开放时间内的有效时段');
    if(used(s,week(startAt))+minutes>600)throw new Error('该周剩余时长不足');
    if(s.bookings.some(b=>b.status==='active'&&b.startAt<endAt&&b.endAt>startAt))throw new Error('你在该时段已有预约');
    if([3,7,8,13,17,22,28,33].includes(input.seat))throw new Error('该座位不可预约');
    const b:Booking={...input,id:id(),ownerId:'demo-student',ownerName:'体验同学',startAt,endAt,minutes,status:'active'} as Booking;
    s.bookings.push(b);save(s);return b;
  }
  if(action==='cancel'){const b=s.bookings.find(b=>b.id===input.id);if(!b||b.status!=='active'||b.startAt<=Date.now())throw new Error('仅可取消尚未开始的预约');b.status='cancelled';b.cancelReason='演示中主动取消';save(s);return{cancelled:true};}
  if(action==='logout')return{};
  throw new Error('此操作需要连接学校后台；演示模式不会提交举报或处理真实学生账号。');
}
