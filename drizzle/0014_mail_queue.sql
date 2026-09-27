CREATE TABLE `mail_queue` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`refId` text,
	`toAddr` text NOT NULL,
	`subject` text NOT NULL,
	`body` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`nextAttemptAt` text,
	`lastError` text,
	`createdAt` text NOT NULL,
	`sentAt` text
);
--> statement-breakpoint
CREATE INDEX `mail_queue_due` ON `mail_queue` (`status`,`nextAttemptAt`);--> statement-breakpoint
CREATE INDEX `mail_queue_ref` ON `mail_queue` (`refId`);