import { getDb } from "./db";
import { userDevices, syncQueue, files, folders, annotations } from "../drizzle/schema";
import { eq, and, desc, lt, inArray } from "drizzle-orm";
import crypto from "crypto";

/**
 * Generate a unique device ID
 */
export function generateDeviceId(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Register a new device for sync
 */
export async function registerDevice(
  userId: number,
  deviceInfo: {
    deviceId?: string;
    deviceName?: string;
    deviceType?: "desktop" | "laptop" | "tablet" | "mobile" | "other";
    browser?: string;
    os?: string;
    ipAddress?: string;
  }
): Promise<{ deviceId: string; isNew: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const deviceId = deviceInfo.deviceId || generateDeviceId();

  // Check if device already exists
  const existing = await db
    .select()
    .from(userDevices)
    .where(and(eq(userDevices.userId, userId), eq(userDevices.deviceId, deviceId)))
    .limit(1);

  if (existing.length > 0) {
    // Update last active
    await db
      .update(userDevices)
      .set({
        lastActiveAt: new Date(),
        ipAddress: deviceInfo.ipAddress,
      })
      .where(eq(userDevices.id, existing[0].id));

    return { deviceId, isNew: false };
  }

  // Register new device
  await db.insert(userDevices).values({
    userId,
    deviceId,
    deviceName: deviceInfo.deviceName || "Unknown Device",
    deviceType: deviceInfo.deviceType || "other",
    browser: deviceInfo.browser,
    os: deviceInfo.os,
    ipAddress: deviceInfo.ipAddress,
  });

  return { deviceId, isNew: true };
}

/**
 * Get all devices for a user
 */
export async function getUserDevices(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db
    .select()
    .from(userDevices)
    .where(eq(userDevices.userId, userId))
    .orderBy(desc(userDevices.lastActiveAt));
}

/**
 * Update device info
 */
export async function updateDevice(
  userId: number,
  deviceId: string,
  updates: {
    deviceName?: string;
    syncEnabled?: boolean;
    pushEnabled?: boolean;
    pushToken?: string;
  }
): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .update(userDevices)
    .set(updates)
    .where(and(eq(userDevices.userId, userId), eq(userDevices.deviceId, deviceId)));

  return result[0].affectedRows > 0;
}

/**
 * Remove a device
 */
export async function removeDevice(userId: number, deviceId: string): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .delete(userDevices)
    .where(and(eq(userDevices.userId, userId), eq(userDevices.deviceId, deviceId)));

  return result[0].affectedRows > 0;
}

/**
 * Queue a sync change
 */
export async function queueSyncChange(
  userId: number,
  deviceId: string,
  change: {
    entityType: "file" | "folder" | "annotation" | "setting";
    entityId: number;
    action: "create" | "update" | "delete";
    changeData?: any;
  }
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(syncQueue).values({
    userId,
    deviceId,
    entityType: change.entityType,
    entityId: change.entityId,
    action: change.action,
    changeData: change.changeData,
  });

  return result.insertId;
}

/**
 * Get pending sync changes for a device
 */
export async function getPendingSyncChanges(
  userId: number,
  deviceId: string,
  lastSyncTime?: Date
): Promise<any[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get changes from other devices since last sync
  let query = db
    .select()
    .from(syncQueue)
    .where(
      and(
        eq(syncQueue.userId, userId),
        eq(syncQueue.status, "pending")
      )
    );

  const changes = await query.orderBy(syncQueue.createdAt);

  // Filter out changes from the requesting device
  return changes.filter((c) => c.deviceId !== deviceId);
}

/**
 * Mark changes as synced
 */
export async function markChangesSynced(
  userId: number,
  deviceId: string,
  changeIds: number[]
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  if (changeIds.length === 0) return;

  await db
    .update(syncQueue)
    .set({
      status: "synced",
      syncedAt: new Date(),
    })
    .where(and(eq(syncQueue.userId, userId), inArray(syncQueue.id, changeIds)));

  // Update device last sync time
  await db
    .update(userDevices)
    .set({ lastSyncAt: new Date() })
    .where(and(eq(userDevices.userId, userId), eq(userDevices.deviceId, deviceId)));
}

/**
 * Resolve sync conflict
 */
export async function resolveConflict(
  changeId: number,
  resolution: "local_wins" | "remote_wins" | "manual"
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(syncQueue)
    .set({
      status: "synced",
      conflictResolution: resolution,
      syncedAt: new Date(),
    })
    .where(eq(syncQueue.id, changeId));
}

/**
 * Get sync status for a user
 */
export async function getSyncStatus(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const devices = await db
    .select()
    .from(userDevices)
    .where(eq(userDevices.userId, userId));

  const pendingChanges = await db
    .select()
    .from(syncQueue)
    .where(and(eq(syncQueue.userId, userId), eq(syncQueue.status, "pending")));

  const conflicts = await db
    .select()
    .from(syncQueue)
    .where(and(eq(syncQueue.userId, userId), eq(syncQueue.status, "conflict")));

  return {
    deviceCount: devices.length,
    pendingChanges: pendingChanges.length,
    conflicts: conflicts.length,
    lastSync: devices.reduce((latest, d) => {
      if (!d.lastSyncAt) return latest;
      if (!latest) return d.lastSyncAt;
      return d.lastSyncAt > latest ? d.lastSyncAt : latest;
    }, null as Date | null),
  };
}

/**
 * Clean up old synced changes (older than 30 days)
 */
export async function cleanupOldSyncChanges(): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const result = await db
    .delete(syncQueue)
    .where(
      and(
        eq(syncQueue.status, "synced"),
        lt(syncQueue.syncedAt, thirtyDaysAgo)
      )
    );

  return result[0].affectedRows;
}

/**
 * Full sync - get all user data for initial device setup
 */
export async function getFullSyncData(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const userFiles = await db
    .select()
    .from(files)
    .where(eq(files.userId, userId));

  const userFolders = await db
    .select()
    .from(folders)
    .where(eq(folders.userId, userId));

  const userAnnotations = await db
    .select()
    .from(annotations)
    .where(eq(annotations.userId, userId));

  return {
    files: userFiles,
    folders: userFolders,
    annotations: userAnnotations,
    syncedAt: new Date(),
  };
}
