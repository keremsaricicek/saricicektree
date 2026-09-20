import test from 'node:test';import assert from 'node:assert/strict';import{DatabaseSync}from'node:sqlite';import{readFileSync,readdirSync}from'node:fs';import worker from '../worker/index.mjs';import {totp,base32} from '../src/security.mjs';
function fixture(){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');for(const f of readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())db.exec(readFileSync('drizzle/'+f,'utf8'));const files=new Map(),env={OWNER_EMAIL:'owner@test.invalid',CSRF_SECRET:'fixture-encryption-key',DB:{prepare(sql){const s={args:[],bind(...args){s.args=args;return s;},async first(){return db.prepare(sql).get(...s.args)||null;},async all(){return{results:db.prepare(sql).all(...s.args)};},async run(){return{meta:{changes:db.prepare(sql).run(...s.args).changes}};}};return s;},async batch(ss){db.exec('BEGIN');try{const out=[];for(const s of ss)out.push(await s.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}},BUCKET:{async put(k,b){files.set(k,new Uint8Array(b));},async get(k){return files.has(k)?{body:files.get(k)}:null;},async delete(k){files.delete(k);}}};const csrf=new Map();async function call(path,method='GET',data,email='owner@test.invalid',factor=''){if(path==='/api/photos'&&method==='POST')data={date:'2000-01-02',place:'Test location',description:'Test family memory',outsiders:'Test guest',...data};const headers={'Content-Type':'application/json',Origin:'https://family.test','oai-authenticated-user-id':email,'oai-authenticated-user-email':email,'X-CSRF-Token':csrf.get(email)||'','X-Family-Factor':factor};const res=await worker.fetch(new Request('https://family.test'+path,{method,headers,...(data?{body:JSON.stringify(data)}:{})}),env);const type=res.headers.get('Content-Type'),body=type?.includes('json')?await res.json():await res.arrayBuffer();if(body.csrf)csrf.set(email,body.csrf);return{status:res.status,body};}async function member(email){await call('/api/me');const inv=await call('/api/invites','POST',{email,role:'member'});await call('/api/me','GET',null,email);return(await call('/api/accept-invite','POST',{name:email,token:inv.body.url.split('#invite=')[1]},email)).body.user;}return{db,files,env,call,member};}
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5L8AAAAASUVORK5CYII=';
const root='/api/experience/memories';
const meta={date:'1985-06-19',place:'Gaziantep',description:'Aile buluşması',outsiders:'Aile dostumuz',peopleIds:[]};
const upload=(extra={})=>({clientId:crypto.randomUUID(),photos:[{...meta,data:png}],...extra});
test('shared photo album is atomic, mandatory, chronological and idempotent',async()=>{
 const {call,db,files}=fixture();await call('/api/me');
 for(const key of ['date','place','description','outsiders']){const photo={...meta,data:png,[key]:''};assert.equal((await call(root,'POST',upload({photos:[photo]}))).status,400,key);}
 assert.equal(db.prepare('SELECT COUNT(*) n FROM photos').get().n,0);assert.equal(files.size,0);
 const body=upload({share:true,body:'Akışta kalan yorum',photos:[{...meta,data:png},{...meta,date:'1970',datePrecision:'year',data:png}]});
 const r=await call(root,'POST',body);assert.equal(r.status,201,JSON.stringify(r.body));assert.equal(r.body.ids.length,2);assert.equal(files.size,2);
 assert.equal((await call(root,'POST',body)).status,200);assert.equal(files.size,2);assert.equal(db.prepare('SELECT COUNT(*) n FROM feed_posts').get().n,1);
 const photos=(await call(root)).body.items;assert.deepEqual(photos.map(p=>p.date),['1985-06-19','1970-01-01']);assert.equal(photos[1].datePrecision,'year');assert.equal(photos[0].description,meta.description);
 const feed=(await call('/api/experience/feed')).body.items[0];assert.equal(feed.body,'Akışta kalan yorum');assert.equal(feed.images.length,2);
 const bad=upload({photos:[{...meta,data:png},{...meta,place:'',data:png}]});assert.equal((await call(root,'POST',bad)).status,400);assert.equal(files.size,2);
 assert.equal((await call('/api/photos/'+r.body.id,'PATCH',{title:'Eksik',description:''})).status,400);
});
test('duplicates, related photos, portrait and audio respect the selected audience',async()=>{
 const {call,member,db}=fixture(),a=await member('a@test.invalid'),b=await member('b@test.invalid');
 const r=await call(root,'POST',upload({visibility:'selected',userIds:[a.id]})),id=r.body.id;
 const digest=db.prepare('SELECT digest FROM photo_details WHERE photoId=?').get(id).digest;
 assert.equal((await call(root+'/duplicates','POST',{digest},a.email)).body.items.length,1);
 assert.equal((await call(root+'/duplicates','POST',{digest},b.email)).body.items.length,0);
 assert.equal((await call(root+'/'+id,'GET',null,b.email)).status,404);
 assert.equal((await call(root+'?author=missing','GET',null,b.email)).body.items.length,0);
 const person=(await call('/api/people','POST',{name:'Ayşe',nickname:'Fıstık',birthPlace:'Nizip'})).body.id;
 const profile='/api/experience/profile/'+person;
 assert.equal((await call(profile,'PUT',{fields:{portrait:{value:id,visibility:'family'}}})).status,200);
 assert.equal((await call(profile,'GET',null,b.email)).body.fields.portrait,undefined);
 assert.equal((await call('/api/bootstrap')).body.people.find(p=>p.id===person).nickname,'Fıstık');
 const wav=Buffer.concat([Buffer.from('RIFF0000WAVE'),Buffer.alloc(32)]).toString('base64');
 assert.equal((await call(root+'/'+id+'/audio','PUT',{mime:'audio/wav',data:png})).status,400);
 assert.equal((await call(root+'/'+id+'/audio','PUT',{mime:'audio/wav',data:wav,transcript:'Annemin sesi'})).status,200);
 assert.equal((await call(root+'/'+id+'/audio','GET',null,b.email)).status,404);
 assert.equal((await call(root+'/'+id+'/audio','GET',null,a.email)).status,200);
 assert.equal((await call(root+'/'+id+'/audio','PATCH',{transcript:'Yetkisiz'},a.email)).status,403);
});
test('photo correction requires owner review; a comment tag enters the right profile wall',async()=>{
 const {call,member}=fixture(),a=await member('a@test.invalid'),b=await member('b@test.invalid');
 const person=(await call('/api/people','POST',{name:'Etiketlenen kişi'})).body.id;
 await call('/api/experience/profile/'+person,'PUT',{userId:a.id,fields:{}});
 const id=(await call(root,'POST',upload())).body.id;
 assert.equal((await call(root+'/'+id,'PATCH',meta,a.email)).status,403);
 assert.equal((await call(root+'/'+id+'/suggestions','POST',{...meta,description:'Doğru hikaye'},a.email)).status,201);
 let photo=(await call(root+'/'+id)).body;assert.equal(photo.description,meta.description);
 const suggestion=photo.suggestions[0].id;
 assert.equal((await call(root+'/'+id+'/suggestions','PATCH',{id:suggestion,status:'approved'},b.email)).status,403);
 assert.equal((await call(root+'/'+id+'/suggestions','PATCH',{id:suggestion,status:'approved'})).status,200);
 assert.equal((await call(root+'/'+id)).body.description,'Doğru hikaye');
 const post=(await call('/api/experience/feed','POST',{body:'Günlük paylaşım',clientId:crypto.randomUUID()},b.email)).body.id;
 assert.equal((await call('/api/experience/feed/'+post+'/comments','POST',{body:'Bu anıyı hatırladın mı?',peopleIds:[person]},b.email)).status,201);
 const wall=(await call('/api/experience/feed?wall='+person)).body;assert.equal(wall.items.length,1);assert.equal(wall.items[0].wallComments.length,1);
 assert.equal((await call('/api/experience/feed?wall='+person+'&wallMode=own')).body.items.length,0);
 await call('/api/archive/guardians','PUT',{personId:person,userId:a.id});
 assert.equal((await call('/api/experience/feed?wall='+person,'GET',null,b.email)).status,404);
 assert.equal((await call('/api/experience/feed/'+post+'/comments','GET',null,b.email)).body.items.length,0);
});
test('legacy feed photographs reuse bytes and preserve selected audience without inventing metadata',async()=>{
 const {call,member,db,files}=fixture(),a=await member('a@test.invalid'),b=await member('b@test.invalid');
 const owner=(await call('/api/me')).body.user.id,time=new Date().toISOString();files.set('feed/old',Buffer.from(png,'base64'));
 db.prepare('INSERT INTO feed_posts(createdBy,clientId,kind,body,peopleIds,filename,mime,visibility,userIds,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(owner,'legacy-source-post','post','Yalnızca akış yazısı','[]','feed/old','image/png','selected',JSON.stringify([a.id]),time,time);
 await call(root);await call(root);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM photos').get().n,1);assert.equal(files.size,1);
 const p=db.prepare('SELECT * FROM photos').get();assert.equal(p.date,null);assert.equal(p.description,'');assert.equal(p.filename,'feed/old');
 assert.equal((await call(root,'GET',null,b.email)).body.items.length,0);assert.equal((await call('/media/'+p.id,'GET',null,a.email)).status,200);
 assert.equal((await call('/api/experience/feed','GET',null,a.email)).body.items[0].body,'Yalnızca akış yazısı');
});
