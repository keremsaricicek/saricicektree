CREATE TABLE `feed_activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`postId` integer NOT NULL,
	`kind` text NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `feed_comment_likes` (
	`commentId` integer NOT NULL,
	`userId` text NOT NULL,
	PRIMARY KEY(`commentId`, `userId`),
	FOREIGN KEY (`commentId`) REFERENCES `feed_comments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `feed_emoji` (
	`postId` integer NOT NULL,
	`userId` text NOT NULL,
	`emoji` text NOT NULL,
	`createdAt` text NOT NULL,
	PRIMARY KEY(`postId`, `userId`),
	FOREIGN KEY (`postId`) REFERENCES `feed_posts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `photo_media` (
	`photoId` text PRIMARY KEY NOT NULL,
	`width` integer,
	`height` integer,
	`focusX` integer DEFAULT 50 NOT NULL,
	`focusY` integer DEFAULT 40 NOT NULL,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`photoId`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `photo_variants` (
	`photoId` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`filename` text NOT NULL,
	`mime` text NOT NULL,
	`bytes` integer NOT NULL,
	`createdAt` text NOT NULL,
	PRIMARY KEY(`photoId`, `width`),
	FOREIGN KEY (`photoId`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE no action
);
