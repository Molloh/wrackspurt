CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`meta_json` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`secret` integer DEFAULT false NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `skill_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`skill_id` text NOT NULL,
	`prompt` text NOT NULL,
	`constraints_json` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`output` text,
	`artifacts_json` text,
	`error` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`finished_at` integer
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`path` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`last_opened_at` integer DEFAULT (unixepoch()) NOT NULL
);
