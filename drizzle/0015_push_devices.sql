CREATE TABLE `push_devices` (
	`token` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`platform` text NOT NULL,
	`createdAt` text NOT NULL,
	`lastSeenAt` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `push_devices_user` ON `push_devices` (`userId`);