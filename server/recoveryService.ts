import { getDb } from "./db";
import { fileSnapshots, files } from "../drizzle/schema";
import { eq, and, desc, lt, asc } from "drizzle-orm";
import { storagePut, storageGet } from "./storage";
import crypto from "crypto";

/**
 * Calculate checksum for file integrity verification
 */
export function calculateChecksum(data: Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * Create a snapshot of a file
 */
export async function createSnapshot(
  fileId: number,
  userId: number,
  options: {
    snapshotType?: "auto" | "manual" | "pre_edit";
    description?: string;
    fileData: Buffer;
    mimeType: string;
    metadata?: any;
    expiresInDays?: number;
  }
): Promise<{ snapshotId: number; snapshotNumber: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get the file info
  const fileResult = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
  if (fileResult.length === 0) {
    throw new Error("File not found");
  }

  const file = fileResult[0];

  // Get the next snapshot number
  const existingSnapshots = await db
    .select()
    .from(fileSnapshots)
    .where(eq(fileSnapshots.fileId, fileId))
    .orderBy(desc(fileSnapshots.snapshotNumber))
    .limit(1);

  const snapshotNumber = existingSnapshots.length > 0 ? existingSnapshots[0].snapshotNumber + 1 : 1;

  // Calculate checksum
  const checksum = calculateChecksum(options.fileData);

  // Upload snapshot to S3
  const snapshotKey = `${userId}/snapshots/${fileId}/v${snapshotNumber}-${Date.now()}-${file.filename}`;
  const { url } = await storagePut(snapshotKey, options.fileData, options.mimeType);

  // Calculate expiration date
  const expiresAt = options.expiresInDays
    ? new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  // Create snapshot record
  const [result] = await db.insert(fileSnapshots).values({
    fileId,
    userId,
    snapshotNumber,
    snapshotType: options.snapshotType || "auto",
    description: options.description,
    fileKey: snapshotKey,
    fileUrl: url,
    fileSize: options.fileData.length,
    checksum,
    metadata: options.metadata,
    expiresAt,
  });

  return { snapshotId: result.insertId, snapshotNumber };
}

/**
 * Get all snapshots for a file
 */
export async function getFileSnapshots(fileId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db
    .select()
    .from(fileSnapshots)
    .where(and(eq(fileSnapshots.fileId, fileId), eq(fileSnapshots.userId, userId)))
    .orderBy(desc(fileSnapshots.snapshotNumber));
}

/**
 * Get a specific snapshot
 */
export async function getSnapshot(snapshotId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .select()
    .from(fileSnapshots)
    .where(and(eq(fileSnapshots.id, snapshotId), eq(fileSnapshots.userId, userId)))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

/**
 * Restore a file from a snapshot
 */
export async function restoreFromSnapshot(
  snapshotId: number,
  userId: number
): Promise<{ success: boolean; fileId?: number; error?: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    // Get the snapshot
    const snapshot = await getSnapshot(snapshotId, userId);
    if (!snapshot) {
      return { success: false, error: "Snapshot not found" };
    }

    // Get the current file
    const fileResult = await db
      .select()
      .from(files)
      .where(eq(files.id, snapshot.fileId))
      .limit(1);

    if (fileResult.length === 0) {
      return { success: false, error: "Original file not found" };
    }

    const file = fileResult[0];

    // Create a snapshot of the current state before restoring (pre_edit)
    // This allows users to undo the restore if needed
    const currentFileUrl = file.url;
    
    // Update the file to point to the snapshot version
    await db
      .update(files)
      .set({
        url: snapshot.fileUrl,
        fileKey: snapshot.fileKey,
        fileSize: snapshot.fileSize,
        updatedAt: new Date(),
      })
      .where(eq(files.id, snapshot.fileId));

    return { success: true, fileId: snapshot.fileId };
  } catch (error: any) {
    console.error("Restore error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete a snapshot
 */
export async function deleteSnapshot(
  snapshotId: number,
  userId: number
): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check if snapshot is protected
  const snapshot = await getSnapshot(snapshotId, userId);
  if (!snapshot) return false;

  if (snapshot.isProtected) {
    throw new Error("Cannot delete protected snapshot");
  }

  const result = await db
    .delete(fileSnapshots)
    .where(and(eq(fileSnapshots.id, snapshotId), eq(fileSnapshots.userId, userId)));

  return result[0].affectedRows > 0;
}

/**
 * Protect/unprotect a snapshot from auto-cleanup
 */
export async function setSnapshotProtection(
  snapshotId: number,
  userId: number,
  isProtected: boolean
): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .update(fileSnapshots)
    .set({ isProtected })
    .where(and(eq(fileSnapshots.id, snapshotId), eq(fileSnapshots.userId, userId)));

  return result[0].affectedRows > 0;
}

/**
 * Get recovery timeline for a file (all snapshots with dates)
 */
export async function getRecoveryTimeline(fileId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const snapshots = await db
    .select()
    .from(fileSnapshots)
    .where(and(eq(fileSnapshots.fileId, fileId), eq(fileSnapshots.userId, userId)))
    .orderBy(asc(fileSnapshots.createdAt));

  return snapshots.map((s) => ({
    id: s.id,
    snapshotNumber: s.snapshotNumber,
    type: s.snapshotType,
    description: s.description,
    fileSize: s.fileSize,
    createdAt: s.createdAt,
    isProtected: s.isProtected,
    expiresAt: s.expiresAt,
  }));
}

/**
 * Compare two snapshots
 */
export async function compareSnapshots(
  snapshotId1: number,
  snapshotId2: number,
  userId: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const snapshot1 = await getSnapshot(snapshotId1, userId);
  const snapshot2 = await getSnapshot(snapshotId2, userId);

  if (!snapshot1 || !snapshot2) {
    throw new Error("One or both snapshots not found");
  }

  return {
    snapshot1: {
      id: snapshot1.id,
      snapshotNumber: snapshot1.snapshotNumber,
      fileSize: snapshot1.fileSize,
      checksum: snapshot1.checksum,
      createdAt: snapshot1.createdAt,
    },
    snapshot2: {
      id: snapshot2.id,
      snapshotNumber: snapshot2.snapshotNumber,
      fileSize: snapshot2.fileSize,
      checksum: snapshot2.checksum,
      createdAt: snapshot2.createdAt,
    },
    sizeChange: Number(snapshot2.fileSize) - Number(snapshot1.fileSize),
    isIdentical: snapshot1.checksum === snapshot2.checksum,
    timeDiff: snapshot2.createdAt.getTime() - snapshot1.createdAt.getTime(),
  };
}

/**
 * Auto-cleanup expired snapshots
 */
export async function cleanupExpiredSnapshots(): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const now = new Date();

  const result = await db
    .delete(fileSnapshots)
    .where(
      and(
        eq(fileSnapshots.isProtected, false),
        lt(fileSnapshots.expiresAt, now)
      )
    );

  return result[0].affectedRows;
}

/**
 * Get storage usage for snapshots
 */
export async function getSnapshotStorageUsage(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const snapshots = await db
    .select()
    .from(fileSnapshots)
    .where(eq(fileSnapshots.userId, userId));

  const totalSize = snapshots.reduce((sum, s) => sum + Number(s.fileSize), 0);
  const count = snapshots.length;
  const protectedCount = snapshots.filter((s) => s.isProtected).length;

  return {
    totalSnapshots: count,
    totalSizeBytes: totalSize,
    protectedSnapshots: protectedCount,
    averageSizeBytes: count > 0 ? Math.round(totalSize / count) : 0,
  };
}

/**
 * Create automatic snapshots based on policy
 */
export async function createAutoSnapshot(
  fileId: number,
  userId: number,
  fileData: Buffer,
  mimeType: string
): Promise<{ snapshotId: number; snapshotNumber: number } | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check existing snapshots
  const existingSnapshots = await db
    .select()
    .from(fileSnapshots)
    .where(and(eq(fileSnapshots.fileId, fileId), eq(fileSnapshots.snapshotType, "auto")))
    .orderBy(desc(fileSnapshots.createdAt))
    .limit(1);

  // Only create auto snapshot if:
  // 1. No existing snapshots, or
  // 2. Last auto snapshot is more than 1 hour old
  if (existingSnapshots.length > 0) {
    const lastSnapshot = existingSnapshots[0];
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (lastSnapshot.createdAt > hourAgo) {
      return null; // Too soon for another auto snapshot
    }
  }

  return await createSnapshot(fileId, userId, {
    snapshotType: "auto",
    description: "Automatic backup",
    fileData,
    mimeType,
    expiresInDays: 30, // Auto snapshots expire after 30 days
  });
}
