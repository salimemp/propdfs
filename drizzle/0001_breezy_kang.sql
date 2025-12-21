CREATE TABLE `approval_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workflowId` int NOT NULL,
	`fileId` int NOT NULL,
	`requesterId` int NOT NULL,
	`currentStep` int NOT NULL DEFAULT 1,
	`status` enum('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `approval_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `approval_workflows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teamId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`steps` json NOT NULL,
	`isActive` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `approval_workflows_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`teamId` int,
	`action` varchar(64) NOT NULL,
	`resourceType` varchar(64) NOT NULL,
	`resourceId` int,
	`details` json,
	`ipAddress` varchar(45),
	`userAgent` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `batch_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batchId` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`teamId` int,
	`totalFiles` int NOT NULL,
	`completedFiles` int NOT NULL DEFAULT 0,
	`failedFiles` int NOT NULL DEFAULT 0,
	`status` enum('queued','processing','completed','failed','cancelled') NOT NULL DEFAULT 'queued',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `batch_jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `batch_jobs_batchId_unique` UNIQUE(`batchId`)
);
--> statement-breakpoint
CREATE TABLE `chat_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`sessionId` varchar(64) NOT NULL,
	`role` enum('user','assistant') NOT NULL,
	`content` text NOT NULL,
	`fileId` int,
	`actionTaken` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chat_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `comments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fileId` int NOT NULL,
	`userId` int NOT NULL,
	`parentId` int,
	`content` text NOT NULL,
	`pageNumber` int,
	`positionX` int,
	`positionY` int,
	`status` enum('active','resolved','deleted') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `conversion_presets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`teamId` int,
	`name` varchar(255) NOT NULL,
	`description` text,
	`conversionType` varchar(64) NOT NULL,
	`options` json NOT NULL,
	`isDefault` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `conversion_presets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `conversions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`teamId` int,
	`sourceFileId` int,
	`sourceFilename` varchar(512) NOT NULL,
	`sourceFormat` varchar(32) NOT NULL,
	`sourceSize` bigint NOT NULL,
	`outputFileId` int,
	`outputFilename` varchar(512),
	`outputFormat` varchar(32) NOT NULL,
	`outputSize` bigint,
	`conversionType` enum('pdf_to_word','pdf_to_excel','pdf_to_ppt','word_to_pdf','excel_to_pdf','ppt_to_pdf','image_to_pdf','pdf_to_image','epub_to_pdf','pdf_to_epub','mobi_to_pdf','cad_to_pdf','text_to_pdf','pdf_to_text','html_to_pdf','pdf_to_html','markdown_to_pdf','merge','split','compress','rotate','watermark','encrypt','decrypt','ocr','transcription') NOT NULL,
	`status` enum('queued','processing','completed','failed') NOT NULL DEFAULT 'queued',
	`progress` int DEFAULT 0,
	`errorMessage` text,
	`processingTimeMs` int,
	`options` json,
	`batchId` varchar(64),
	`batchIndex` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `conversions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `file_tags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fileId` int NOT NULL,
	`tagId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `file_tags_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `files` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`teamId` int,
	`folderId` int,
	`filename` varchar(512) NOT NULL,
	`originalFilename` varchar(512) NOT NULL,
	`mimeType` varchar(128) NOT NULL,
	`fileSize` bigint NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`url` text NOT NULL,
	`pageCount` int,
	`metadata` json,
	`isEncrypted` boolean DEFAULT false,
	`encryptionKey` varchar(256),
	`password` varchar(256),
	`expiresAt` timestamp,
	`autoDeleteEnabled` boolean DEFAULT false,
	`version` int NOT NULL DEFAULT 1,
	`parentFileId` int,
	`status` enum('active','deleted','expired') NOT NULL DEFAULT 'active',
	`deletedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `files_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `folders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`parentId` int,
	`userId` int NOT NULL,
	`teamId` int,
	`isShared` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `folders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`teamId` int,
	`tier` enum('free','pro','enterprise') NOT NULL,
	`status` enum('active','cancelled','expired','past_due') NOT NULL DEFAULT 'active',
	`priceMonthly` int,
	`currency` varchar(3) DEFAULT 'USD',
	`currentPeriodStart` timestamp,
	`currentPeriodEnd` timestamp,
	`cancelledAt` timestamp,
	`stripeCustomerId` varchar(64),
	`stripeSubscriptionId` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(64) NOT NULL,
	`color` varchar(7) DEFAULT '#3B82F6',
	`userId` int NOT NULL,
	`teamId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tags_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `team_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teamId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('admin','editor','viewer') NOT NULL DEFAULT 'viewer',
	`invitedBy` int,
	`invitedAt` timestamp NOT NULL DEFAULT (now()),
	`joinedAt` timestamp,
	`status` enum('pending','active','removed') NOT NULL DEFAULT 'pending',
	CONSTRAINT `team_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`ownerId` int NOT NULL,
	`subscriptionTier` enum('pro','enterprise') NOT NULL DEFAULT 'pro',
	`storageQuotaBytes` bigint NOT NULL DEFAULT 53687091200,
	`storageUsedBytes` bigint NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `teams_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `usage_analytics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`teamId` int,
	`date` timestamp NOT NULL,
	`conversionsCount` int NOT NULL DEFAULT 0,
	`bytesProcessed` bigint NOT NULL DEFAULT 0,
	`bytesStored` bigint NOT NULL DEFAULT 0,
	`apiCalls` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `usage_analytics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `subscriptionTier` enum('free','pro','enterprise') DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `subscriptionExpiresAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `monthlyConversions` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `monthlyConversionsResetAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `storageUsedBytes` bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `language` varchar(10) DEFAULT 'en';--> statement-breakpoint
ALTER TABLE `users` ADD `timezone` varchar(64) DEFAULT 'UTC';--> statement-breakpoint
ALTER TABLE `users` ADD `dateFormat` varchar(32) DEFAULT 'MM/DD/YYYY';--> statement-breakpoint
ALTER TABLE `users` ADD `measurementUnit` enum('metric','imperial') DEFAULT 'metric';--> statement-breakpoint
ALTER TABLE `users` ADD `currency` varchar(3) DEFAULT 'USD';--> statement-breakpoint
ALTER TABLE `users` ADD `highContrastMode` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `users` ADD `twoFactorEnabled` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `users` ADD `twoFactorSecret` varchar(128);--> statement-breakpoint
ALTER TABLE `users` ADD `passkeyEnabled` boolean DEFAULT false;