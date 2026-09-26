import {assert} from './domain.mjs';
import {crypt} from './security.mjs';
const enc=new TextEncoder(),b64=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
export function allowedEndpoint(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hash&&['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'].includes(u.hostname)&&value.length<2048;}catch{return false;}}
export async function notifications({path,method,u,read,one,run,limit,keyText}){
 const reply=x=>new Response(JSON.stringify(x),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(path==='/api/notifications/key'&&method==='POST'){await limit('push-setup:'+u.id,10,3600000);let key=await one('SELECT * FROM push_keys WHERE id=1');if(!key){const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);await run('INSERT OR IGNORE INTO push_keys VALUES(1,?,?)',b64(await crypto.subtle.exportKey('raw',pair.publicKey)),await crypt(JSON.stringify(await crypto.subtle.exportKey('jwk',pair.privateKey)),keyText));key=await one('SELECT * FROM push_keys WHERE id=1');}return reply({publicKey:key.publicKey});}
 if(path==='/api/notifications/subscription'&&['POST','DELETE'].includes(method)){const b=await read(5000);assert(allowedEndpoint(b.endpoint),400,'Desteklenen bir tarayıcı bildirim adresi gerekiyor.');if(method==='DELETE')await run('DELETE FROM push_subscriptions WHERE endpoint=? AND userId=?',b.endpoint,u.id);else{await limit('push-subscribe:'+u.id,20,3600000);const existing=await one('SELECT userId FROM push_subscriptions WHERE endpoint=?',b.endpoint);assert(!existing||existing.userId===u.id,409,'Bu cihaz başka hesaba bağlı; önce o hesaptan bildirimleri kapatın.');assert((await one('SELECT COUNT(*) n FROM push_subscriptions WHERE userId=?',u.id)).n<10||existing,400,'En fazla 10 cihaz bağlanabilir.');await run('INSERT OR IGNORE INTO push_subscriptions VALUES(?,?,?)',b.endpoint,u.id,new Date().toISOString());}return reply({ok:true});}
 assert(false,404,'Bildirim işlemi bulunamadı.');
}
export async function sendPush({userId,one,all,run,keyText,origin,transport=fetch}){
 const preferences=JSON.parse((await one('SELECT data FROM user_preferences WHERE userId=?',userId))?.data||'{}');if(preferences.notifications?.messages===false)return;
 const subscriptions=await all('SELECT endpoint FROM push_subscriptions WHERE userId=?',userId);if(!subscriptions.length)return;
 const saved=await one('SELECT * FROM push_keys WHERE id=1');if(!saved)return;
 const privateKey=await crypto.subtle.importKey('jwk',JSON.parse(await crypt(saved.privateKey,keyText,true)),{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 for(const {endpoint} of subscriptions){if(!allowedEndpoint(endpoint))continue;try{const header=b64(enc.encode(JSON.stringify({typ:'JWT',alg:'ES256'}))),claims=b64(enc.encode(JSON.stringify({aud:new URL(endpoint).origin,exp:Math.floor(Date.now()/1000)+3600,sub:origin}))),input=header+'.'+claims;const jwt=input+'.'+b64(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},privateKey,enc.encode(input)));
 // RFC 8030: an empty push has no message payload. No family names or chat text leave this server.
 const response=await transport(endpoint,{method:'POST',headers:{Authorization:'vapid t='+jwt+', k='+saved.publicKey,TTL:'60',Urgency:'normal'},redirect:'error',signal:AbortSignal.timeout(6000)});
 if([404,410].includes(response.status))await run('DELETE FROM push_subscriptions WHERE endpoint=?',endpoint);
 else if(!response.ok)console.error('Push service rejected notification',response.status);
 }catch{console.error('Push notification could not be delivered');}}
}
