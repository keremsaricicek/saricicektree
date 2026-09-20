CREATE TABLE `photo_audio` (
	`photoId` text PRIMARY KEY NOT NULL,
	`filename` text NOT NULL,
	`mime` text NOT NULL,
	`transcript` text DEFAULT '' NOT NULL,
	`createdBy` text NOT NULL,
	FOREIGN KEY (`photoId`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `photo_details` (
	`photoId` text PRIMARY KEY NOT NULL,
	`datePrecision` text DEFAULT 'day' NOT NULL,
	`outsiders` text DEFAULT '' NOT NULL,
	`source` text DEFAULT '' NOT NULL,
	`photographer` text DEFAULT '' NOT NULL,
	`positions` text DEFAULT '[]' NOT NULL,
	`digest` text,
	`albumId` text,
	`clientId` text,
	`createdBy` text,
	FOREIGN KEY (`photoId`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `photo_digest` ON `photo_details` (`digest`);--> statement-breakpoint
CREATE INDEX `photo_album` ON `photo_details` (`albumId`);--> statement-breakpoint
CREATE UNIQUE INDEX `photo_details_createdBy_clientId_unique` ON `photo_details` (`createdBy`,`clientId`);--> statement-breakpoint
CREATE TABLE `photo_suggestions` (
	`id` text PRIMARY KEY NOT NULL,
	`photoId` text NOT NULL,
	`createdBy` text NOT NULL,
	`data` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`createdAt` text NOT NULL,
	`reviewedBy` text,
	`reviewedAt` text,
	FOREIGN KEY (`photoId`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `suggestion_photo` ON `photo_suggestions` (`photoId`,`status`);--> statement-breakpoint
ALTER TABLE `feed_comments` ADD `peopleIds` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `people` ADD `nickname` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `people` ADD `birthPlace` text DEFAULT '' NOT NULL;