import test from 'node:test';
import assert from 'node:assert/strict';
import {personInput,validateRelation,validDate,nextAnniversary} from '../src/domain.mjs';
test('calendar validation rejects impossible and reversed dates',()=>{assert.throws(()=>validDate('2025-02-29'));assert.throws(()=>personInput({name:'Test Person',birthDate:'2000-01-01',deathDate:'1990-01-01'}));assert.equal(validDate('2024-02-29'),'2024-02-29');assert.equal(validDate(''),null);});
test('relations prevent self-links, duplicates and ancestral cycles',()=>{const links=[{personA:'a',personB:'b',type:'parent'},{personA:'b',personB:'c',type:'adoptive'}];assert.throws(()=>validateRelation(links,'c','a','parent'));assert.throws(()=>validateRelation(links,'a','a','spouse'));assert.throws(()=>validateRelation(links,'a','b','parent'));assert.doesNotThrow(()=>validateRelation(links,'a','d','parent'));assert.throws(()=>validateRelation([{personA:'a',personB:'b',type:'spouse'}],'b','a','spouse'));});
test('anniversaries handle December rollover and leap-day observance',()=>{assert.equal(nextAnniversary('2000-01-01',new Date(2026,11,30)).days,2);assert.equal(nextAnniversary('2000-02-29',new Date(2025,1,27)).days,1);});
