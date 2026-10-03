CREATE TABLE `upload_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`size` integer NOT NULL,
	`received` integer DEFAULT 0 NOT NULL,
	`mime` text NOT NULL,
	`createdAt` text NOT NULL,
	`expiresAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `videos` (
	`id` text PRIMARY KEY NOT NULL,
	`createdBy` text NOT NULL,
	`status` text DEFAULT 'processing' NOT NULL,
	`originalMime` text NOT NULL,
	`bytes` integer NOT NULL,
	`seconds` integer NOT NULL,
	`width` integer,
	`height` integer,
	`hasPlayback` integer DEFAULT 0 NOT NULL,
	`hasPoster` integer DEFAULT 0 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`nextAttemptAt` text,
	`lastError` text,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `videos_status` ON `videos` (`status`,`nextAttemptAt`);--> statement-breakpoint
ALTER TABLE `photos` ADD `videoId` text;--> statement-breakpoint
CREATE UNIQUE INDEX `photos_video` ON `photos` (`videoId`) WHERE videoId IS NOT NULL;