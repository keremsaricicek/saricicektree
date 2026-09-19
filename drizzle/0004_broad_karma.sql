CREATE TABLE `security_recovery` (
	`userId` text NOT NULL,
	`digest` text NOT NULL,
	`createdAt` text NOT NULL,
	PRIMARY KEY(`userId`, `digest`),
	FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
