// Immediate wakeups in one process, plus bounded DB reconciliation across Worker instances.
const listeners=new Map();
export function publishChange(id){for(const fn of listeners.get(id)||[])fn();}
export function eventStream({u,one,authorize,signal,intervalMs=5000,lifetimeMs=25000}){
 const key=u.id,group=listeners.get(key)||new Set();if(group.size>=3)return new Response('Too many streams',{status:429});listeners.set(key,group);
 let stop;
 const stream=new ReadableStream({start(controller){
  let closed=false,busy=false,last='',tick,expiry;const enc=new TextEncoder();
  stop=()=>{if(closed)return;closed=true;clearInterval(tick);clearTimeout(expiry);group.delete(check);if(!group.size)listeners.delete(key);signal?.removeEventListener('abort',stop);try{controller.close();}catch{}};
  async function check(){if(closed||busy)return;busy=true;try{await authorize();const revision=await one("SELECT (SELECT COALESCE(MAX(id),0) FROM messages WHERE senderId=? OR recipientId=?) lastId,(SELECT COUNT(*) FROM messages WHERE recipientId=? AND readAt IS NULL) unread,(SELECT COUNT(*) FROM messages WHERE senderId=? AND readAt IS NOT NULL) receipts,(SELECT COALESCE(MAX(id),0) FROM group_messages WHERE groupId IN(SELECT groupId FROM group_members WHERE userId=?)) groupId",u.id,u.id,u.id,u.id,u.id);const encoded=JSON.stringify(revision);if(!closed){controller.enqueue(enc.encode(encoded!==last?'event: change\ndata: '+encoded+'\n\n':': keepalive\n\n'));last=encoded;}}catch{stop();}finally{busy=false;}}
  group.add(check);tick=setInterval(check,intervalMs);expiry=setTimeout(stop,lifetimeMs);signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();else check();
 },cancel(){stop?.();}});
 return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-store, no-transform','X-Accel-Buffering':'no'}});
}
