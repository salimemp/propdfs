/**
 * Authentication Service
 * Handles social login, TOTP 2FA, and passkey authentication
 */

import { getDb } from "./db";
import { 
  socialLogins, 
  passkeys, 
  twoFactorBackupCodes, 
  users,
  voiceCommands,
  type InsertSocialLogin,
  type InsertPasskey,
  type InsertTwoFactorBackupCode,
  type InsertVoiceCommand,
} from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import * as crypto from 'crypto';

// ============================================
// Social Login Functions
// ============================================

export async function createSocialLogin(data: InsertSocialLogin) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(socialLogins).values(data);
  return result[0]?.insertId;
}

export async function getSocialLoginByProvider(userId: number, provider: 'google' | 'github') {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(socialLogins)
    .where(and(
      eq(socialLogins.userId, userId),
      eq(socialLogins.provider, provider)
    ))
    .limit(1);
  return result[0] || null;
}

export async function getSocialLoginByProviderUserId(provider: 'google' | 'github', providerUserId: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(socialLogins)
    .where(and(
      eq(socialLogins.provider, provider),
      eq(socialLogins.providerUserId, providerUserId)
    ))
    .limit(1);
  return result[0] || null;
}

export async function getUserSocialLogins(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(socialLogins)
    .where(eq(socialLogins.userId, userId));
}

export async function deleteSocialLogin(userId: number, provider: 'google' | 'github') {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(socialLogins)
    .where(and(
      eq(socialLogins.userId, userId),
      eq(socialLogins.provider, provider)
    ));
}

export async function updateSocialLoginTokens(
  userId: number, 
  provider: 'google' | 'github',
  accessToken: string,
  refreshToken?: string,
  expiresAt?: Date
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(socialLogins)
    .set({ accessToken, refreshToken, expiresAt })
    .where(and(
      eq(socialLogins.userId, userId),
      eq(socialLogins.provider, provider)
    ));
}

// ============================================
// TOTP 2FA Functions
// ============================================

export async function enableTwoFactor(userId: number, secret: string) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(users)
    .set({ twoFactorEnabled: true, twoFactorSecret: secret })
    .where(eq(users.id, userId));
}

export async function disableTwoFactor(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(users)
    .set({ twoFactorEnabled: false, twoFactorSecret: null })
    .where(eq(users.id, userId));
  
  // Delete backup codes
  await db
    .delete(twoFactorBackupCodes)
    .where(eq(twoFactorBackupCodes.userId, userId));
}

export async function getTwoFactorSecret(userId: number): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select({ secret: users.twoFactorSecret })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return result[0]?.secret || null;
}

export async function isTwoFactorEnabled(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const result = await db
    .select({ enabled: users.twoFactorEnabled })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return result[0]?.enabled || false;
}

// Backup codes
export async function createBackupCodes(userId: number, codes: string[]) {
  const db = await getDb();
  if (!db) return;
  
  // Delete existing codes
  await db
    .delete(twoFactorBackupCodes)
    .where(eq(twoFactorBackupCodes.userId, userId));
  
  // Hash and store new codes
  const hashedCodes = codes.map(code => ({
    userId,
    code: crypto.createHash('sha256').update(code.replace(/-/g, '').toUpperCase()).digest('hex'),
  }));
  
  if (hashedCodes.length > 0) {
    await db.insert(twoFactorBackupCodes).values(hashedCodes);
  }
}

export async function getBackupCodes(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(twoFactorBackupCodes)
    .where(eq(twoFactorBackupCodes.userId, userId));
}

export async function useBackupCode(userId: number, code: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  const hashedCode = crypto.createHash('sha256').update(code.replace(/-/g, '').toUpperCase()).digest('hex');
  
  const result = await db
    .select()
    .from(twoFactorBackupCodes)
    .where(and(
      eq(twoFactorBackupCodes.userId, userId),
      eq(twoFactorBackupCodes.code, hashedCode)
    ))
    .limit(1);
  
  if (result.length === 0 || result[0].usedAt) {
    return false;
  }
  
  // Mark as used
  await db
    .update(twoFactorBackupCodes)
    .set({ usedAt: new Date() })
    .where(eq(twoFactorBackupCodes.id, result[0].id));
  
  return true;
}

export async function countUnusedBackupCodes(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  
  const codes = await db
    .select()
    .from(twoFactorBackupCodes)
    .where(eq(twoFactorBackupCodes.userId, userId));
  
  return codes.filter((c: { usedAt: Date | null }) => !c.usedAt).length;
}

// ============================================
// Passkey/WebAuthn Functions
// ============================================

export async function createPasskey(data: InsertPasskey) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(passkeys).values(data);
  return result[0]?.insertId;
}

export async function getPasskeyByCredentialId(credentialId: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(passkeys)
    .where(eq(passkeys.credentialId, credentialId))
    .limit(1);
  return result[0] || null;
}

export async function getUserPasskeys(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(passkeys)
    .where(eq(passkeys.userId, userId));
}

export async function updatePasskeyCounter(credentialId: string, counter: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(passkeys)
    .set({ counter, lastUsedAt: new Date() })
    .where(eq(passkeys.credentialId, credentialId));
}

export async function deletePasskey(userId: number, credentialId: string) {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(passkeys)
    .where(and(
      eq(passkeys.userId, userId),
      eq(passkeys.credentialId, credentialId)
    ));
}

export async function updatePasskeyName(userId: number, credentialId: string, deviceName: string) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(passkeys)
    .set({ deviceName })
    .where(and(
      eq(passkeys.userId, userId),
      eq(passkeys.credentialId, credentialId)
    ));
}

export async function enablePasskeyAuth(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(users)
    .set({ passkeyEnabled: true })
    .where(eq(users.id, userId));
}

export async function disablePasskeyAuth(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(users)
    .set({ passkeyEnabled: false })
    .where(eq(users.id, userId));
}

export async function isPasskeyEnabled(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const result = await db
    .select({ enabled: users.passkeyEnabled })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return result[0]?.enabled || false;
}

// ============================================
// Voice Command Logging
// ============================================

export async function logVoiceCommand(data: InsertVoiceCommand) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(voiceCommands).values(data);
  return result[0]?.insertId;
}

export async function getUserVoiceCommands(userId: number, limit: number = 50) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(voiceCommands)
    .where(eq(voiceCommands.userId, userId))
    .orderBy(voiceCommands.createdAt)
    .limit(limit);
}

export async function getVoiceCommandStats(userId: number) {
  const db = await getDb();
  if (!db) return { total: 0, successful: 0, successRate: 0, byCommand: {} };
  
  const commands = await db
    .select()
    .from(voiceCommands)
    .where(eq(voiceCommands.userId, userId));
  
  const total = commands.length;
  const successful = commands.filter((c: { wasSuccessful: boolean }) => c.wasSuccessful).length;
  const successRate = total > 0 ? (successful / total) * 100 : 0;
  
  // Group by command type
  const byCommand: Record<string, number> = {};
  for (const cmd of commands) {
    if (cmd.command) {
      byCommand[cmd.command] = (byCommand[cmd.command] || 0) + 1;
    }
  }
  
  return {
    total,
    successful,
    successRate,
    byCommand,
  };
}
