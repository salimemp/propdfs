CREATE TABLE `file_share_access_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`shareId` int NOT NULL,
	`accessType` enum('view','download','preview') NOT NULL,
	`accessorUserId` int,
	`accessorEmail` varchar(320),
	`accessorIp` varchar(45),
	`accessorUserAgent` text,
	`accessorCountry` varchar(2),
	`accessorCity` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `file_share_access_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `file_share_recipients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`shareId` int NOT NULL,
	`recipientEmail` varchar(320),
	`recipientUserId` int,
	`invitationSentAt` timestamp,
	`invitationAcceptedAt` timestamp,
	`lastAccessedAt` timestamp,
	`accessCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `file_share_recipients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `file_shares` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fileId` int NOT NULL,
	`ownerId` int NOT NULL,
	`shareToken` varchar(64) NOT NULL,
	`shareType` enum('link','email','team') NOT NULL DEFAULT 'link',
	`permission` enum('view','download','edit','comment') NOT NULL DEFAULT 'view',
	`isPublic` boolean NOT NULL DEFAULT true,
	`requiresPassword` boolean NOT NULL DEFAULT false,
	`passwordHash` varchar(255),
	`expiresAt` timestamp,
	`maxDownloads` int,
	`downloadCount` int NOT NULL DEFAULT 0,
	`maxViews` int,
	`viewCount` int NOT NULL DEFAULT 0,
	`notifyOnAccess` boolean NOT NULL DEFAULT false,
	`isActive` boolean NOT NULL DEFAULT true,
	`revokedAt` timestamp,
	`revokedReason` varchar(255),
	`customMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `file_shares_id` PRIMARY KEY(`id`),
	CONSTRAINT `file_shares_shareToken_unique` UNIQUE(`shareToken`)
);
