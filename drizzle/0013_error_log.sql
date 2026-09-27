CREATE TABLE `error_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`event` text NOT NULL,
	`message` text NOT NULL,
	`area` text,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `error_log_created` ON `error_log` (`createdAt`);