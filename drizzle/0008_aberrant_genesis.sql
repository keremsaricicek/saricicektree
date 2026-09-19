CREATE TABLE `feed_comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`postId` integer NOT NULL,
	`createdBy` text NOT NULL,
	`parentId` integer,
	`body` text NOT NULL,
	`createdAt` text NOT NULL,
	`deletedAt` text,
	FOREIGN KEY (`postId`) REFERENCES `feed_posts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `feed_comment_post` ON `feed_comments` (`postId`,`id`);--> statement-breakpoint
CREATE TABLE `feed_notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`postId` integer NOT NULL,
	`userId` text NOT NULL,
	`readAt` text,
	FOREIGN KEY (`postId`) REFERENCES `feed_posts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `feed_notice_user` ON `feed_notifications` (`userId`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `feed_notifications_postId_userId_unique` ON `feed_notifications` (`postId`,`userId`);--> statement-breakpoint
CREATE TABLE `feed_posts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`createdBy` text NOT NULL,
	`clientId` text NOT NULL,
	`kind` text NOT NULL,
	`body` text NOT NULL,
	`date` text,
	`place` text,
	`peopleIds` text DEFAULT '[]' NOT NULL,
	`photoId` text,
	`eventId` text,
	`filename` text,
	`mime` text,
	`visibility` text DEFAULT 'family' NOT NULL,
	`userIds` text DEFAULT '[]' NOT NULL,
	`groupId` text,
	`pinned` integer DEFAULT 0 NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	`deletedAt` text,
	FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`photoId`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`eventId`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `feed_order` ON `feed_posts` (`deletedAt`,`id`);--> statement-breakpoint
CREATE INDEX `feed_author` ON `feed_posts` (`createdBy`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `feed_posts_createdBy_clientId_unique` ON `feed_posts` (`createdBy`,`clientId`);--> statement-breakpoint
CREATE TABLE `feed_reactions` (
	`postId` integer NOT NULL,
	`userId` text NOT NULL,
	PRIMARY KEY(`postId`, `userId`),
	FOREIGN KEY (`postId`) REFERENCES `feed_posts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `feed_saved` (
	`postId` integer NOT NULL,
	`userId` text NOT NULL,
	PRIMARY KEY(`postId`, `userId`),
	FOREIGN KEY (`postId`) REFERENCES `feed_posts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
