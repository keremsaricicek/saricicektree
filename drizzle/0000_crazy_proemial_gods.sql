CREATE TABLE `audit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` text,
	`action` text NOT NULL,
	`entityId` text,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`type` text NOT NULL,
	`date` text NOT NULL,
	`place` text,
	`description` text,
	`personId` text,
	`createdBy` text,
	`status` text NOT NULL,
	`createdAt` text NOT NULL,
	`deletedAt` text,
	FOREIGN KEY (`personId`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "events_type_valid" CHECK(type IN ('gathering','birthday','marriage','memorial','funeral','migration','story')),
	CONSTRAINT "events_status_valid" CHECK(status IN ('pending','approved','rejected'))
);
--> statement-breakpoint
CREATE INDEX `events_date` ON `events` (`date`,`status`);--> statement-breakpoint
CREATE TABLE `invites` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`token` text NOT NULL,
	`expires` integer NOT NULL,
	`used` integer DEFAULT 0 NOT NULL,
	`createdBy` text,
	FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "invites_role_valid" CHECK(role IN ('moderator','member'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invites_token_unique` ON `invites` (`token`);--> statement-breakpoint
CREATE TABLE `people` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`birthDate` text,
	`deathDate` text,
	`place` text,
	`country` text,
	`biography` text,
	`source` text,
	`createdBy` text,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	`deletedAt` text,
	FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `people_name` ON `people` (`name`);--> statement-breakpoint
CREATE INDEX `people_birth` ON `people` (`birthDate`);--> statement-breakpoint
CREATE TABLE `photo_people` (
	`photoId` text,
	`personId` text,
	PRIMARY KEY(`photoId`, `personId`),
	FOREIGN KEY (`photoId`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`personId`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`date` text,
	`place` text,
	`description` text,
	`filename` text NOT NULL,
	`mime` text NOT NULL,
	`createdBy` text,
	`status` text NOT NULL,
	`createdAt` text NOT NULL,
	`deletedAt` text,
	FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "photos_status_valid" CHECK(status IN ('pending','approved','rejected'))
);
--> statement-breakpoint
CREATE INDEX `photos_status` ON `photos` (`status`,`createdAt`);--> statement-breakpoint
CREATE TABLE `relations` (
	`id` text PRIMARY KEY NOT NULL,
	`personA` text,
	`personB` text,
	`type` text,
	`date` text,
	FOREIGN KEY (`personA`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`personB`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "relations_type_valid" CHECK(type IN ('parent','spouse','adoptive')),
	CONSTRAINT "relations_valid" CHECK(personA != personB)
);
--> statement-breakpoint
CREATE INDEX `relations_b` ON `relations` (`personB`);--> statement-breakpoint
CREATE UNIQUE INDEX `relations_personA_personB_type_unique` ON `relations` (`personA`,`personB`,`type`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `throttle` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`authId` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`createdAt` text NOT NULL,
	CONSTRAINT "users_role_valid" CHECK(role IN ('owner','moderator','member'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_authId_unique` ON `users` (`authId`);