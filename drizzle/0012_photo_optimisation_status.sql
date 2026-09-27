ALTER TABLE `photo_media` ADD `status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `photo_media` ADD `attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `photo_media` ADD `nextAttemptAt` text;--> statement-breakpoint
ALTER TABLE `photo_media` ADD `lastError` text;