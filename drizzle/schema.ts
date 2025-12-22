import { bigint, boolean, decimal, int, json, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

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
    "encrypt", "decrypt", "ocr", "transcription", "pdf_to_pdfa", "web_optimize"
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

/**
 * Cloud storage connections (Google Drive, Dropbox, OneDrive)
 */
export const cloudStorageConnections = mysqlTable("cloud_storage_connections", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  
  provider: mysqlEnum("provider", ["google_drive", "dropbox", "onedrive"]).notNull(),
  accessToken: text("accessToken").notNull(),
  refreshToken: text("refreshToken"),
  expiresAt: timestamp("expiresAt"),
  
  accountEmail: varchar("accountEmail", { length: 320 }),
  accountName: varchar("accountName", { length: 255 }),
  
  isActive: boolean("isActive").default(true).notNull(),
  lastSyncAt: timestamp("lastSyncAt"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CloudStorageConnection = typeof cloudStorageConnections.$inferSelect;
export type InsertCloudStorageConnection = typeof cloudStorageConnections.$inferInsert;

/**
 * PDF annotations for editor
 */
export const annotations = mysqlTable("annotations", {
  id: int("id").autoincrement().primaryKey(),
  fileId: int("fileId").notNull(),
  userId: int("userId").notNull(),
  
  type: mysqlEnum("type", ["highlight", "underline", "strikethrough", "text", "shape", "stamp", "signature", "comment", "drawing"]).notNull(),
  pageNumber: int("pageNumber").notNull(),
  
  // Position and dimensions
  positionX: int("positionX").notNull(),
  positionY: int("positionY").notNull(),
  width: int("width"),
  height: int("height"),
  
  // Content
  content: text("content"),
  color: varchar("color", { length: 32 }),
  
  // For shapes
  shapeType: varchar("shapeType", { length: 32 }),
  strokeWidth: int("strokeWidth"),
  
  // For drawings
  pathData: text("pathData"),
  
  // Metadata
  isResolved: boolean("isResolved").default(false),
  resolvedBy: int("resolvedBy"),
  resolvedAt: timestamp("resolvedAt"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Annotation = typeof annotations.$inferSelect;
export type InsertAnnotation = typeof annotations.$inferInsert;

/**
 * Cost tracking for ROI reporting
 */
export const costTracking = mysqlTable("cost_tracking", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  teamId: int("teamId"),
  
  date: timestamp("date").notNull(),
  
  // Costs
  computeCost: decimal("computeCost", { precision: 10, scale: 4 }).default("0").notNull(),
  storageCost: decimal("storageCost", { precision: 10, scale: 4 }).default("0").notNull(),
  bandwidthCost: decimal("bandwidthCost", { precision: 10, scale: 4 }).default("0").notNull(),
  aiProcessingCost: decimal("aiProcessingCost", { precision: 10, scale: 4 }).default("0").notNull(),
  totalCost: decimal("totalCost", { precision: 10, scale: 4 }).default("0").notNull(),
  
  // Usage metrics for cost calculation
  conversionsCount: int("conversionsCount").default(0).notNull(),
  ocrPagesProcessed: int("ocrPagesProcessed").default(0).notNull(),
  transcriptionMinutes: int("transcriptionMinutes").default(0).notNull(),
  aiChatTokens: int("aiChatTokens").default(0).notNull(),
  storageGbHours: decimal("storageGbHours", { precision: 10, scale: 4 }).default("0").notNull(),
  bandwidthGb: decimal("bandwidthGb", { precision: 10, scale: 4 }).default("0").notNull(),
  
  // Revenue (for ROI)
  subscriptionRevenue: decimal("subscriptionRevenue", { precision: 10, scale: 4 }).default("0").notNull(),
  adRevenue: decimal("adRevenue", { precision: 10, scale: 4 }).default("0").notNull(),
  totalRevenue: decimal("totalRevenue", { precision: 10, scale: 4 }).default("0").notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CostTracking = typeof costTracking.$inferSelect;
export type InsertCostTracking = typeof costTracking.$inferInsert;

/**
 * PDF comparison results
 */
export const pdfComparisons = mysqlTable("pdf_comparisons", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  
  file1Id: int("file1Id").notNull(),
  file2Id: int("file2Id").notNull(),
  
  // Results
  totalPages: int("totalPages").notNull(),
  changedPages: int("changedPages").notNull(),
  addedPages: int("addedPages").default(0).notNull(),
  removedPages: int("removedPages").default(0).notNull(),
  
  // Text diff summary
  textAdditions: int("textAdditions").default(0).notNull(),
  textDeletions: int("textDeletions").default(0).notNull(),
  textModifications: int("textModifications").default(0).notNull(),
  
  // Result file
  resultFileUrl: text("resultFileUrl"),
  diffDataJson: json("diffDataJson"),
  
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed"]).default("pending").notNull(),
  errorMessage: text("errorMessage"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type PdfComparison = typeof pdfComparisons.$inferSelect;
export type InsertPdfComparison = typeof pdfComparisons.$inferInsert;


/**
 * Batch job items for individual files in a batch
 */
export const batchJobItems = mysqlTable("batch_job_items", {
  id: int("id").autoincrement().primaryKey(),
  batchJobId: int("batchJobId").notNull(),
  conversionId: int("conversionId"),
  
  // Source file info
  sourceFilename: varchar("sourceFilename", { length: 512 }).notNull(),
  sourceFileKey: varchar("sourceFileKey", { length: 512 }).notNull(),
  sourceFileSize: bigint("sourceFileSize", { mode: "number" }).notNull(),
  sourceMimeType: varchar("sourceMimeType", { length: 128 }).notNull(),
  
  // Output file info
  outputFilename: varchar("outputFilename", { length: 512 }),
  outputFileKey: varchar("outputFileKey", { length: 512 }),
  outputFileUrl: text("outputFileUrl"),
  outputFileSize: bigint("outputFileSize", { mode: "number" }),
  
  // Processing
  status: mysqlEnum("status", ["queued", "processing", "completed", "failed", "cancelled"]).default("queued").notNull(),
  progress: int("progress").default(0).notNull(),
  errorMessage: text("errorMessage"),
  retryCount: int("retryCount").default(0).notNull(),
  maxRetries: int("maxRetries").default(3).notNull(),
  
  // Timing
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  processingTimeMs: int("processingTimeMs"),
  
  // Order in batch
  itemIndex: int("itemIndex").notNull(),
  priority: int("priority").default(0).notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BatchJobItem = typeof batchJobItems.$inferSelect;
export type InsertBatchJobItem = typeof batchJobItems.$inferInsert;

/**
 * Email templates for transactional emails
 */
export const emailTemplates = mysqlTable("email_templates", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 64 }).notNull().unique(),
  subject: varchar("subject", { length: 255 }).notNull(),
  htmlContent: text("htmlContent").notNull(),
  textContent: text("textContent"),
  variables: json("variables"), // List of variable names used in template
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type InsertEmailTemplate = typeof emailTemplates.$inferInsert;

/**
 * Email sending queue and history
 */
export const emailQueue = mysqlTable("email_queue", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  
  // Recipient
  toEmail: varchar("toEmail", { length: 320 }).notNull(),
  toName: varchar("toName", { length: 255 }),
  
  // Email content
  templateId: int("templateId"),
  templateName: varchar("templateName", { length: 64 }),
  subject: varchar("subject", { length: 255 }).notNull(),
  htmlContent: text("htmlContent").notNull(),
  textContent: text("textContent"),
  
  // Variables used
  variables: json("variables"),
  
  // Delivery status
  status: mysqlEnum("status", ["queued", "sending", "sent", "failed", "bounced"]).default("queued").notNull(),
  errorMessage: text("errorMessage"),
  
  // Resend tracking
  resendId: varchar("resendId", { length: 64 }),
  
  // Scheduling
  scheduledFor: timestamp("scheduledFor"),
  sentAt: timestamp("sentAt"),
  
  // Retry logic
  retryCount: int("retryCount").default(0).notNull(),
  maxRetries: int("maxRetries").default(3).notNull(),
  lastRetryAt: timestamp("lastRetryAt"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EmailQueueItem = typeof emailQueue.$inferSelect;
export type InsertEmailQueueItem = typeof emailQueue.$inferInsert;

/**
 * User email preferences
 */
export const emailPreferences = mysqlTable("email_preferences", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  
  // Notification preferences
  conversionComplete: boolean("conversionComplete").default(true).notNull(),
  batchComplete: boolean("batchComplete").default(true).notNull(),
  weeklyDigest: boolean("weeklyDigest").default(true).notNull(),
  teamInvitations: boolean("teamInvitations").default(true).notNull(),
  securityAlerts: boolean("securityAlerts").default(true).notNull(),
  productUpdates: boolean("productUpdates").default(false).notNull(),
  usageLimitWarnings: boolean("usageLimitWarnings").default(true).notNull(),
  
  // Unsubscribe token for one-click unsubscribe
  unsubscribeToken: varchar("unsubscribeToken", { length: 64 }).notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EmailPreferences = typeof emailPreferences.$inferSelect;
export type InsertEmailPreferences = typeof emailPreferences.$inferInsert;


/**
 * Social login connections (Google, GitHub)
 */
export const socialLogins = mysqlTable("social_logins", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  
  provider: mysqlEnum("provider", ["google", "github"]).notNull(),
  providerUserId: varchar("providerUserId", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }),
  name: varchar("name", { length: 255 }),
  avatarUrl: text("avatarUrl"),
  
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  expiresAt: timestamp("expiresAt"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SocialLogin = typeof socialLogins.$inferSelect;
export type InsertSocialLogin = typeof socialLogins.$inferInsert;

/**
 * Passkeys/WebAuthn credentials
 */
export const passkeys = mysqlTable("passkeys", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  
  credentialId: varchar("credentialId", { length: 512 }).notNull().unique(),
  publicKey: text("publicKey").notNull(),
  counter: bigint("counter", { mode: "number" }).default(0).notNull(),
  
  // Device info
  deviceName: varchar("deviceName", { length: 255 }),
  deviceType: varchar("deviceType", { length: 64 }), // platform, cross-platform
  aaguid: varchar("aaguid", { length: 64 }),
  
  // Transports
  transports: json("transports"), // ['usb', 'nfc', 'ble', 'internal']
  
  // Usage tracking
  lastUsedAt: timestamp("lastUsedAt"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Passkey = typeof passkeys.$inferSelect;
export type InsertPasskey = typeof passkeys.$inferInsert;

/**
 * TOTP 2FA backup codes
 */
export const twoFactorBackupCodes = mysqlTable("two_factor_backup_codes", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  
  code: varchar("code", { length: 32 }).notNull(),
  usedAt: timestamp("usedAt"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TwoFactorBackupCode = typeof twoFactorBackupCodes.$inferSelect;
export type InsertTwoFactorBackupCode = typeof twoFactorBackupCodes.$inferInsert;

/**
 * Voice command history for analytics
 */
export const voiceCommands = mysqlTable("voice_commands", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  
  transcript: text("transcript").notNull(),
  command: varchar("command", { length: 64 }),
  parameters: json("parameters"),
  
  confidence: decimal("confidence", { precision: 5, scale: 4 }),
  language: varchar("language", { length: 10 }),
  
  wasSuccessful: boolean("wasSuccessful").default(false).notNull(),
  errorMessage: text("errorMessage"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type VoiceCommand = typeof voiceCommands.$inferSelect;
export type InsertVoiceCommand = typeof voiceCommands.$inferInsert;


/**
 * Email/password authentication credentials
 */
export const userCredentials = mysqlTable("user_credentials", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  
  // Password (bcrypt hashed)
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  
  // Email verification
  emailVerified: boolean("emailVerified").default(false).notNull(),
  emailVerificationToken: varchar("emailVerificationToken", { length: 128 }),
  emailVerificationExpires: timestamp("emailVerificationExpires"),
  
  // Password reset
  passwordResetToken: varchar("passwordResetToken", { length: 128 }),
  passwordResetExpires: timestamp("passwordResetExpires"),
  
  // Security
  failedLoginAttempts: int("failedLoginAttempts").default(0).notNull(),
  lockedUntil: timestamp("lockedUntil"),
  lastPasswordChange: timestamp("lastPasswordChange").defaultNow().notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserCredentials = typeof userCredentials.$inferSelect;
export type InsertUserCredentials = typeof userCredentials.$inferInsert;

/**
 * Magic link tokens for passwordless login
 */
export const magicLinks = mysqlTable("magic_links", {
  id: int("id").autoincrement().primaryKey(),
  
  email: varchar("email", { length: 320 }).notNull(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  
  // Expiration (15 minutes)
  expiresAt: timestamp("expiresAt").notNull(),
  
  // Usage tracking
  usedAt: timestamp("usedAt"),
  ipAddress: varchar("ipAddress", { length: 45 }),
  userAgent: text("userAgent"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MagicLink = typeof magicLinks.$inferSelect;
export type InsertMagicLink = typeof magicLinks.$inferInsert;

/**
 * Device registration for smart sync
 */
export const userDevices = mysqlTable("user_devices", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  
  // Device identification
  deviceId: varchar("deviceId", { length: 128 }).notNull(),
  deviceName: varchar("deviceName", { length: 255 }),
  deviceType: mysqlEnum("deviceType", ["desktop", "laptop", "tablet", "mobile", "other"]).default("other").notNull(),
  
  // Browser/OS info
  browser: varchar("browser", { length: 64 }),
  os: varchar("os", { length: 64 }),
  
  // Sync status
  lastSyncAt: timestamp("lastSyncAt"),
  syncEnabled: boolean("syncEnabled").default(true).notNull(),
  
  // Push notifications
  pushToken: text("pushToken"),
  pushEnabled: boolean("pushEnabled").default(false).notNull(),
  
  // Security
  lastActiveAt: timestamp("lastActiveAt").defaultNow().notNull(),
  ipAddress: varchar("ipAddress", { length: 45 }),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserDevice = typeof userDevices.$inferSelect;
export type InsertUserDevice = typeof userDevices.$inferInsert;

/**
 * Sync queue for pending changes
 */
export const syncQueue = mysqlTable("sync_queue", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  deviceId: varchar("deviceId", { length: 128 }).notNull(),
  
  // Change info
  entityType: mysqlEnum("entityType", ["file", "folder", "annotation", "setting"]).notNull(),
  entityId: int("entityId").notNull(),
  action: mysqlEnum("action", ["create", "update", "delete"]).notNull(),
  
  // Change data
  changeData: json("changeData"),
  
  // Sync status
  status: mysqlEnum("status", ["pending", "syncing", "synced", "conflict", "failed"]).default("pending").notNull(),
  conflictResolution: mysqlEnum("conflictResolution", ["local_wins", "remote_wins", "manual"]),
  
  // Timing
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  syncedAt: timestamp("syncedAt"),
});

export type SyncQueueItem = typeof syncQueue.$inferSelect;
export type InsertSyncQueueItem = typeof syncQueue.$inferInsert;

/**
 * File snapshots for point-in-time recovery
 */
export const fileSnapshots = mysqlTable("file_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  fileId: int("fileId").notNull(),
  userId: int("userId").notNull(),
  
  // Snapshot info
  snapshotNumber: int("snapshotNumber").notNull(),
  snapshotType: mysqlEnum("snapshotType", ["auto", "manual", "pre_edit"]).default("auto").notNull(),
  description: varchar("description", { length: 255 }),
  
  // File data
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  fileUrl: text("fileUrl").notNull(),
  fileSize: bigint("fileSize", { mode: "number" }).notNull(),
  checksum: varchar("checksum", { length: 64 }),
  
  // Metadata at time of snapshot
  metadata: json("metadata"),
  
  // Retention
  expiresAt: timestamp("expiresAt"), // null = never expires
  isProtected: boolean("isProtected").default(false).notNull(), // protected from auto-cleanup
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FileSnapshot = typeof fileSnapshots.$inferSelect;
export type InsertFileSnapshot = typeof fileSnapshots.$inferInsert;

/**
 * Context-aware OCR results
 */
export const ocrResults = mysqlTable("ocr_results", {
  id: int("id").autoincrement().primaryKey(),
  fileId: int("fileId").notNull(),
  userId: int("userId").notNull(),
  
  // Document classification
  documentType: mysqlEnum("documentType", ["invoice", "receipt", "form", "contract", "letter", "report", "table", "handwritten", "other"]).default("other").notNull(),
  confidence: decimal("confidence", { precision: 5, scale: 4 }),
  
  // Extracted text
  fullText: text("fullText"),
  pageCount: int("pageCount").default(1).notNull(),
  
  // Structured data extraction
  extractedFields: json("extractedFields"), // { field_name: { value, confidence, location } }
  tables: json("tables"), // Array of extracted tables
  
  // Language detection
  primaryLanguage: varchar("primaryLanguage", { length: 10 }),
  detectedLanguages: json("detectedLanguages"),
  
  // Processing info
  processingTimeMs: int("processingTimeMs"),
  ocrEngine: varchar("ocrEngine", { length: 64 }).default("tesseract"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type OcrResult = typeof ocrResults.$inferSelect;
export type InsertOcrResult = typeof ocrResults.$inferInsert;
