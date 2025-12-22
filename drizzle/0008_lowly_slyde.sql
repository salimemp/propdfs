CREATE TABLE `file_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fileId` int NOT NULL,
	`userId` int NOT NULL,
	`snapshotNumber` int NOT NULL,
	`snapshotType` enum('auto','manual','pre_edit') NOT NULL DEFAULT 'auto',
	`description` varchar(255),
	`fileKey` varchar(512) NOT NULL,
	`fileUrl` text NOT NULL,
	`fileSize` bigint NOT NULL,
	`checksum` varchar(64),
	`metadata` json,
	`expiresAt` timestamp,
	`isProtected` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `file_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `magic_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`token` varchar(128) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`ipAddress` varchar(45),
	`userAgent` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `magic_links_id` PRIMARY KEY(`id`),
	CONSTRAINT `magic_links_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `ocr_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fileId` int NOT NULL,
	`userId` int NOT NULL,
	`documentType` enum('invoice','receipt','form','contract','letter','report','table','handwritten','other') NOT NULL DEFAULT 'other',
	`confidence` decimal(5,4),
	`fullText` text,
	`pageCount` int NOT NULL DEFAULT 1,
	`extractedFields` json,
	`tables` json,
	`primaryLanguage` varchar(10),
	`detectedLanguages` json,
	`processingTimeMs` int,
	`ocrEngine` varchar(64) DEFAULT 'tesseract',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ocr_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sync_queue` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`deviceId` varchar(128) NOT NULL,
	`entityType` enum('file','folder','annotation','setting') NOT NULL,
	`entityId` int NOT NULL,
	`action` enum('create','update','delete') NOT NULL,
	`changeData` json,
	`status` enum('pending','syncing','synced','conflict','failed') NOT NULL DEFAULT 'pending',
	`conflictResolution` enum('local_wins','remote_wins','manual'),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`syncedAt` timestamp,
	CONSTRAINT `sync_queue_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_credentials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`emailVerified` boolean NOT NULL DEFAULT false,
	`emailVerificationToken` varchar(128),
	`emailVerificationExpires` timestamp,
	`passwordResetToken` varchar(128),
	`passwordResetExpires` timestamp,
	`failedLoginAttempts` int NOT NULL DEFAULT 0,
	`lockedUntil` timestamp,
	`lastPasswordChange` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_credentials_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_credentials_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `user_devices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`deviceId` varchar(128) NOT NULL,
	`deviceName` varchar(255),
	`deviceType` enum('desktop','laptop','tablet','mobile','other') NOT NULL DEFAULT 'other',
	`browser` varchar(64),
	`os` varchar(64),
	`lastSyncAt` timestamp,
	`syncEnabled` boolean NOT NULL DEFAULT true,
	`pushToken` text,
	`pushEnabled` boolean NOT NULL DEFAULT false,
	`lastActiveAt` timestamp NOT NULL DEFAULT (now()),
	`ipAddress` varchar(45),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_devices_id` PRIMARY KEY(`id`)
);
