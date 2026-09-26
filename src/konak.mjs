import {assert,clean} from './domain.mjs';
import {folded} from './search.mjs';
import {visiblePhoto} from './archive.mjs';
const categories=['messages','tags','comments','birthdays','events','weekly'];
export async function konak(ctx){
 const {path,method,url,u,read,one,all,run}=ctx;
 const reply=x=>new Response(JSON.stringify(x),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(path==='/api/experience/preferences'){
  const saved=JSON.parse((await one('SELECT data FROM user_preferences WHERE userId=?',u.id))?.data||'{}');
  if(method==='GET')return reply(saved);
  assert(method==='PUT',405,'İşlem desteklenmiyor.');const b=await read(4000);
  if(b.notifications){saved.notifications ||= {};for(const key of categories)if(typeof b.notifications[key]==='boolean')saved.notifications[key]=b.notifications[key];}
  if(typeof b.easy==='boolean')saved.easy=b.easy;if(typeof b.onboardingDismissed==='boolean')saved.onboardingDismissed=b.onboardingDismissed;
  if(b.markRead===true)saved.readAt=new Date().toISOString();
  await run('INSERT INTO user_preferences VALUES(?,?,?) ON CONFLICT(userId) DO UPDATE SET data=excluded.data,updatedAt=excluded.updatedAt',u.id,JSON.stringify(saved),new Date().toISOString());return reply(saved);
 }
 if(path==='/api/experience/message-search'&&method==='GET'){
  const q=clean(url.searchParams.get('q'),160);assert(q.length>=2,400,'En az iki karakter yaz.');
  const pattern='%'+q.toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i').replace(/[!%_]/g,'!$&')+'%',offset=Math.min(10000,Math.max(0,Number(url.searchParams.get('offset'))||0));
  const items=await all(`SELECT m.id AS id,m.body,m.createdAt AS createdAt,'dm' kind,CASE WHEN m.senderId=? THEN m.recipientId ELSE m.senderId END targetId,v.name FROM messages m JOIN users v ON v.id=CASE WHEN m.senderId=? THEN m.recipientId ELSE m.senderId END WHERE (m.senderId=? OR m.recipientId=?) AND ${folded('m.body')} LIKE ? ESCAPE '!'
   UNION ALL SELECT m.id,m.body,m.createdAt,'group' kind,m.groupId targetId,g.name FROM group_messages m JOIN family_groups g ON g.id=m.groupId JOIN group_members gm ON gm.groupId=m.groupId AND gm.userId=? WHERE ${folded('m.body')} LIKE ? ESCAPE '!' ORDER BY createdAt DESC,id DESC LIMIT 41 OFFSET ?`,u.id,u.id,u.id,u.id,pattern,u.id,pattern,offset);
  return reply({items:items.slice(0,40),hasMore:items.length>40,nextOffset:offset+40});
 }
 if(path==='/api/experience/review'&&method==='GET'){
  assert(u.role!=='member',403,'İnceleme alanı moderatörlere açık.');const suggestions=await all("SELECT s.id,s.photoId,s.createdAt,p.title,u.name author FROM photo_suggestions s JOIN photos p ON p.id=s.photoId JOIN users u ON u.id=s.createdBy WHERE s.status='pending' AND p.deletedAt IS NULL ORDER BY s.createdAt DESC LIMIT 100"),items=[];
  for(const s of suggestions)if(await visiblePhoto(one,u,s.photoId))items.push(s);
  return reply({suggestions:items});
 }
 return null;
}
