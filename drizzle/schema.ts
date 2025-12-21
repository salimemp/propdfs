import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, bigint, json } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  
  // Subscription & Usage
  subscriptionTier: mysqlEnum("subscriptionTier", ["free", "pro", "enterprise"]).default("free").notNull(),
  subscriptionExpiresAt: timestamp("subscriptionExpiresAt"),
  monthlyConversions: int("monthlyConversions").default(0).notNull(),
  monthlyConversionsResetAt: timestamp("monthlyConversionsResetAt"),
  storageUsedBytes: bigint("storageUsedBytes", { mode: "number" }).default(0).notNull(),
  
  // Preferences
  language: varchar("language", { length: 10 }).default("en"),
  timezone: varchar("timezone", { length: 64 }).default("UTC"),
  dateFormat: varchar("dateFormat", { length: 32 }).default("MM/DD/YYYY"),
  measurementUnit: mysqlEnum("measurementUnit", ["metric", "imperial"]).default("metric"),
  currency: varchar("currency", { length: 3 }).default("USD"),
  highContrastMode: boolean("highContrastMode").default(false),
  
  // Security
  twoFactorEnabled: boolean("twoFactorEnabled").default(false),
  twoFactorSecret: varchar("twoFactorSecret", { length: 128 }),
  passkeyEnabled: boolean("passkeyEnabled").default(false),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Teams for collaboration
 */
export const teams = mysqlTable("teams", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  ownerId: int("ownerId").notNull(),
  subscriptionTier: mysqlEnum("subscriptionTier", ["pro", "enterprise"]).default("pro").notNull(),
  storageQuotaBytes: bigint("storageQuotaBytes", { mode: "number" }).default(53687091200).notNull(), // 50GB default
  storageUsedBytes: bigint("storageUsedBytes", { mode: "number" }).default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Team = typeof teams.$inferSelect;
export type InsertTeam = typeof teams.$inferInsert;

/**
 * Team members with roles
 */
export const teamMembers = mysqlTable("team_members", {
  id: int("id").autoincrement().primaryKey(),
  teamId: int("teamId").notNull(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["admin", "editor", "viewer"]).default("viewer").notNull(),
  invitedBy: int("invitedBy"),
  invitedAt: timestamp("invitedAt").defaultNow().notNull(),
  joinedAt: timestamp("joinedAt"),
  status: mysqlEnum("status", ["pending", "active", "removed"]).default("pending").notNull(),
});

export type TeamMember = typeof teamMembers.$inferSelect;
export type InsertTeamMember = typeof teamMembers.$inferInsert;

/**
 * Folders for file organization
 */
export const folders = mysqlTable("folders", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  parentId: int("parentId"),
  userId: int("userId").notNull(),
  teamId: int("teamId"),
  isShared: boolean("isShared").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Folder = typeof folders.$inferSelect;
export type InsertFolder = typeof folders.$inferInsert;

/**
 * Files uploaded by users
 */
export const files = mysqlTable("files", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  teamId: int("teamId"),
  folderId: int("folderId"),
  
  // File info
  filename: varchar("filename", { length: 512 }).notNull(),
  originalFilename: varchar("originalFilename", { length: 512 }).notNull(),
  mimeType: varchar("mimeType", { length: 128 }).notNull(),
  fileSize: bigint("fileSize", { mode: "number" }).notNull(),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  url: text("url").notNull(),
  
  // Metadata
  pageCount: int("pageCount"),
  metadata: json("metadata"),
  
  // Security
  isEncrypted: boolean("isEncrypted").default(false),
  encryptionKey: varchar("encryptionKey", { length: 256 }),
  password: varchar("password", { length: 256 }),
  
  // Auto-expiration
  expiresAt: timestamp("expiresAt"),
  autoDeleteEnabled: boolean("autoDeleteEnabled").default(false),
  
  // Version control
  version: int("version").default(1).notNull(),
  parentFileId: int("parentFileId"),
  
  // Status
  status: mysqlEnum("status", ["active", "deleted", "expired"]).default("active").notNull(),
  deletedAt: timestamp("deletedAt"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type File = typeof files.$inferSelect;
export type InsertFile = typeof files.$inferInsert;

/**
 * Tags for file organization
 */
export const tags = mysqlTable("tags", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 64 }).notNull(),
  color: varchar("color", { length: 7 }).default("#3B82F6"),
  userId: int("userId").notNull(),
  teamId: int("teamId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Tag = typeof tags.$inferSelect;
export type InsertTag = typeof tags.$inferInsert;

/**
 * File-tag relationships
 */
export const fileTags = mysqlTable("file_tags", {
  id: int("id").autoincrement().primaryKey(),
  fileId: int("fileId").notNull(),
  tagId: int("tagId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FileTag = typeof fileTags.$inferSelect;
export type InsertFileTag = typeof fileTags.$inferInsert;

/**
 * Conversions tracking
 */
export const conversions = mysqlTable("conversions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  teamId: int("teamId"),
  
  // Source file
  sourceFileId: int("sourceFileId"),
  sourceFilename: varchar("sourceFilename", { length: 512 }).notNull(),
  sourceFormat: varchar("sourceFormat", { length: 32 }).notNull(),
  sourceSize: bigint("sourceSize", { mode: "number" }).notNull(),
  
  // Output file
  outputFileId: int("outputFileId"),
  outputFilename: varchar("outputFilename", { length: 512 }),
  outputFormat: varchar("outputFormat", { length: 32 }).notNull(),
  outputSize: bigint("outputSize", { mode: "number" }),
  
  // Conversion details
  conversionType: mysqlEnum("conversionType", [
    "pdf_to_word", "pdf_to_excel", "pdf_to_ppt",
    "word_to_pdf", "excel_to_pdf", "ppt_to_pdf",
    "image_to_pdf", "pdf_to_image",
    "epub_to_pdf", "pdf_to_epub", "mobi_to_pdf",
    "cad_to_pdf", "text_to_pdf", "pdf_to_text",
    "html_to_pdf", "pdf_to_html", "markdown_to_pdf",
    "merge", "split", "compress", "rotate", "watermark",
    "encrypt", "decrypt", "ocr", "transcription"
  ]).notNull(),
  
  // Processing
  status: mysqlEnum("status", ["queued", "processing", "completed", "failed"]).default("queued").notNull(),
  progress: int("progress").default(0),
  errorMessage: text("errorMessage"),
  processingTimeMs: int("processingTimeMs"),
  
  // Options
  options: json("options"),
  
  // Batch processing
  batchId: varchar("batchId", { length: 64 }),
  batchIndex: int("batchIndex"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type Conversion = typeof conversions.$inferSelect;
export type InsertConversion = typeof conversions.$inferInsert;

/**
 * Batch jobs for multi-file processing
 */
export const batchJobs = mysqlTable("batch_jobs", {
  id: int("id").autoincrement().primaryKey(),
  batchId: varchar("batchId", { length: 64 }).notNull().unique(),
  userId: int("userId").notNull(),
  teamId: int("teamId"),
  
  totalFiles: int("totalFiles").notNull(),
  completedFiles: int("completedFiles").default(0).notNull(),
  failedFiles: int("failedFiles").default(0).notNull(),
  
  status: mysqlEnum("status", ["queued", "processing", "completed", "failed", "cancelled"]).default("queued").notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type BatchJob = typeof batchJobs.$inferSelect;
export type InsertBatchJob = typeof batchJobs.$inferInsert;

/**
 * Audit logs for compliance
 */
export const auditLogs = mysqlTable("audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  teamId: int("teamId"),
  
  action: varchar("action", { length: 64 }).notNull(),
  resourceType: varchar("resourceType", { length: 64 }).notNull(),
  resourceId: int("resourceId"),
  
  details: json("details"),
  ipAddress: varchar("ipAddress", { length: 45 }),
  userAgent: text("userAgent"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

/**
 * File comments and annotations
 */
export const comments = mysqlTable("comments", {
  id: int("id").autoincrement().primaryKey(),
  fileId: int("fileId").notNull(),
  userId: int("userId").notNull(),
  parentId: int("parentId"),
  
  content: text("content").notNull(),
  pageNumber: int("pageNumber"),
  positionX: int("positionX"),
  positionY: int("positionY"),
  
  status: mysqlEnum("status", ["active", "resolved", "deleted"]).default("active").notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Comment = typeof comments.$inferSelect;
export type InsertComment = typeof comments.$inferInsert;

/**
 * Approval workflows
 */
export const approvalWorkflows = mysqlTable("approval_workflows", {
  id: int("id").autoincrement().primaryKey(),
  teamId: int("teamId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  steps: json("steps").notNull(), // Array of {order, approverIds, requireAll}
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ApprovalWorkflow = typeof approvalWorkflows.$inferSelect;
export type InsertApprovalWorkflow = typeof approvalWorkflows.$inferInsert;

/**
 * Approval requests
 */
export const approvalRequests = mysqlTable("approval_requests", {
  id: int("id").autoincrement().primaryKey(),
  workflowId: int("workflowId").notNull(),
  fileId: int("fileId").notNull(),
  requesterId: int("requesterId").notNull(),
  
  currentStep: int("currentStep").default(1).notNull(),
  status: mysqlEnum("status", ["pending", "approved", "rejected", "cancelled"]).default("pending").notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type ApprovalRequest = typeof approvalRequests.$inferSelect;
export type InsertApprovalRequest = typeof approvalRequests.$inferInsert;

/**
 * Subscriptions and billing
 */
export const subscriptions = mysqlTable("subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  teamId: int("teamId"),
  
  tier: mysqlEnum("tier", ["free", "pro", "enterprise"]).notNull(),
  status: mysqlEnum("status", ["active", "cancelled", "expired", "past_due"]).default("active").notNull(),
  
  priceMonthly: int("priceMonthly"), // in cents
  currency: varchar("currency", { length: 3 }).default("USD"),
  
  currentPeriodStart: timestamp("currentPeriodStart"),
  currentPeriodEnd: timestamp("currentPeriodEnd"),
  cancelledAt: timestamp("cancelledAt"),
  
  stripeCustomerId: varchar("stripeCustomerId", { length: 64 }),
  stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 64 }),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;

/**
 * Usage analytics
 */
export const usageAnalytics = mysqlTable("usage_analytics", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  teamId: int("teamId"),
  
  date: timestamp("date").notNull(),
  conversionsCount: int("conversionsCount").default(0).notNull(),
  bytesProcessed: bigint("bytesProcessed", { mode: "number" }).default(0).notNull(),
  bytesStored: bigint("bytesStored", { mode: "number" }).default(0).notNull(),
  apiCalls: int("apiCalls").default(0).notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type UsageAnalytics = typeof usageAnalytics.$inferSelect;
export type InsertUsageAnalytics = typeof usageAnalytics.$inferInsert;

/**
 * Saved conversion presets/templates
 */
export const conversionPresets = mysqlTable("conversion_presets", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  teamId: int("teamId"),
  
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  conversionType: varchar("conversionType", { length: 64 }).notNull(),
  options: json("options").notNull(),
  
  isDefault: boolean("isDefault").default(false),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ConversionPreset = typeof conversionPresets.$inferSelect;
export type InsertConversionPreset = typeof conversionPresets.$inferInsert;

/**
 * AI chat history
 */
export const chatHistory = mysqlTable("chat_history", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  sessionId: varchar("sessionId", { length: 64 }).notNull(),
  
  role: mysqlEnum("role", ["user", "assistant"]).notNull(),
  content: text("content").notNull(),
  
  fileId: int("fileId"),
  actionTaken: varchar("actionTaken", { length: 64 }),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ChatHistory = typeof chatHistory.$inferSelect;
export type InsertChatHistory = typeof chatHistory.$inferInsert;
