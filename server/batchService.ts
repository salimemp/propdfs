import { nanoid } from "nanoid";
import { eq, and, inArray, sql } from "drizzle-orm";
import { getDb } from "./db";
import { batchJobs, batchJobItems, conversions, files } from "../drizzle/schema";
import type { InsertBatchJob, InsertBatchJobItem, BatchJob, BatchJobItem } from "../drizzle/schema";
import { storagePut } from "./storage";

// Types
export type BatchJobStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";
export type BatchItemStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";

export interface BatchJobConfig {
  userId: number;
  teamId?: number;
  conversionType: string;
  conversionOptions?: Record<string, unknown>;
  maxConcurrency?: number;
  priority?: number;
  notifyOnComplete?: boolean;
  notifyEmail?: string;
}

export interface BatchFileInput {
  filename: string;
  fileKey: string;
  fileSize: number;
  mimeType: string;
  fileBuffer?: Buffer;
}

export interface BatchJobProgress {
  batchId: string;
  status: BatchJobStatus;
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  progressPercent: number;
  items: BatchItemProgress[];
  estimatedTimeRemaining?: number;
  startedAt?: Date;
  completedAt?: Date;
}

export interface BatchItemProgress {
  itemId: number;
  filename: string;
  status: BatchItemStatus;
  progress: number;
  errorMessage?: string;
  outputUrl?: string;
  processingTimeMs?: number;
}

// In-memory job queue for active processing
const activeJobs = new Map<string, {
  config: BatchJobConfig;
  processingCount: number;
  cancelled: boolean;
}>();

// Default concurrency limit
const DEFAULT_MAX_CONCURRENCY = 5;
const MAX_BATCH_SIZE = 500;

/**
 * Create a new batch job
 */
export async function createBatchJob(
  config: BatchJobConfig,
  files: BatchFileInput[]
): Promise<{ batchId: string; jobId: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  if (files.length === 0) {
    throw new Error("No files provided for batch processing");
  }

  if (files.length > MAX_BATCH_SIZE) {
    throw new Error(`Batch size exceeds maximum of ${MAX_BATCH_SIZE} files`);
  }

  const batchId = `batch_${nanoid(16)}`;

  // Create batch job
  const [result] = await db.insert(batchJobs).values({
    batchId,
    userId: config.userId,
    teamId: config.teamId,
    totalFiles: files.length,
    completedFiles: 0,
    failedFiles: 0,
    status: "queued",
  });

  const jobId = result.insertId;

  // Create batch job items
  const items: InsertBatchJobItem[] = files.map((file, index) => ({
    batchJobId: jobId,
    sourceFilename: file.filename,
    sourceFileKey: file.fileKey,
    sourceFileSize: file.fileSize,
    sourceMimeType: file.mimeType,
    status: "queued" as const,
    progress: 0,
    retryCount: 0,
    maxRetries: 3,
    itemIndex: index,
    priority: config.priority || 0,
  }));

  await db.insert(batchJobItems).values(items);

  // Store config in memory for processing
  activeJobs.set(batchId, {
    config,
    processingCount: 0,
    cancelled: false,
  });

  return { batchId, jobId };
}

/**
 * Start processing a batch job
 */
export async function startBatchProcessing(
  batchId: string,
  processFile: (item: BatchJobItem, config: BatchJobConfig) => Promise<{
    outputFilename: string;
    outputFileKey: string;
    outputFileUrl: string;
    outputFileSize: number;
  }>
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const job = activeJobs.get(batchId);
  if (!job) {
    throw new Error(`Batch job ${batchId} not found in active jobs`);
  }

  // Update job status to processing
  await db.update(batchJobs)
    .set({ status: "processing" })
    .where(eq(batchJobs.batchId, batchId));

  // Get all items for this batch
  const batchJob = await db.select().from(batchJobs).where(eq(batchJobs.batchId, batchId)).limit(1);
  if (batchJob.length === 0) {
    throw new Error(`Batch job ${batchId} not found`);
  }

  const items = await db.select()
    .from(batchJobItems)
    .where(eq(batchJobItems.batchJobId, batchJob[0].id))
    .orderBy(batchJobItems.priority, batchJobItems.itemIndex);

  const maxConcurrency = job.config.maxConcurrency || DEFAULT_MAX_CONCURRENCY;

  // Process items with concurrency control
  const processItem = async (item: typeof items[0]) => {
    if (job.cancelled) return;

    try {
      // Update item status to processing
      await db.update(batchJobItems)
        .set({ 
          status: "processing", 
          startedAt: new Date(),
          progress: 10 
        })
        .where(eq(batchJobItems.id, item.id));

      job.processingCount++;

      // Process the file
      const startTime = Date.now();
      const result = await processFile(item as BatchJobItem, job.config);
      const processingTimeMs = Date.now() - startTime;

      // Update item as completed
      await db.update(batchJobItems)
        .set({
          status: "completed",
          progress: 100,
          outputFilename: result.outputFilename,
          outputFileKey: result.outputFileKey,
          outputFileUrl: result.outputFileUrl,
          outputFileSize: result.outputFileSize,
          completedAt: new Date(),
          processingTimeMs,
        })
        .where(eq(batchJobItems.id, item.id));

      // Update batch job completed count
      await db.update(batchJobs)
        .set({ completedFiles: sql`${batchJobs.completedFiles} + 1` })
        .where(eq(batchJobs.batchId, batchId));

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      
      // Check if we should retry
      if (item.retryCount < item.maxRetries) {
        await db.update(batchJobItems)
          .set({
            status: "queued",
            progress: 0,
            retryCount: item.retryCount + 1,
            errorMessage,
          })
          .where(eq(batchJobItems.id, item.id));
      } else {
        // Mark as failed
        await db.update(batchJobItems)
          .set({
            status: "failed",
            progress: 0,
            errorMessage,
            completedAt: new Date(),
          })
          .where(eq(batchJobItems.id, item.id));

        // Update batch job failed count
        await db.update(batchJobs)
          .set({ failedFiles: sql`${batchJobs.failedFiles} + 1` })
          .where(eq(batchJobs.batchId, batchId));
      }
    } finally {
      job.processingCount--;
    }
  };

  // Process items with controlled concurrency
  const queue = [...items];
  const processing: Promise<void>[] = [];

  while (queue.length > 0 || processing.length > 0) {
    if (job.cancelled) break;

    // Start new items up to max concurrency
    while (queue.length > 0 && job.processingCount < maxConcurrency) {
      const item = queue.shift()!;
      processing.push(processItem(item));
    }

    // Wait for at least one to complete
    if (processing.length > 0) {
      await Promise.race(processing);
      // Remove completed promises
      const stillProcessing: Promise<void>[] = [];
      for (const p of processing) {
        const status = await Promise.race([p.then(() => "done"), Promise.resolve("pending")]);
        if (status === "pending") {
          stillProcessing.push(p);
        }
      }
      processing.length = 0;
      processing.push(...stillProcessing);
    }
  }

  // Wait for all remaining items
  await Promise.all(processing);

  // Update final job status
  const finalJob = await db.select().from(batchJobs).where(eq(batchJobs.batchId, batchId)).limit(1);
  if (finalJob.length > 0) {
    const status = job.cancelled 
      ? "cancelled" 
      : finalJob[0].failedFiles === finalJob[0].totalFiles 
        ? "failed" 
        : "completed";

    await db.update(batchJobs)
      .set({ 
        status,
        completedAt: new Date(),
      })
      .where(eq(batchJobs.batchId, batchId));
  }

  // Clean up
  activeJobs.delete(batchId);
}

/**
 * Get batch job progress
 */
export async function getBatchProgress(batchId: string): Promise<BatchJobProgress | null> {
  const db = await getDb();
  if (!db) return null;

  const job = await db.select().from(batchJobs).where(eq(batchJobs.batchId, batchId)).limit(1);
  if (job.length === 0) return null;

  const items = await db.select()
    .from(batchJobItems)
    .where(eq(batchJobItems.batchJobId, job[0].id))
    .orderBy(batchJobItems.itemIndex);

  const progressPercent = job[0].totalFiles > 0
    ? Math.round(((job[0].completedFiles + job[0].failedFiles) / job[0].totalFiles) * 100)
    : 0;

  // Calculate estimated time remaining based on average processing time
  const completedItems = items.filter(i => i.status === "completed" && i.processingTimeMs);
  let estimatedTimeRemaining: number | undefined;
  
  if (completedItems.length > 0) {
    const avgTime = completedItems.reduce((sum, i) => sum + (i.processingTimeMs || 0), 0) / completedItems.length;
    const remainingItems = job[0].totalFiles - job[0].completedFiles - job[0].failedFiles;
    estimatedTimeRemaining = Math.round((avgTime * remainingItems) / 1000); // in seconds
  }

  return {
    batchId: job[0].batchId,
    status: job[0].status as BatchJobStatus,
    totalFiles: job[0].totalFiles,
    completedFiles: job[0].completedFiles,
    failedFiles: job[0].failedFiles,
    progressPercent,
    estimatedTimeRemaining,
    startedAt: job[0].createdAt,
    completedAt: job[0].completedAt || undefined,
    items: items.map(item => ({
      itemId: item.id,
      filename: item.sourceFilename,
      status: item.status as BatchItemStatus,
      progress: item.progress,
      errorMessage: item.errorMessage || undefined,
      outputUrl: item.outputFileUrl || undefined,
      processingTimeMs: item.processingTimeMs || undefined,
    })),
  };
}

/**
 * Cancel a batch job
 */
export async function cancelBatchJob(batchId: string, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Verify ownership
  const job = await db.select().from(batchJobs)
    .where(and(eq(batchJobs.batchId, batchId), eq(batchJobs.userId, userId)))
    .limit(1);

  if (job.length === 0) return false;

  // Mark as cancelled in memory
  const activeJob = activeJobs.get(batchId);
  if (activeJob) {
    activeJob.cancelled = true;
  }

  // Update database
  await db.update(batchJobs)
    .set({ status: "cancelled", completedAt: new Date() })
    .where(eq(batchJobs.batchId, batchId));

  // Cancel all queued items
  await db.update(batchJobItems)
    .set({ status: "cancelled" })
    .where(and(
      eq(batchJobItems.batchJobId, job[0].id),
      eq(batchJobItems.status, "queued")
    ));

  return true;
}

/**
 * Retry failed items in a batch
 */
export async function retryFailedItems(batchId: string, userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  // Verify ownership
  const job = await db.select().from(batchJobs)
    .where(and(eq(batchJobs.batchId, batchId), eq(batchJobs.userId, userId)))
    .limit(1);

  if (job.length === 0) return 0;

  // Reset failed items to queued
  const result = await db.update(batchJobItems)
    .set({ 
      status: "queued", 
      progress: 0, 
      errorMessage: null,
      retryCount: 0,
    })
    .where(and(
      eq(batchJobItems.batchJobId, job[0].id),
      eq(batchJobItems.status, "failed")
    ));

  // Reset batch job status if it was completed/failed
  if (job[0].status === "completed" || job[0].status === "failed") {
    await db.update(batchJobs)
      .set({ 
        status: "queued",
        failedFiles: 0,
        completedAt: null,
      })
      .where(eq(batchJobs.batchId, batchId));
  }

  return result[0].affectedRows || 0;
}

/**
 * Get user's batch job history
 */
export async function getUserBatchJobs(
  userId: number,
  limit: number = 20,
  offset: number = 0
): Promise<BatchJob[]> {
  const db = await getDb();
  if (!db) return [];

  const jobs = await db.select()
    .from(batchJobs)
    .where(eq(batchJobs.userId, userId))
    .orderBy(sql`${batchJobs.createdAt} DESC`)
    .limit(limit)
    .offset(offset);

  return jobs;
}

/**
 * Delete a batch job and its items
 */
export async function deleteBatchJob(batchId: string, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Verify ownership
  const job = await db.select().from(batchJobs)
    .where(and(eq(batchJobs.batchId, batchId), eq(batchJobs.userId, userId)))
    .limit(1);

  if (job.length === 0) return false;

  // Delete items first
  await db.delete(batchJobItems).where(eq(batchJobItems.batchJobId, job[0].id));

  // Delete job
  await db.delete(batchJobs).where(eq(batchJobs.id, job[0].id));

  return true;
}

/**
 * Get batch job statistics for analytics
 */
export async function getBatchJobStats(userId: number, startDate: Date, endDate: Date) {
  const db = await getDb();
  if (!db) return null;

  const jobs = await db.select()
    .from(batchJobs)
    .where(and(
      eq(batchJobs.userId, userId),
      sql`${batchJobs.createdAt} >= ${startDate}`,
      sql`${batchJobs.createdAt} <= ${endDate}`
    ));

  const totalJobs = jobs.length;
  const completedJobs = jobs.filter(j => j.status === "completed").length;
  const failedJobs = jobs.filter(j => j.status === "failed").length;
  const totalFiles = jobs.reduce((sum, j) => sum + j.totalFiles, 0);
  const completedFiles = jobs.reduce((sum, j) => sum + j.completedFiles, 0);
  const failedFiles = jobs.reduce((sum, j) => sum + j.failedFiles, 0);

  return {
    totalJobs,
    completedJobs,
    failedJobs,
    successRate: totalJobs > 0 ? Math.round((completedJobs / totalJobs) * 100) : 0,
    totalFiles,
    completedFiles,
    failedFiles,
    fileSuccessRate: totalFiles > 0 ? Math.round((completedFiles / totalFiles) * 100) : 0,
  };
}
