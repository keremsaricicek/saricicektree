CREATE TABLE `archive_backups` (
	`id` text PRIMARY KEY NOT NULL,
	`filename` text NOT NULL,
	`createdAt` text NOT NULL,
	`recordCount` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `security_factors` (
	`userId` text PRIMARY KEY NOT NULL,
	`secret` text NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`lastStep` integer DEFAULT -1 NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `security_sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `security_sessions_user` ON `security_sessions` (`userId`,`expires`);