CREATE TABLE `chat_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`senderId` text NOT NULL,
	`kind` text NOT NULL,
	`targetId` text NOT NULL,
	`filename` text NOT NULL,
	`mime` text NOT NULL,
	`createdAt` text NOT NULL,
	FOREIGN KEY (`senderId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `chat_typing` (
	`userId` text NOT NULL,
	`kind` text NOT NULL,
	`targetId` text NOT NULL,
	`expires` integer NOT NULL,
	PRIMARY KEY(`userId`, `kind`, `targetId`),
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `content_audience` (
	`kind` text NOT NULL,
	`recordId` text NOT NULL,
	`mode` text NOT NULL,
	`userIds` text DEFAULT '[]' NOT NULL,
	`groupId` text,
	PRIMARY KEY(`kind`, `recordId`)
);
--> statement-breakpoint
CREATE TABLE `message_extras` (
	`kind` text NOT NULL,
	`messageId` integer NOT NULL,
	`replyId` integer,
	`attachmentId` text,
	`clientId` text,
	`senderId` text,
	PRIMARY KEY(`kind`, `messageId`),
	FOREIGN KEY (`attachmentId`) REFERENCES `chat_attachments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `message_extras_senderId_clientId_unique` ON `message_extras` (`senderId`,`clientId`);--> statement-breakpoint
CREATE TABLE `profile_details` (
	`personId` text PRIMARY KEY NOT NULL,
	`userId` text,
	`fields` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`personId`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
