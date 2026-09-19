// A protected person is visible to the assigned guardian and the family owner.
export async function hiddenPeople(all,u){return u.role==='owner'?new Set():new Set((await all('SELECT personId FROM person_guardians WHERE userId!=?',u.id)).map(x=>x.personId));}
export function filterFamilyPayload(data,hidden){
 if(!hidden?.size||!data||typeof data!=='object')return data;
 const out={...data};
 if(Array.isArray(out.people))out.people=out.people.filter(p=>!hidden.has(p.id));
 if(Array.isArray(out.relations))out.relations=out.relations.filter(r=>!hidden.has(r.personA)&&!hidden.has(r.personB));
 if(Array.isArray(out.events))out.events=out.events.filter(e=>!hidden.has(e.personId));
 if(out.trash)out.trash=filterFamilyPayload(out.trash,hidden);
 return out;
}
