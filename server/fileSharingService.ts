import { nanoid } from "nanoid";
import { eq, and, desc, isNull, or, gt } from "drizzle-orm";
import { getDb } from "./db";
import { 
  fileShares, 
  fileShareRecipients, 
  fileShareAccessLogs,
  files,
  users,
  InsertFileShare,
  InsertFileShareRecipient,
  InsertFileShareAccessLog
} from "../drizzle/schema";
import { sendFileShareEmail } from "./emailService";
import bcrypt from "bcrypt";

// ==================== SHARE CREATION ====================

export interface CreateShareOptions {
  fileId: number;
  ownerId: number;
  shareType: "link" | "email" | "team";
  permission: "view" | "download" | "edit" | "comment";
  isPublic?: boolean;
  password?: string;
  expiresAt?: Date;
  maxDownloads?: number;
  maxViews?: number;
  notifyOnAccess?: boolean;
  customMessage?: string;
}

export async function createShare(options: CreateShareOptions): Promise<{
  success: boolean;
  shareId?: number;
  shareToken?: string;
  shareUrl?: string;
  error?: string;
}> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  try {
    // Verify file exists and user owns it
    const file = await db.select()
      .from(files)
      .where(and(eq(files.id, options.fileId), eq(files.userId, options.ownerId)))
      .limit(1);

    if (file.length === 0) {
      return { success: false, error: "File not found or access denied" };
    }

    // Generate share token
    const shareToken = nanoid(32);

    // Hash password if provided
    let passwordHash: string | null = null;
    if (options.password) {
      passwordHash = await bcrypt.hash(options.password, 10);
    }

    // Create share record
    const result = await db.insert(fileShares).values({
      fileId: options.fileId,
      ownerId: options.ownerId,
      shareToken,
      shareType: options.shareType,
      permission: options.permission,
      isPublic: options.isPublic ?? true,
      requiresPassword: !!options.password,
      passwordHash,
      expiresAt: options.expiresAt,
      maxDownloads: options.maxDownloads,
      maxViews: options.maxViews,
      notifyOnAccess: options.notifyOnAccess ?? false,
      customMessage: options.customMessage,
    });

    const shareId = result[0].insertId;
    const shareUrl = `${process.env.VITE_APP_URL || "https://propdfs.com"}/share/${shareToken}`;

    return {
      success: true,
      shareId,
      shareToken,
      shareUrl,
    };
  } catch (error) {
    console.error("Error creating share:", error);
    return { success: false, error: "Failed to create share" };
  }
}

// ==================== EMAIL SHARING ====================

export interface ShareWithEmailOptions extends CreateShareOptions {
  recipientEmails: string[];
  senderName: string;
  baseUrl: string;
}

export async function shareWithEmails(options: ShareWithEmailOptions): Promise<{
  success: boolean;
  shareId?: number;
  shareUrl?: string;
  sentTo?: string[];
  failedEmails?: string[];
  error?: string;
}> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  try {
    // Create the share first
    const shareResult = await createShare({
      ...options,
      shareType: "email",
      isPublic: false,
    });

    if (!shareResult.success || !shareResult.shareId) {
      return { success: false, error: shareResult.error };
    }

    // Get file info
    const file = await db.select()
      .from(files)
      .where(eq(files.id, options.fileId))
      .limit(1);

    if (file.length === 0) {
      return { success: false, error: "File not found" };
    }

    const sentTo: string[] = [];
    const failedEmails: string[] = [];

    // Add recipients and send emails
    for (const email of options.recipientEmails) {
      try {
        // Add recipient record
        await db.insert(fileShareRecipients).values({
          shareId: shareResult.shareId,
          recipientEmail: email,
          invitationSentAt: new Date(),
        });

        // Send email
        const emailResult = await sendFileShareEmail(
          email,
          options.senderName,
          file[0].filename,
          shareResult.shareToken!,
          options.baseUrl,
          options.customMessage
        );

        if (emailResult.success) {
          sentTo.push(email);
        } else {
          failedEmails.push(email);
        }
      } catch (error) {
        console.error(`Error sending share email to ${email}:`, error);
        failedEmails.push(email);
      }
    }

    return {
      success: true,
      shareId: shareResult.shareId,
      shareUrl: shareResult.shareUrl,
      sentTo,
      failedEmails: failedEmails.length > 0 ? failedEmails : undefined,
    };
  } catch (error) {
    console.error("Error sharing with emails:", error);
    return { success: false, error: "Failed to share file" };
  }
}

// ==================== SHARE ACCESS ====================

export interface AccessShareOptions {
  shareToken: string;
  password?: string;
  accessorUserId?: number;
  accessorEmail?: string;
  accessorIp?: string;
  accessorUserAgent?: string;
}

export async function accessShare(options: AccessShareOptions): Promise<{
  success: boolean;
  file?: {
    id: number;
    name: string;
    url: string;
    mimeType: string;
    size: number;
  };
  permission?: string;
  error?: string;
  requiresPassword?: boolean;
}> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  try {
    // Find the share
    const share = await db.select()
      .from(fileShares)
      .where(and(
        eq(fileShares.shareToken, options.shareToken),
        eq(fileShares.isActive, true)
      ))
      .limit(1);

    if (share.length === 0) {
      return { success: false, error: "Share not found or has been revoked" };
    }

    const shareRecord = share[0];

    // Check expiration
    if (shareRecord.expiresAt && new Date(shareRecord.expiresAt) < new Date()) {
      return { success: false, error: "This share link has expired" };
    }

    // Check view limit
    if (shareRecord.maxViews && shareRecord.viewCount >= shareRecord.maxViews) {
      return { success: false, error: "This share link has reached its view limit" };
    }

    // Check password
    if (shareRecord.requiresPassword) {
      if (!options.password) {
        return { success: false, requiresPassword: true, error: "Password required" };
      }
      
      const passwordValid = await bcrypt.compare(options.password, shareRecord.passwordHash || "");
      if (!passwordValid) {
        return { success: false, requiresPassword: true, error: "Invalid password" };
      }
    }

    // Check if non-public share requires specific recipient
    if (!shareRecord.isPublic && shareRecord.shareType === "email") {
      const recipient = await db.select()
        .from(fileShareRecipients)
        .where(and(
          eq(fileShareRecipients.shareId, shareRecord.id),
          or(
            options.accessorEmail ? eq(fileShareRecipients.recipientEmail, options.accessorEmail) : undefined,
            options.accessorUserId ? eq(fileShareRecipients.recipientUserId, options.accessorUserId) : undefined
          )
        ))
        .limit(1);

      if (recipient.length === 0 && !options.accessorUserId) {
        return { success: false, error: "You don't have access to this file" };
      }
    }

    // Get file info
    const file = await db.select()
      .from(files)
      .where(eq(files.id, shareRecord.fileId))
      .limit(1);

    if (file.length === 0) {
      return { success: false, error: "File no longer exists" };
    }

    // Log access
    await db.insert(fileShareAccessLogs).values({
      shareId: shareRecord.id,
      accessType: "view",
      accessorUserId: options.accessorUserId,
      accessorEmail: options.accessorEmail,
      accessorIp: options.accessorIp,
      accessorUserAgent: options.accessorUserAgent,
    });

    // Update view count
    await db.update(fileShares)
      .set({ viewCount: shareRecord.viewCount + 1 })
      .where(eq(fileShares.id, shareRecord.id));

    // Update recipient access if applicable
    if (options.accessorEmail) {
      await db.update(fileShareRecipients)
        .set({ 
          lastAccessedAt: new Date(),
          accessCount: shareRecord.viewCount + 1,
        })
        .where(and(
          eq(fileShareRecipients.shareId, shareRecord.id),
          eq(fileShareRecipients.recipientEmail, options.accessorEmail)
        ));
    }

    return {
      success: true,
      file: {
        id: file[0].id,
        name: file[0].filename,
        url: file[0].url,
        mimeType: file[0].mimeType,
        size: file[0].fileSize,
      },
      permission: shareRecord.permission,
    };
  } catch (error) {
    console.error("Error accessing share:", error);
    return { success: false, error: "Failed to access share" };
  }
}

// ==================== DOWNLOAD TRACKING ====================

export async function trackDownload(shareToken: string, accessorInfo: {
  userId?: number;
  email?: string;
  ip?: string;
  userAgent?: string;
}): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  try {
    const share = await db.select()
      .from(fileShares)
      .where(eq(fileShares.shareToken, shareToken))
      .limit(1);

    if (share.length === 0) {
      return { success: false, error: "Share not found" };
    }

    const shareRecord = share[0];

    // Check download limit
    if (shareRecord.maxDownloads && shareRecord.downloadCount >= shareRecord.maxDownloads) {
      return { success: false, error: "Download limit reached" };
    }

    // Log download
    await db.insert(fileShareAccessLogs).values({
      shareId: shareRecord.id,
      accessType: "download",
      accessorUserId: accessorInfo.userId,
      accessorEmail: accessorInfo.email,
      accessorIp: accessorInfo.ip,
      accessorUserAgent: accessorInfo.userAgent,
    });

    // Update download count
    await db.update(fileShares)
      .set({ downloadCount: shareRecord.downloadCount + 1 })
      .where(eq(fileShares.id, shareRecord.id));

    return { success: true };
  } catch (error) {
    console.error("Error tracking download:", error);
    return { success: false, error: "Failed to track download" };
  }
}

// ==================== SHARE MANAGEMENT ====================

export async function getUserShares(userId: number): Promise<{
  success: boolean;
  shares?: Array<{
    id: number;
    fileId: number;
    fileName: string;
    shareToken: string;
    shareType: string;
    permission: string;
    isPublic: boolean;
    expiresAt: Date | null;
    viewCount: number;
    downloadCount: number;
    isActive: boolean;
    createdAt: Date;
    recipientCount?: number;
  }>;
  error?: string;
}> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  try {
    const shares = await db.select({
      id: fileShares.id,
      fileId: fileShares.fileId,
      fileName: files.filename,
      shareToken: fileShares.shareToken,
      shareType: fileShares.shareType,
      permission: fileShares.permission,
      isPublic: fileShares.isPublic,
      expiresAt: fileShares.expiresAt,
      viewCount: fileShares.viewCount,
      downloadCount: fileShares.downloadCount,
      isActive: fileShares.isActive,
      createdAt: fileShares.createdAt,
    })
      .from(fileShares)
      .innerJoin(files, eq(fileShares.fileId, files.id))
      .where(eq(fileShares.ownerId, userId))
      .orderBy(desc(fileShares.createdAt));

    return { success: true, shares };
  } catch (error) {
    console.error("Error getting user shares:", error);
    return { success: false, error: "Failed to get shares" };
  }
}

export async function revokeShare(shareId: number, userId: number, reason?: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  try {
    const share = await db.select()
      .from(fileShares)
      .where(and(eq(fileShares.id, shareId), eq(fileShares.ownerId, userId)))
      .limit(1);

    if (share.length === 0) {
      return { success: false, error: "Share not found or access denied" };
    }

    await db.update(fileShares)
      .set({
        isActive: false,
        revokedAt: new Date(),
        revokedReason: reason,
      })
      .where(eq(fileShares.id, shareId));

    return { success: true };
  } catch (error) {
    console.error("Error revoking share:", error);
    return { success: false, error: "Failed to revoke share" };
  }
}

export async function updateShare(shareId: number, userId: number, updates: {
  permission?: "view" | "download" | "edit" | "comment";
  expiresAt?: Date | null;
  maxDownloads?: number | null;
  maxViews?: number | null;
  password?: string | null;
  notifyOnAccess?: boolean;
}): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  try {
    const share = await db.select()
      .from(fileShares)
      .where(and(eq(fileShares.id, shareId), eq(fileShares.ownerId, userId)))
      .limit(1);

    if (share.length === 0) {
      return { success: false, error: "Share not found or access denied" };
    }

    const updateData: Partial<InsertFileShare> = {};

    if (updates.permission !== undefined) updateData.permission = updates.permission;
    if (updates.expiresAt !== undefined) updateData.expiresAt = updates.expiresAt;
    if (updates.maxDownloads !== undefined) updateData.maxDownloads = updates.maxDownloads;
    if (updates.maxViews !== undefined) updateData.maxViews = updates.maxViews;
    if (updates.notifyOnAccess !== undefined) updateData.notifyOnAccess = updates.notifyOnAccess;

    if (updates.password !== undefined) {
      if (updates.password === null) {
        updateData.requiresPassword = false;
        updateData.passwordHash = null;
      } else {
        updateData.requiresPassword = true;
        updateData.passwordHash = await bcrypt.hash(updates.password, 10);
      }
    }

    await db.update(fileShares)
      .set(updateData)
      .where(eq(fileShares.id, shareId));

    return { success: true };
  } catch (error) {
    console.error("Error updating share:", error);
    return { success: false, error: "Failed to update share" };
  }
}

// ==================== SHARE ANALYTICS ====================

export async function getShareAnalytics(shareId: number, userId: number): Promise<{
  success: boolean;
  analytics?: {
    totalViews: number;
    totalDownloads: number;
    uniqueViewers: number;
    recentAccess: Array<{
      accessType: string;
      accessorEmail: string | null;
      accessorIp: string | null;
      createdAt: Date;
    }>;
    accessByDay: Array<{
      date: string;
      views: number;
      downloads: number;
    }>;
  };
  error?: string;
}> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  try {
    // Verify ownership
    const share = await db.select()
      .from(fileShares)
      .where(and(eq(fileShares.id, shareId), eq(fileShares.ownerId, userId)))
      .limit(1);

    if (share.length === 0) {
      return { success: false, error: "Share not found or access denied" };
    }

    // Get access logs
    const accessLogs = await db.select()
      .from(fileShareAccessLogs)
      .where(eq(fileShareAccessLogs.shareId, shareId))
      .orderBy(desc(fileShareAccessLogs.createdAt))
      .limit(100);

    // Calculate analytics
    const totalViews = accessLogs.filter(l => l.accessType === "view").length;
    const totalDownloads = accessLogs.filter(l => l.accessType === "download").length;
    
    const uniqueIps = new Set(accessLogs.map(l => l.accessorIp).filter(Boolean));
    const uniqueViewers = uniqueIps.size;

    const recentAccess = accessLogs.slice(0, 10).map(l => ({
      accessType: l.accessType,
      accessorEmail: l.accessorEmail,
      accessorIp: l.accessorIp,
      createdAt: l.createdAt,
    }));

    // Group by day
    const accessByDayMap = new Map<string, { views: number; downloads: number }>();
    for (const log of accessLogs) {
      const date = log.createdAt.toISOString().split("T")[0];
      const existing = accessByDayMap.get(date) || { views: 0, downloads: 0 };
      if (log.accessType === "view") existing.views++;
      if (log.accessType === "download") existing.downloads++;
      accessByDayMap.set(date, existing);
    }

    const accessByDay = Array.from(accessByDayMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      success: true,
      analytics: {
        totalViews,
        totalDownloads,
        uniqueViewers,
        recentAccess,
        accessByDay,
      },
    };
  } catch (error) {
    console.error("Error getting share analytics:", error);
    return { success: false, error: "Failed to get analytics" };
  }
}
