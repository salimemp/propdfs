import { eq, and, desc, sql, like, or, gte, lte, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { 
  InsertUser, users, 
  teams, InsertTeam, 
  teamMembers, InsertTeamMember,
  folders, InsertFolder,
  files, InsertFile,
  tags, InsertTag,
  fileTags, InsertFileTag,
  conversions, InsertConversion,
  batchJobs, InsertBatchJob,
  auditLogs, InsertAuditLog,
  comments, InsertComment,
  approvalWorkflows, InsertApprovalWorkflow,
  approvalRequests, InsertApprovalRequest,
  subscriptions, InsertSubscription,
  usageAnalytics, InsertUsageAnalytics,
  conversionPresets, InsertConversionPreset,
  chatHistory, InsertChatHistory
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ==================== USER OPERATIONS ====================

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateUserSubscription(userId: number, tier: "free" | "pro" | "enterprise", expiresAt?: Date) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({
    subscriptionTier: tier,
    subscriptionExpiresAt: expiresAt || null,
  }).where(eq(users.id, userId));
}

export async function incrementUserConversions(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({
    monthlyConversions: sql`${users.monthlyConversions} + 1`,
  }).where(eq(users.id, userId));
}

export async function resetUserMonthlyConversions(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({
    monthlyConversions: 0,
    monthlyConversionsResetAt: new Date(),
  }).where(eq(users.id, userId));
}

export async function updateUserPreferences(userId: number, prefs: {
  language?: string;
  timezone?: string;
  dateFormat?: string;
  measurementUnit?: "metric" | "imperial";
  currency?: string;
  highContrastMode?: boolean;
}) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set(prefs).where(eq(users.id, userId));
}

// ==================== TEAM OPERATIONS ====================

export async function createTeam(team: InsertTeam) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(teams).values(team);
  return result[0].insertId;
}

export async function getTeamById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(teams).where(eq(teams.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserTeams(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const result = await db.select({
    team: teams,
    membership: teamMembers,
  })
  .from(teamMembers)
  .innerJoin(teams, eq(teamMembers.teamId, teams.id))
  .where(and(
    eq(teamMembers.userId, userId),
    eq(teamMembers.status, "active")
  ));
  return result;
}

export async function addTeamMember(member: InsertTeamMember) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(teamMembers).values(member);
  return result[0].insertId;
}

export async function getTeamMembers(teamId: number) {
  const db = await getDb();
  if (!db) return [];
  const result = await db.select({
    member: teamMembers,
    user: users,
  })
  .from(teamMembers)
  .innerJoin(users, eq(teamMembers.userId, users.id))
  .where(and(
    eq(teamMembers.teamId, teamId),
    eq(teamMembers.status, "active")
  ));
  return result;
}

export async function updateTeamMemberRole(teamId: number, userId: number, role: "admin" | "editor" | "viewer") {
  const db = await getDb();
  if (!db) return;
  await db.update(teamMembers).set({ role }).where(
    and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId))
  );
}

export async function removeTeamMember(teamId: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(teamMembers).set({ status: "removed" }).where(
    and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId))
  );
}

// ==================== FOLDER OPERATIONS ====================

export async function createFolder(folder: InsertFolder) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(folders).values(folder);
  return result[0].insertId;
}

export async function getUserFolders(userId: number, parentId?: number | null) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(folders.userId, userId)];
  if (parentId === null) {
    conditions.push(sql`${folders.parentId} IS NULL`);
  } else if (parentId !== undefined) {
    conditions.push(eq(folders.parentId, parentId));
  }
  return await db.select().from(folders).where(and(...conditions)).orderBy(folders.name);
}

export async function getTeamFolders(teamId: number, parentId?: number | null) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(folders.teamId, teamId)];
  if (parentId === null) {
    conditions.push(sql`${folders.parentId} IS NULL`);
  } else if (parentId !== undefined) {
    conditions.push(eq(folders.parentId, parentId));
  }
  return await db.select().from(folders).where(and(...conditions)).orderBy(folders.name);
}

export async function updateFolder(id: number, data: Partial<InsertFolder>) {
  const db = await getDb();
  if (!db) return;
  await db.update(folders).set(data).where(eq(folders.id, id));
}

export async function deleteFolder(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(folders).where(eq(folders.id, id));
}

// ==================== FILE OPERATIONS ====================

export async function createFile(file: InsertFile) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(files).values(file);
  return result[0].insertId;
}

export async function getFileById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(files).where(
    and(eq(files.id, id), eq(files.status, "active"))
  ).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserFiles(userId: number, options?: {
  folderId?: number | null;
  search?: string;
  mimeTypes?: string[];
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [eq(files.userId, userId), eq(files.status, "active")];
  
  if (options?.folderId === null) {
    conditions.push(sql`${files.folderId} IS NULL`);
  } else if (options?.folderId !== undefined) {
    conditions.push(eq(files.folderId, options.folderId));
  }
  
  if (options?.search) {
    conditions.push(like(files.originalFilename, `%${options.search}%`));
  }
  
  if (options?.mimeTypes && options.mimeTypes.length > 0) {
    conditions.push(inArray(files.mimeType, options.mimeTypes));
  }
  
  let query = db.select().from(files).where(and(...conditions)).orderBy(desc(files.createdAt));
  
  if (options?.limit) {
    query = query.limit(options.limit) as typeof query;
  }
  if (options?.offset) {
    query = query.offset(options.offset) as typeof query;
  }
  
  return await query;
}

export async function getTeamFiles(teamId: number, options?: {
  folderId?: number | null;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [eq(files.teamId, teamId), eq(files.status, "active")];
  
  if (options?.folderId === null) {
    conditions.push(sql`${files.folderId} IS NULL`);
  } else if (options?.folderId !== undefined) {
    conditions.push(eq(files.folderId, options.folderId));
  }
  
  if (options?.search) {
    conditions.push(like(files.originalFilename, `%${options.search}%`));
  }
  
  let query = db.select().from(files).where(and(...conditions)).orderBy(desc(files.createdAt));
  
  if (options?.limit) {
    query = query.limit(options.limit) as typeof query;
  }
  
  return await query;
}

export async function updateFile(id: number, data: Partial<InsertFile>) {
  const db = await getDb();
  if (!db) return;
  await db.update(files).set(data).where(eq(files.id, id));
}

export async function softDeleteFile(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(files).set({ 
    status: "deleted", 
    deletedAt: new Date() 
  }).where(eq(files.id, id));
}

export async function getFileVersions(fileId: number) {
  const db = await getDb();
  if (!db) return [];
  const file = await getFileById(fileId);
  if (!file) return [];
  
  // Get all versions by following the parentFileId chain
  const versions = [file];
  let currentFile = file;
  while (currentFile.parentFileId) {
    const parent = await getFileById(currentFile.parentFileId);
    if (parent) {
      versions.push(parent);
      currentFile = parent;
    } else {
      break;
    }
  }
  return versions;
}

// ==================== TAG OPERATIONS ====================

export async function createTag(tag: InsertTag) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(tags).values(tag);
  return result[0].insertId;
}

export async function getUserTags(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(tags).where(eq(tags.userId, userId)).orderBy(tags.name);
}

export async function addTagToFile(fileId: number, tagId: number) {
  const db = await getDb();
  if (!db) return;
  await db.insert(fileTags).values({ fileId, tagId }).onDuplicateKeyUpdate({ set: { tagId } });
}

export async function removeTagFromFile(fileId: number, tagId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(fileTags).where(and(eq(fileTags.fileId, fileId), eq(fileTags.tagId, tagId)));
}

export async function getFileTags(fileId: number) {
  const db = await getDb();
  if (!db) return [];
  const result = await db.select({ tag: tags })
    .from(fileTags)
    .innerJoin(tags, eq(fileTags.tagId, tags.id))
    .where(eq(fileTags.fileId, fileId));
  return result.map(r => r.tag);
}

// ==================== CONVERSION OPERATIONS ====================

export async function createConversion(conversion: InsertConversion) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(conversions).values(conversion);
  return result[0].insertId;
}

export async function getConversionById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(conversions).where(eq(conversions.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserConversions(userId: number, options?: {
  status?: "queued" | "processing" | "completed" | "failed";
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [eq(conversions.userId, userId)];
  if (options?.status) {
    conditions.push(eq(conversions.status, options.status));
  }
  
  let query = db.select().from(conversions).where(and(...conditions)).orderBy(desc(conversions.createdAt));
  
  if (options?.limit) {
    query = query.limit(options.limit) as typeof query;
  }
  
  return await query;
}

export async function updateConversion(id: number, data: Partial<InsertConversion>) {
  const db = await getDb();
  if (!db) return;
  await db.update(conversions).set(data).where(eq(conversions.id, id));
}

export async function getConversionStats(userId: number, startDate?: Date, endDate?: Date) {
  const db = await getDb();
  if (!db) return null;
  
  const conditions = [eq(conversions.userId, userId)];
  if (startDate) conditions.push(gte(conversions.createdAt, startDate));
  if (endDate) conditions.push(lte(conversions.createdAt, endDate));
  
  const result = await db.select({
    total: sql<number>`COUNT(*)`,
    completed: sql<number>`SUM(CASE WHEN ${conversions.status} = 'completed' THEN 1 ELSE 0 END)`,
    failed: sql<number>`SUM(CASE WHEN ${conversions.status} = 'failed' THEN 1 ELSE 0 END)`,
    avgProcessingTime: sql<number>`AVG(${conversions.processingTimeMs})`,
    totalBytesProcessed: sql<number>`SUM(${conversions.sourceSize})`,
  }).from(conversions).where(and(...conditions));
  
  return result[0];
}

// ==================== BATCH JOB OPERATIONS ====================

export async function createBatchJob(job: InsertBatchJob) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(batchJobs).values(job);
  return result[0].insertId;
}

export async function getBatchJobById(batchId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(batchJobs).where(eq(batchJobs.batchId, batchId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateBatchJob(batchId: string, data: Partial<InsertBatchJob>) {
  const db = await getDb();
  if (!db) return;
  await db.update(batchJobs).set(data).where(eq(batchJobs.batchId, batchId));
}

export async function incrementBatchJobProgress(batchId: string, success: boolean) {
  const db = await getDb();
  if (!db) return;
  if (success) {
    await db.update(batchJobs).set({
      completedFiles: sql`${batchJobs.completedFiles} + 1`,
    }).where(eq(batchJobs.batchId, batchId));
  } else {
    await db.update(batchJobs).set({
      failedFiles: sql`${batchJobs.failedFiles} + 1`,
    }).where(eq(batchJobs.batchId, batchId));
  }
}

// ==================== AUDIT LOG OPERATIONS ====================

export async function createAuditLog(log: InsertAuditLog) {
  const db = await getDb();
  if (!db) return;
  await db.insert(auditLogs).values(log);
}

export async function getAuditLogs(options: {
  userId?: number;
  teamId?: number;
  resourceType?: string;
  resourceId?: number;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  
  const conditions = [];
  if (options.userId) conditions.push(eq(auditLogs.userId, options.userId));
  if (options.teamId) conditions.push(eq(auditLogs.teamId, options.teamId));
  if (options.resourceType) conditions.push(eq(auditLogs.resourceType, options.resourceType));
  if (options.resourceId) conditions.push(eq(auditLogs.resourceId, options.resourceId));
  if (options.startDate) conditions.push(gte(auditLogs.createdAt, options.startDate));
  if (options.endDate) conditions.push(lte(auditLogs.createdAt, options.endDate));
  
  let query = db.select().from(auditLogs);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }
  query = query.orderBy(desc(auditLogs.createdAt)) as typeof query;
  
  if (options.limit) {
    query = query.limit(options.limit) as typeof query;
  }
  
  return await query;
}

// ==================== COMMENT OPERATIONS ====================

export async function createComment(comment: InsertComment) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(comments).values(comment);
  return result[0].insertId;
}

export async function getFileComments(fileId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select({
    comment: comments,
    user: users,
  })
  .from(comments)
  .innerJoin(users, eq(comments.userId, users.id))
  .where(and(eq(comments.fileId, fileId), eq(comments.status, "active")))
  .orderBy(comments.createdAt);
}

export async function updateComment(id: number, content: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(comments).set({ content }).where(eq(comments.id, id));
}

export async function deleteComment(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(comments).set({ status: "deleted" }).where(eq(comments.id, id));
}

// ==================== SUBSCRIPTION OPERATIONS ====================

export async function createSubscription(subscription: InsertSubscription) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(subscriptions).values(subscription);
  return result[0].insertId;
}

export async function getUserSubscription(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateSubscription(id: number, data: Partial<InsertSubscription>) {
  const db = await getDb();
  if (!db) return;
  await db.update(subscriptions).set(data).where(eq(subscriptions.id, id));
}

// ==================== USAGE ANALYTICS OPERATIONS ====================

export async function recordUsage(data: InsertUsageAnalytics) {
  const db = await getDb();
  if (!db) return;
  await db.insert(usageAnalytics).values(data);
}

export async function getUserUsageStats(userId: number, startDate: Date, endDate: Date) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(usageAnalytics)
    .where(and(
      eq(usageAnalytics.userId, userId),
      gte(usageAnalytics.date, startDate),
      lte(usageAnalytics.date, endDate)
    ))
    .orderBy(usageAnalytics.date);
}

// ==================== CONVERSION PRESET OPERATIONS ====================

export async function createConversionPreset(preset: InsertConversionPreset) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(conversionPresets).values(preset);
  return result[0].insertId;
}

export async function getUserPresets(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(conversionPresets)
    .where(eq(conversionPresets.userId, userId))
    .orderBy(conversionPresets.name);
}

export async function deletePreset(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(conversionPresets).where(eq(conversionPresets.id, id));
}

// ==================== CHAT HISTORY OPERATIONS ====================

export async function saveChatMessage(message: InsertChatHistory) {
  const db = await getDb();
  if (!db) return;
  await db.insert(chatHistory).values(message);
}

export async function getChatHistory(userId: number, sessionId: string, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(chatHistory)
    .where(and(eq(chatHistory.userId, userId), eq(chatHistory.sessionId, sessionId)))
    .orderBy(chatHistory.createdAt)
    .limit(limit);
}

// ==================== APPROVAL WORKFLOW OPERATIONS ====================

export async function createApprovalWorkflow(workflow: InsertApprovalWorkflow) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(approvalWorkflows).values(workflow);
  return result[0].insertId;
}

export async function getTeamWorkflows(teamId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(approvalWorkflows)
    .where(and(eq(approvalWorkflows.teamId, teamId), eq(approvalWorkflows.isActive, true)));
}

export async function createApprovalRequest(request: InsertApprovalRequest) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(approvalRequests).values(request);
  return result[0].insertId;
}

export async function updateApprovalRequest(id: number, data: Partial<InsertApprovalRequest>) {
  const db = await getDb();
  if (!db) return;
  await db.update(approvalRequests).set(data).where(eq(approvalRequests.id, id));
}
