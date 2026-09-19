CREATE TABLE `archive_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`entryId` text NOT NULL,
	`body` text NOT NULL,
	`createdBy` text NOT NULL,
	`createdAt` text NOT NULL,
	`status` text NOT NULL,
	FOREIGN KEY (`entryId`) REFERENCES `archive_entries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `archive_comments_entry` ON `archive_comments` (`entryId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `archive_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`personId` text,
	`photoId` text,
	`eventId` text,
	`data` text DEFAULT '{}' NOT NULL,
	`visibility` text DEFAULT 'family' NOT NULL,
	`status` text NOT NULL,
	`opensAt` text,
	`createdBy` text NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	`deletedAt` text,
	FOREIGN KEY (`personId`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`photoId`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`eventId`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `archive_kind_status` ON `archive_entries` (`kind`,`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `archive_person` ON `archive_entries` (`personId`);--> statement-breakpoint
CREATE INDEX `archive_author` ON `archive_entries` (`createdBy`);--> statement-breakpoint
CREATE TABLE `archive_media` (
	`id` text PRIMARY KEY NOT NULL,
	`entryId` text NOT NULL,
	`filename` text NOT NULL,
	`mime` text NOT NULL,
	`createdBy` text NOT NULL,
	`createdAt` text NOT NULL,
	FOREIGN KEY (`entryId`) REFERENCES `archive_entries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `archive_media_entry` ON `archive_media` (`entryId`);--> statement-breakpoint
CREATE TABLE `archive_votes` (
	`entryId` text NOT NULL,
	`userId` text NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`entryId`, `userId`),
	FOREIGN KEY (`entryId`) REFERENCES `archive_entries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `family_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`createdBy` text NOT NULL,
	`createdAt` text NOT NULL,
	FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `group_members` (
	`groupId` text NOT NULL,
	`userId` text NOT NULL,
	PRIMARY KEY(`groupId`, `userId`),
	FOREIGN KEY (`groupId`) REFERENCES `family_groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `group_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`groupId` text NOT NULL,
	`userId` text NOT NULL,
	`body` text NOT NULL,
	`createdAt` text NOT NULL,
	FOREIGN KEY (`groupId`) REFERENCES `family_groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `group_messages_group` ON `group_messages` (`groupId`,`id`);--> statement-breakpoint
CREATE TABLE `person_guardians` (
	`personId` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	FOREIGN KEY (`personId`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `person_merges` (
	`id` text PRIMARY KEY NOT NULL,
	`sourceId` text NOT NULL,
	`targetId` text NOT NULL,
	`snapshot` text NOT NULL,
	`createdBy` text NOT NULL,
	`createdAt` text NOT NULL,
	`undoneAt` text
);
--> statement-breakpoint
CREATE TABLE `photo_privacy` (
	`photoId` text PRIMARY KEY NOT NULL,
	`visibility` text NOT NULL,
	FOREIGN KEY (`photoId`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE no action
);
