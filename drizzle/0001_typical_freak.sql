CREATE TABLE `speakers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`organization` text NOT NULL,
	`bio` text NOT NULL,
	`photo_url` text DEFAULT '' NOT NULL,
	`link_url` text DEFAULT '' NOT NULL,
	`track` text NOT NULL,
	`kind` text NOT NULL,
	`published` integer DEFAULT 0 NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL
);
