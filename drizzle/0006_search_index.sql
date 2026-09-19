CREATE VIRTUAL TABLE search_fts USING fts5(kind,recordId UNINDEXED,content,tokenize='unicode61 remove_diacritics 2');
--> statement-breakpoint
CREATE TABLE search_catalog(kind TEXT NOT NULL,recordId TEXT NOT NULL,PRIMARY KEY(kind,recordId));

--> statement-breakpoint
CREATE TRIGGER search_people_insert AFTER INSERT ON people BEGIN INSERT INTO search_fts(kind,recordId,content) VALUES('people',new.id,lower(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(coalesce(new.name,'')||' '||coalesce(new.biography,'')||' '||coalesce(new.place,'')||' '||coalesce(new.country,'')||' '||coalesce(new.birthDate,''),'İ','i'),'I','i'),'ı','i'),'Ş','s'),'ş','s'),'Ğ','g'),'ğ','g'),'Ç','c'),'ç','c'),'Ö','o'),'ö','o'),'Ü','u'),'ü','u'))); INSERT OR IGNORE INTO search_catalog VALUES('people',new.id); END;
--> statement-breakpoint
CREATE TRIGGER search_people_update AFTER UPDATE ON people BEGIN DELETE FROM search_fts WHERE kind='people' AND recordId=old.id; INSERT INTO search_fts(kind,recordId,content) VALUES('people',new.id,lower(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(coalesce(new.name,'')||' '||coalesce(new.biography,'')||' '||coalesce(new.place,'')||' '||coalesce(new.country,'')||' '||coalesce(new.birthDate,''),'İ','i'),'I','i'),'ı','i'),'Ş','s'),'ş','s'),'Ğ','g'),'ğ','g'),'Ç','c'),'ç','c'),'Ö','o'),'ö','o'),'Ü','u'),'ü','u'))); INSERT OR IGNORE INTO search_catalog VALUES('people',new.id); END;
--> statement-breakpoint
CREATE TRIGGER search_people_delete AFTER DELETE ON people BEGIN DELETE FROM search_fts WHERE kind='people' AND recordId=old.id; DELETE FROM search_catalog WHERE kind='people' AND recordId=old.id; END;

--> statement-breakpoint
CREATE TRIGGER search_photos_insert AFTER INSERT ON photos BEGIN INSERT INTO search_fts(kind,recordId,content) VALUES('photos',new.id,lower(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(coalesce(new.title,'')||' '||coalesce(new.description,'')||' '||coalesce(new.place,'')||' '||coalesce(new.date,''),'İ','i'),'I','i'),'ı','i'),'Ş','s'),'ş','s'),'Ğ','g'),'ğ','g'),'Ç','c'),'ç','c'),'Ö','o'),'ö','o'),'Ü','u'),'ü','u'))); INSERT OR IGNORE INTO search_catalog VALUES('photos',new.id); END;
--> statement-breakpoint
CREATE TRIGGER search_photos_update AFTER UPDATE ON photos BEGIN DELETE FROM search_fts WHERE kind='photos' AND recordId=old.id; INSERT INTO search_fts(kind,recordId,content) VALUES('photos',new.id,lower(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(coalesce(new.title,'')||' '||coalesce(new.description,'')||' '||coalesce(new.place,'')||' '||coalesce(new.date,''),'İ','i'),'I','i'),'ı','i'),'Ş','s'),'ş','s'),'Ğ','g'),'ğ','g'),'Ç','c'),'ç','c'),'Ö','o'),'ö','o'),'Ü','u'),'ü','u'))); INSERT OR IGNORE INTO search_catalog VALUES('photos',new.id); END;
--> statement-breakpoint
CREATE TRIGGER search_photos_delete AFTER DELETE ON photos BEGIN DELETE FROM search_fts WHERE kind='photos' AND recordId=old.id; DELETE FROM search_catalog WHERE kind='photos' AND recordId=old.id; END;

--> statement-breakpoint
CREATE TRIGGER search_events_insert AFTER INSERT ON events BEGIN INSERT INTO search_fts(kind,recordId,content) VALUES('events',new.id,lower(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(coalesce(new.title,'')||' '||coalesce(new.description,'')||' '||coalesce(new.place,'')||' '||coalesce(new.date,''),'İ','i'),'I','i'),'ı','i'),'Ş','s'),'ş','s'),'Ğ','g'),'ğ','g'),'Ç','c'),'ç','c'),'Ö','o'),'ö','o'),'Ü','u'),'ü','u'))); INSERT OR IGNORE INTO search_catalog VALUES('events',new.id); END;
--> statement-breakpoint
CREATE TRIGGER search_events_update AFTER UPDATE ON events BEGIN DELETE FROM search_fts WHERE kind='events' AND recordId=old.id; INSERT INTO search_fts(kind,recordId,content) VALUES('events',new.id,lower(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(coalesce(new.title,'')||' '||coalesce(new.description,'')||' '||coalesce(new.place,'')||' '||coalesce(new.date,''),'İ','i'),'I','i'),'ı','i'),'Ş','s'),'ş','s'),'Ğ','g'),'ğ','g'),'Ç','c'),'ç','c'),'Ö','o'),'ö','o'),'Ü','u'),'ü','u'))); INSERT OR IGNORE INTO search_catalog VALUES('events',new.id); END;
--> statement-breakpoint
CREATE TRIGGER search_events_delete AFTER DELETE ON events BEGIN DELETE FROM search_fts WHERE kind='events' AND recordId=old.id; DELETE FROM search_catalog WHERE kind='events' AND recordId=old.id; END;

--> statement-breakpoint
CREATE TRIGGER search_documents_insert AFTER INSERT ON documents BEGIN INSERT INTO search_fts(kind,recordId,content) VALUES('documents',new.id,lower(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(coalesce(new.title,'')||' '||coalesce(new.description,''),'İ','i'),'I','i'),'ı','i'),'Ş','s'),'ş','s'),'Ğ','g'),'ğ','g'),'Ç','c'),'ç','c'),'Ö','o'),'ö','o'),'Ü','u'),'ü','u'))); INSERT OR IGNORE INTO search_catalog VALUES('documents',new.id); END;
--> statement-breakpoint
CREATE TRIGGER search_documents_update AFTER UPDATE ON documents BEGIN DELETE FROM search_fts WHERE kind='documents' AND recordId=old.id; INSERT INTO search_fts(kind,recordId,content) VALUES('documents',new.id,lower(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(coalesce(new.title,'')||' '||coalesce(new.description,''),'İ','i'),'I','i'),'ı','i'),'Ş','s'),'ş','s'),'Ğ','g'),'ğ','g'),'Ç','c'),'ç','c'),'Ö','o'),'ö','o'),'Ü','u'),'ü','u'))); INSERT OR IGNORE INTO search_catalog VALUES('documents',new.id); END;
--> statement-breakpoint
CREATE TRIGGER search_documents_delete AFTER DELETE ON documents BEGIN DELETE FROM search_fts WHERE kind='documents' AND recordId=old.id; DELETE FROM search_catalog WHERE kind='documents' AND recordId=old.id; END;

--> statement-breakpoint
CREATE TRIGGER search_archive_entries_insert AFTER INSERT ON archive_entries BEGIN INSERT INTO search_fts(kind,recordId,content) VALUES('archive_entries',new.id,lower(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(coalesce(new.title,'')||' '||coalesce(new.body,'')||' '||CASE WHEN new.kind='quiz' THEN '' ELSE new.data END,'İ','i'),'I','i'),'ı','i'),'Ş','s'),'ş','s'),'Ğ','g'),'ğ','g'),'Ç','c'),'ç','c'),'Ö','o'),'ö','o'),'Ü','u'),'ü','u'))); INSERT OR IGNORE INTO search_catalog VALUES('archive_entries',new.id); END;
--> statement-breakpoint
CREATE TRIGGER search_archive_entries_update AFTER UPDATE ON archive_entries BEGIN DELETE FROM search_fts WHERE kind='archive_entries' AND recordId=old.id; INSERT INTO search_fts(kind,recordId,content) VALUES('archive_entries',new.id,lower(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(coalesce(new.title,'')||' '||coalesce(new.body,'')||' '||CASE WHEN new.kind='quiz' THEN '' ELSE new.data END,'İ','i'),'I','i'),'ı','i'),'Ş','s'),'ş','s'),'Ğ','g'),'ğ','g'),'Ç','c'),'ç','c'),'Ö','o'),'ö','o'),'Ü','u'),'ü','u'))); INSERT OR IGNORE INTO search_catalog VALUES('archive_entries',new.id); END;
--> statement-breakpoint
CREATE TRIGGER search_archive_entries_delete AFTER DELETE ON archive_entries BEGIN DELETE FROM search_fts WHERE kind='archive_entries' AND recordId=old.id; DELETE FROM search_catalog WHERE kind='archive_entries' AND recordId=old.id; END;

--> statement-breakpoint
CREATE INDEX search_order_people ON people(createdAt DESC,id ASC);

--> statement-breakpoint
CREATE INDEX search_order_photos ON photos(createdAt DESC,id ASC);

--> statement-breakpoint
CREATE INDEX search_order_events ON events(createdAt DESC,id ASC);

--> statement-breakpoint
CREATE INDEX search_order_documents ON documents(createdAt DESC,id ASC);

--> statement-breakpoint
CREATE INDEX search_order_archive_entries ON archive_entries(createdAt DESC,id ASC);
