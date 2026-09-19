import {randomUUID} from 'node:crypto';
import {one,run} from './db.mjs';
import {passwordHash} from './auth.mjs';
const email=(process.env.ADMIN_EMAIL||'').toLowerCase().trim(), password=process.env.ADMIN_PASSWORD;
if(!email.includes('@')||!password) throw Error('ADMIN_EMAIL ve ADMIN_PASSWORD ortam değişkenlerini tanımlayın.');
if(one('SELECT id FROM users WHERE role=?','owner')) throw Error('Yönetici zaten var. Mevcut hesabın üzerine yazılmadı.');
run('INSERT INTO users(id,name,email,password,role,createdAt) VALUES(?,?,?,?,?,?)',randomUUID(),process.env.ADMIN_NAME||'Aile Yöneticisi',email,await passwordHash(password),'owner',new Date().toISOString());
console.log('Yönetici oluşturuldu. ADMIN_PASSWORD değerini ortamdan kaldırın.');
