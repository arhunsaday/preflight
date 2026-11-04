CREATE TABLE `share_record` (
	`code` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`object_key` text NOT NULL,
	`visibility` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text,
	`resource_count` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `share_record_owner_idx` ON `share_record` (`owner_id`);