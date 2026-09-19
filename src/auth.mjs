import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { assert } from './domain.mjs';
const derive=promisify(scrypt);
export const token=()=>randomBytes(32).toString('hex');
export const hash=v=>createHash('sha256').update(v).digest('hex');
export async function passwordHash(p) {assert(typeof p==='string' && p.length>=12 && p.length<=256,400,'Şifre 12–256 karakter olmalı.');const salt=token();return salt+':'+(await derive(p,salt,64)).toString('hex');}
export async function passwordVerify(p,stored) {if(typeof p!=='string'||p.length>256)return false;const [salt,key]=stored.split(':');const actual=await derive(p,salt,64);return timingSafeEqual(actual,Buffer.from(key,'hex'));}
export const cookie=(raw)=>Object.fromEntries((raw||'').split(';').map(x=>x.trim().split('=')));
