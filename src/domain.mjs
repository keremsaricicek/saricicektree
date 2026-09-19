export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
export const assert = (condition, status, message) => { if (!condition) throw new HttpError(status, message); };
export const clean = (v, max = 200) => String(v ?? '').trim().slice(0, max);
export function validDate(value, optional = true) {
  if (!value && optional) return null;
  assert(/^\d{4}-\d{2}-\d{2}$/.test(value || '') && !isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value, 400, 'Geçerli bir tarih girin.');
  return value;
}
export function personInput(b) {
  const name = clean(b.name, 120); assert(name.length >= 2, 400, 'Ad soyad en az iki karakter olmalı.');
  const birthDate = validDate(b.birthDate), deathDate = validDate(b.deathDate);
  assert(!birthDate || !deathDate || birthDate <= deathDate, 400, 'Vefat tarihi doğumdan önce olamaz.');
  assert(!birthDate || birthDate <= new Date().toISOString().slice(0,10), 400, 'Doğum tarihi gelecekte olamaz.');
  assert(!deathDate || deathDate <= new Date().toISOString().slice(0,10), 400, 'Vefat tarihi gelecekte olamaz.');
  return {name, birthDate, deathDate, place:clean(b.place,120), country:clean(b.country,60), biography:clean(b.biography,5000), source:clean(b.source,1000)};
}
export function validateRelation(links, a, b, type) {
  assert(a !== b,400,'Kişi kendisiyle ilişkilendirilemez.');
  assert(['parent','spouse','adoptive'].includes(type),400,'İlişki türü geçersiz.');
  assert(!links.some(x => x.type === type && ((x.personA === a && x.personB === b) || (type === 'spouse' && x.personA === b && x.personB === a))),409,'Bu ilişki zaten var.');
  if (type === 'spouse') return;
  const queue = [b], seen = new Set();
  while (queue.length) { const id=queue.pop(); assert(id !== a,400,'Bu bağlantı soy ağacında döngü oluşturur.'); if (seen.has(id)) continue; seen.add(id); for (const x of links) if (x.type !== 'spouse' && x.personA === id) queue.push(x.personB); }
}
export function nextAnniversary(date, now = new Date()) {
  const [y,m,d] = date.split('-').map(Number); let next = new Date(now.getFullYear(),m-1,d); const today = new Date(now.getFullYear(),now.getMonth(),now.getDate());
  // February 29 is observed on February 28 in a non-leap year.
  if (next.getMonth() !== m-1) next = new Date(now.getFullYear(),m,0);
  if (next < today) { next = new Date(now.getFullYear()+1,m-1,d); if(next.getMonth() !== m-1) next=new Date(now.getFullYear()+1,m,0); }
  return {date:next.toLocaleDateString('en-CA'),days:Math.round((next-today)/86400000),years:next.getFullYear()-y};
}
