import {audienceSQL} from './audience.mjs';
import {assert,clean} from './domain.mjs';
import {photoVisibleSQL,visiblePhoto} from './archive.mjs';
const normalize=s=>String(s).toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i');
export function folded(expr){for(const [a,b] of [['İ','i'],['I','i'],['ı','i'],['Ş','s'],['ş','s'],['Ğ','g'],['ğ','g'],['Ç','c'],['ç','c'],['Ö','o'],['ö','o'],['Ü','u'],['ü','u']])expr="replace("+expr+",'"+a+"','"+b+"')";return 'lower('+expr+')';}
export async function search({path,url,u,all,one}){
 const reply=x=>new Response(JSON.stringify(x),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(path.startsWith('/api/search/photo/')){const p=await visiblePhoto(one,u,path.split('/').pop());assert(p,404,'Fotoğraf bulunamadı.');return reply({...p,url:'/media/'+p.id,peopleIds:(await all('SELECT personId FROM photo_people WHERE photoId=?',p.id)).map(x=>x.personId)});}
 const q=clean(url.searchParams.get('q'),160),offset=Math.min(10000,Math.max(0,Number(url.searchParams.get('offset'))||0));assert(q.length>=2,400,'En az iki karakter yazın.');
 const terms=normalize(q).replace(/(\d{3})0['’]?(?:larda|lerde|lar|ler)/g,'$1').split(/\s+/).filter(Boolean).slice(0,8),args=[];
 const person=id=>"(NOT EXISTS(SELECT 1 FROM person_guardians g WHERE g.personId="+id+" AND g.userId!=?) OR ?='owner')";
 const pArgs=[u.id,u.role],photoArgs=[u.id,u.role,u.id,u.id,u.id];
 const specs=[
  ['people','id','name',"'Kişi'","'profile'","coalesce(biography,'')||' '||coalesce(place,'')||' '||coalesce(country,'')||' '||coalesce(birthDate,'')","deletedAt IS NULL AND "+person('people.id'),pArgs],
  ['photos','id','title',"'Avlu'","'search-photo'","coalesce(description,'')||' '||coalesce(place,'')||' '||coalesce(date,'')","deletedAt IS NULL AND (status='approved' OR createdBy=? OR ?!='member') AND "+photoVisibleSQL,photoArgs],
  ['events','id','title',"'Etkinlik'","'event-detail'","coalesce(description,'')||' '||coalesce(place,'')||' '||date","deletedAt IS NULL AND (status='approved' OR createdBy=? OR ?!='member') AND "+person('events.personId'),[u.id,u.role,...pArgs]],
  ['documents','id','title',"'Aile Sandığı'","'search-document'","description","deletedAt IS NULL AND (status='approved' OR createdBy=? OR ?!='member')",[u.id,u.role]],
  ['archive_entries e','e.id','e.title',"'Arşiv'","'ar-open'","e.body||' '||CASE WHEN e.kind='quiz' THEN '' ELSE e.data END",audienceSQL('archive','e.id','e.createdBy','(SELECT ?)')+" AND e.deletedAt IS NULL AND (e.opensAt IS NULL OR e.opensAt<=?) AND (e.status='approved' OR e.createdBy=? OR ?!='member') AND (e.visibility!='private' OR e.createdBy=?) AND "+person('e.personId')+" AND (e.photoId IS NULL OR EXISTS(SELECT 1 FROM photos WHERE photos.id=e.photoId AND deletedAt IS NULL AND (status='approved' OR createdBy=? OR ?!='member') AND "+photoVisibleSQL+"))",[u.id,u.id,u.id,new Date().toISOString(),u.id,u.role,u.id,...pArgs,...photoArgs]]
 ];



 const queries=[];
 for(const [table,id,title,kind,action,body,access,params] of specs){
  const source=table.split(' ')[0],match='kind:"'+table.split(' ')[0]+'" AND content:('+terms.map(t=>'"'+t.replaceAll('"','""')+'"*').join(' AND ')+')';
  const fields=`${id} id,${title} title,${kind} kind,${action} action,createdAt`;
  args.push(...params,match);
  queries.push(`SELECT ${fields} FROM ${table} INDEXED BY search_order_${source} WHERE ${access} AND ${id} IN(SELECT recordId FROM search_fts WHERE search_fts MATCH ? AND kind='${source}')`);
  const missing=(await one(`SELECT (SELECT COUNT(*) FROM ${table})!=(SELECT COUNT(*) FROM search_catalog WHERE kind=?) missing`,source)).missing;
  if(missing){args.push(...params,...terms.map(t=>'%'+t.replace(/[!%_]/g,'!$&')+'%'));const fallback=terms.map(()=>folded(title+"||' '||"+body)+" LIKE ? ESCAPE '!'").join(' AND ');queries.push(`SELECT ${fields} FROM ${table} WHERE ${access} AND NOT EXISTS(SELECT 1 FROM search_catalog WHERE kind='${source}' AND recordId=${id}) AND ${fallback}`);}
 }
 // Nicknames were introduced after the original FTS catalogue; include them even on indexed people.
 queries.push(`SELECT id,name title,'Kişi' kind,'profile' action,createdAt FROM people WHERE deletedAt IS NULL AND ${person('people.id')} AND ${terms.map(()=>folded("name||' '||coalesce(nickname,'')")+" LIKE ? ESCAPE '!'").join(' AND ')}`);
 args.push(...pArgs,...terms.map(t=>'%'+t.replace(/[!%_]/g,'!$&')+'%'));
 const rows=await all(queries.join(' UNION ')+' ORDER BY createdAt DESC,id LIMIT 61 OFFSET ?',...args,offset);
 return reply({items:rows.slice(0,60),hasMore:rows.length>60,nextOffset:offset+60});
}

export async function warmSearchIndex({all,batch}){
 const statements=[];for(const [table,column] of [['people','name'],['photos','title'],['events','title'],['documents','title'],['archive_entries','title']]){
 const rows=await all(`SELECT id FROM ${table} WHERE NOT EXISTS(SELECT 1 FROM search_catalog WHERE kind=? AND recordId=${table}.id) LIMIT 50`,table);
 for(const {id} of rows)statements.push([`UPDATE ${table} SET ${column}=${column} WHERE id=?`,id]);}
 for(let i=0;i<statements.length;i+=50)await batch(statements.slice(i,i+50));return statements.length;
}
