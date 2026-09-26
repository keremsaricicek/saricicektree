import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
export const dataDir=resolve(process.env.DATA_DIR || 'data');
mkdirSync(dataDir,{recursive:true});
export const db=new DatabaseSync(resolve(dataDir,'family.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('owner','moderator','member')),active INTEGER NOT NULL DEFAULT 1,createdAt TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,userId TEXT REFERENCES users(id) ON DELETE CASCADE,csrf TEXT NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS invites(id TEXT PRIMARY KEY,email TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('moderator','member')),token TEXT UNIQUE NOT NULL,expires INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0,createdBy TEXT REFERENCES users(id));
CREATE TABLE IF NOT EXISTS resets(token TEXT PRIMARY KEY,userId TEXT REFERENCES users(id),expires INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS people(id TEXT PRIMARY KEY,name TEXT NOT NULL,birthDate TEXT,deathDate TEXT,place TEXT,country TEXT,biography TEXT,source TEXT,createdBy TEXT REFERENCES users(id),createdAt TEXT NOT NULL,updatedAt TEXT NOT NULL,deletedAt TEXT);
CREATE TABLE IF NOT EXISTS relations(id TEXT PRIMARY KEY,personA TEXT REFERENCES people(id),personB TEXT REFERENCES people(id),type TEXT CHECK(type IN ('parent','spouse','adoptive')),date TEXT,UNIQUE(personA,personB,type),CHECK(personA != personB));
CREATE TABLE IF NOT EXISTS photos(id TEXT PRIMARY KEY,title TEXT NOT NULL,date TEXT,place TEXT,description TEXT,filename TEXT NOT NULL,mime TEXT NOT NULL,createdBy TEXT REFERENCES users(id),status TEXT CHECK(status IN ('pending','approved','rejected')) NOT NULL,createdAt TEXT NOT NULL,deletedAt TEXT);
CREATE TABLE IF NOT EXISTS photo_people(photoId TEXT REFERENCES photos(id) ON DELETE CASCADE,personId TEXT REFERENCES people(id),PRIMARY KEY(photoId,personId));
CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,title TEXT NOT NULL,type TEXT NOT NULL CHECK(type IN ('gathering','birthday','marriage','memorial','funeral','migration','story')),date TEXT NOT NULL,place TEXT,description TEXT,personId TEXT REFERENCES people(id),createdBy TEXT REFERENCES users(id),status TEXT CHECK(status IN ('pending','approved','rejected')) NOT NULL,createdAt TEXT NOT NULL,deletedAt TEXT);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,userId TEXT,action TEXT NOT NULL,entityId TEXT,createdAt TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS throttle(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS people_name ON people(name);
CREATE INDEX IF NOT EXISTS people_birth ON people(birthDate);
CREATE INDEX IF NOT EXISTS relations_b ON relations(personB);
CREATE INDEX IF NOT EXISTS photos_status ON photos(status,createdAt);
CREATE INDEX IF NOT EXISTS events_date ON events(date,status);
CREATE INDEX IF NOT EXISTS sessions_expires ON sessions(expires);
INSERT OR IGNORE INTO settings VALUES ('familyTitle','Sarıçiçek');
INSERT OR IGNORE INTO settings VALUES ('familyStory','Bir aile, birbirine anlatılan hikâyelerle yaşar. Köklerimizi, anılarımızı ve bizi bir arada tutan bağları birlikte koruyoruz.');
INSERT OR IGNORE INTO settings VALUES ('mailDomain','');
`);
export const all=(sql,...args)=>db.prepare(sql).all(...args);
export const one=(sql,...args)=>db.prepare(sql).get(...args);
export const run=(sql,...args)=>db.prepare(sql).run(...args);
export const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}};
export const audit=(user,action,id='')=>run('INSERT INTO audit(userId,action,entityId,createdAt) VALUES(?,?,?,?)',user,action,id,new Date().toISOString());

// Shared community schema uses the same generated migration in both runtimes.
db.exec('CREATE TABLE IF NOT EXISTS local_migrations(name TEXT PRIMARY KEY)');
if(!one('SELECT name FROM local_migrations WHERE name=?','0001_stormy_husk'))transaction(()=>{db.exec(readFileSync(new URL('../drizzle/0001_stormy_husk.sql',import.meta.url),'utf8'));run('INSERT INTO local_migrations VALUES(?)','0001_stormy_husk');});

if(!one('SELECT name FROM local_migrations WHERE name=?','0002_tan_sheva_callister'))transaction(()=>{db.exec(readFileSync(new URL('../drizzle/0002_tan_sheva_callister.sql',import.meta.url),'utf8'));run('INSERT INTO local_migrations VALUES(?)','0002_tan_sheva_callister');});

if(!one('SELECT name FROM local_migrations WHERE name=?','0003_heavy_betty_ross'))transaction(()=>{db.exec(readFileSync(new URL('../drizzle/0003_heavy_betty_ross.sql',import.meta.url),'utf8'));run('INSERT INTO local_migrations VALUES(?)','0003_heavy_betty_ross');});

if(!one('SELECT name FROM local_migrations WHERE name=?','0004_broad_karma'))transaction(()=>{db.exec(readFileSync(new URL('../drizzle/0004_broad_karma.sql',import.meta.url),'utf8'));run('INSERT INTO local_migrations VALUES(?)','0004_broad_karma');});

if(!one('SELECT name FROM local_migrations WHERE name=?','0005_curly_omega_red'))transaction(()=>{db.exec(readFileSync(new URL('../drizzle/0005_curly_omega_red.sql',import.meta.url),'utf8'));run('INSERT INTO local_migrations VALUES(?)','0005_curly_omega_red');});

if(!one('SELECT name FROM local_migrations WHERE name=?','0006_search_index'))transaction(()=>{db.exec(readFileSync(new URL('../drizzle/0006_search_index.sql',import.meta.url),'utf8'));run('INSERT INTO local_migrations VALUES(?)','0006_search_index');});
if(!one('SELECT name FROM local_migrations WHERE name=?','0007_greedy_kinsey_walden'))transaction(()=>{db.exec(readFileSync(new URL('../drizzle/0007_greedy_kinsey_walden.sql',import.meta.url),'utf8'));run('INSERT INTO local_migrations VALUES(?)','0007_greedy_kinsey_walden');});

if(!one('SELECT name FROM local_migrations WHERE name=?','0008_aberrant_genesis'))transaction(()=>{db.exec(readFileSync(new URL('../drizzle/0008_aberrant_genesis.sql',import.meta.url),'utf8'));run('INSERT INTO local_migrations VALUES(?)','0008_aberrant_genesis');});

if(!one('SELECT name FROM local_migrations WHERE name=?','0009_fearless_iron_fist'))transaction(()=>{db.exec(readFileSync(new URL('../drizzle/0009_fearless_iron_fist.sql',import.meta.url),'utf8'));run('INSERT INTO local_migrations VALUES(?)','0009_fearless_iron_fist');});
if(!one('SELECT name FROM local_migrations WHERE name=?','0010_happy_kronos'))transaction(()=>{db.exec(readFileSync(new URL('../drizzle/0010_happy_kronos.sql',import.meta.url),'utf8'));run('INSERT INTO local_migrations VALUES(?)','0010_happy_kronos');});
