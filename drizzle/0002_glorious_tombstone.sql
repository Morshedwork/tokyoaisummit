CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`target` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_created` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `payment_events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`livemode` integer NOT NULL,
	`status` text NOT NULL,
	`received_at` integer NOT NULL,
	`processed_at` integer
);
--> statement-breakpoint
CREATE INDEX `payment_events_received` ON `payment_events` (`received_at`);--> statement-breakpoint
ALTER TABLE `orders` ADD `request_key` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `attendee_names` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `ticket_label` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `checkout_title` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `refund_id` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `refund_status` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `refunded_amount` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `orders_request_key_unique` ON `orders` (`request_key`);--> statement-breakpoint
ALTER TABLE `tickets` ADD `attendee_name` text DEFAULT '' NOT NULL;