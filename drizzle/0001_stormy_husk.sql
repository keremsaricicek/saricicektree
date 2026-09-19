CREATE TABLE `attendance` (
	`eventId` text NOT NULL,
	`userId` text NOT NULL,
	`response` text NOT NULL,
	PRIMARY KEY(`eventId`, `userId`),
	FOREIGN KEY (`eventId`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `blocks` (
	`userId` text NOT NULL,
	`blockedId` text NOT NULL,
	PRIMARY KEY(`userId`, `blockedId`),
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`blockedId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`filename` text NOT NULL,
	`createdBy` text NOT NULL,
	`createdAt` text NOT NULL,
	`status` text NOT NULL,
	`deletedAt` text,
	FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `location_shares` (
	`userId` text PRIMARY KEY NOT NULL,
	`latitude` text,
	`longitude` text,
	`accuracy` integer,
	`precision` text NOT NULL,
	`consentedAt` text NOT NULL,
	`updatedAt` text,
	`expires` integer NOT NULL,
	`shareToken` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`senderId` text NOT NULL,
	`recipientId` text NOT NULL,
	`clientId` text NOT NULL,
	`body` text NOT NULL,
	`createdAt` text NOT NULL,
	`readAt` text,
	FOREIGN KEY (`senderId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipientId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `messages_thread` ON `messages` (`senderId`,`recipientId`,`id`);--> statement-breakpoint
CREATE INDEX `messages_inbox` ON `messages` (`recipientId`,`readAt`);--> statement-breakpoint
CREATE UNIQUE INDEX `messages_senderId_clientId_unique` ON `messages` (`senderId`,`clientId`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`messageId` integer NOT NULL,
	`reporterId` text NOT NULL,
	`reason` text NOT NULL,
	`createdAt` text NOT NULL,
	`resolved` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`messageId`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reporterId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `residences` (
	`personId` text PRIMARY KEY NOT NULL,
	`latitude` text NOT NULL,
	`longitude` text NOT NULL,
	`label` text NOT NULL,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`personId`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
