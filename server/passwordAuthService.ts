import { getDb } from "./db";
import { users, userCredentials, magicLinks } from "../drizzle/schema";
import { eq, and, gt } from "drizzle-orm";
import crypto from "crypto";

/**
 * Hash a password using PBKDF2 (secure alternative to bcrypt)
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;
  const verifyHash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return hash === verifyHash;
}

/**
 * Generate a secure random token
 */
export function generateToken(length: number = 32): string {
  return crypto.randomBytes(length).toString("hex");
}

/**
 * Register a new user with email/password
 */
export async function registerWithEmail(
  email: string,
  password: string,
  name?: string
): Promise<{ success: boolean; userId?: number; error?: string; verificationToken?: string }> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    
    // Check if email already exists
    const existingUser = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existingUser.length > 0) {
      return { success: false, error: "Email already registered" };
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Generate verification token
    const verificationToken = generateToken();
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create user
    const openId = `email_${generateToken(16)}`;
    const [newUser] = await db.insert(users).values({
      openId,
      email,
      name: name || email.split("@")[0],
      loginMethod: "email",
    });

    const userId = newUser.insertId;

    // Create credentials
    await db.insert(userCredentials).values({
      userId,
      passwordHash,
      emailVerificationToken: verificationToken,
      emailVerificationExpires: verificationExpires,
    });

    return { success: true, userId, verificationToken };
  } catch (error: any) {
    console.error("Registration error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Verify email with token
 */
export async function verifyEmail(token: string): Promise<{ success: boolean; userId?: number; error?: string }> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    
    const credentials = await db
      .select()
      .from(userCredentials)
      .where(
        and(
          eq(userCredentials.emailVerificationToken, token),
          gt(userCredentials.emailVerificationExpires, new Date())
        )
      )
      .limit(1);

    if (credentials.length === 0) {
      return { success: false, error: "Invalid or expired verification token" };
    }

    const cred = credentials[0];

    // Mark email as verified
    await db
      .update(userCredentials)
      .set({
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null,
      })
      .where(eq(userCredentials.userId, cred.userId));

    return { success: true, userId: cred.userId };
  } catch (error: any) {
    console.error("Email verification error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Login with email/password
 */
export async function loginWithEmail(
  email: string,
  password: string
): Promise<{ success: boolean; user?: any; error?: string; requiresVerification?: boolean }> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    
    // Find user by email
    const userResult = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (userResult.length === 0) {
      return { success: false, error: "Invalid email or password" };
    }

    const user = userResult[0];

    // Get credentials
    const credResult = await db
      .select()
      .from(userCredentials)
      .where(eq(userCredentials.userId, user.id))
      .limit(1);

    if (credResult.length === 0) {
      return { success: false, error: "Invalid email or password" };
    }

    const cred = credResult[0];

    // Check if account is locked
    if (cred.lockedUntil && cred.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((cred.lockedUntil.getTime() - Date.now()) / 60000);
      return { success: false, error: `Account locked. Try again in ${minutesLeft} minutes.` };
    }

    // Verify password
    const isValid = await verifyPassword(password, cred.passwordHash);
    if (!isValid) {
      // Increment failed attempts
      const newAttempts = cred.failedLoginAttempts + 1;
      const updates: any = { failedLoginAttempts: newAttempts };

      // Lock account after 5 failed attempts
      if (newAttempts >= 5) {
        updates.lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
      }

      await db.update(userCredentials).set(updates).where(eq(userCredentials.userId, user.id));

      return { success: false, error: "Invalid email or password" };
    }

    // Check if email is verified
    if (!cred.emailVerified) {
      return { success: false, error: "Please verify your email first", requiresVerification: true };
    }

    // Reset failed attempts on successful login
    await db
      .update(userCredentials)
      .set({ failedLoginAttempts: 0, lockedUntil: null })
      .where(eq(userCredentials.userId, user.id));

    // Update last signed in
    await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));

    return { success: true, user };
  } catch (error: any) {
    console.error("Login error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Request password reset
 */
export async function requestPasswordReset(email: string): Promise<{ success: boolean; token?: string; error?: string }> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    
    const userResult = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (userResult.length === 0) {
      // Don't reveal if email exists
      return { success: true };
    }

    const user = userResult[0];
    const resetToken = generateToken();
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db
      .update(userCredentials)
      .set({
        passwordResetToken: resetToken,
        passwordResetExpires: resetExpires,
      })
      .where(eq(userCredentials.userId, user.id));

    return { success: true, token: resetToken };
  } catch (error: any) {
    console.error("Password reset request error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Reset password with token
 */
export async function resetPassword(
  token: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    
    const credentials = await db
      .select()
      .from(userCredentials)
      .where(
        and(
          eq(userCredentials.passwordResetToken, token),
          gt(userCredentials.passwordResetExpires, new Date())
        )
      )
      .limit(1);

    if (credentials.length === 0) {
      return { success: false, error: "Invalid or expired reset token" };
    }

    const cred = credentials[0];
    const passwordHash = await hashPassword(newPassword);

    await db
      .update(userCredentials)
      .set({
        passwordHash,
        passwordResetToken: null,
        passwordResetExpires: null,
        lastPasswordChange: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
      })
      .where(eq(userCredentials.userId, cred.userId));

    return { success: true };
  } catch (error: any) {
    console.error("Password reset error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Change password (for logged-in users)
 */
export async function changePassword(
  userId: number,
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    
    const credResult = await db
      .select()
      .from(userCredentials)
      .where(eq(userCredentials.userId, userId))
      .limit(1);

    if (credResult.length === 0) {
      return { success: false, error: "User not found" };
    }

    const cred = credResult[0];

    // Verify current password
    const isValid = await verifyPassword(currentPassword, cred.passwordHash);
    if (!isValid) {
      return { success: false, error: "Current password is incorrect" };
    }

    const passwordHash = await hashPassword(newPassword);

    await db
      .update(userCredentials)
      .set({
        passwordHash,
        lastPasswordChange: new Date(),
      })
      .where(eq(userCredentials.userId, userId));

    return { success: true };
  } catch (error: any) {
    console.error("Change password error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Create magic link for passwordless login
 */
export async function createMagicLink(
  email: string,
  ipAddress?: string,
  userAgent?: string
): Promise<{ success: boolean; token?: string; error?: string }> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await db.insert(magicLinks).values({
      email,
      token,
      expiresAt,
      ipAddress,
      userAgent,
    });

    return { success: true, token };
  } catch (error: any) {
    console.error("Magic link creation error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Verify magic link and login/register user
 */
export async function verifyMagicLink(token: string): Promise<{ success: boolean; user?: any; error?: string; isNewUser?: boolean }> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    
    // Find valid magic link
    const linkResult = await db
      .select()
      .from(magicLinks)
      .where(
        and(
          eq(magicLinks.token, token),
          gt(magicLinks.expiresAt, new Date())
        )
      )
      .limit(1);

    if (linkResult.length === 0) {
      return { success: false, error: "Invalid or expired magic link" };
    }

    const link = linkResult[0];

    // Check if already used
    if (link.usedAt) {
      return { success: false, error: "Magic link already used" };
    }

    // Mark as used
    await db
      .update(magicLinks)
      .set({ usedAt: new Date() })
      .where(eq(magicLinks.id, link.id));

    // Find or create user
    let userResult = await db.select().from(users).where(eq(users.email, link.email)).limit(1);
    let isNewUser = false;

    if (userResult.length === 0) {
      // Create new user
      const openId = `magic_${generateToken(16)}`;
      const [newUser] = await db.insert(users).values({
        openId,
        email: link.email,
        name: link.email.split("@")[0],
        loginMethod: "magic_link",
      });

      userResult = await db.select().from(users).where(eq(users.id, newUser.insertId)).limit(1);
      isNewUser = true;
    }

    const user = userResult[0];

    // Update last signed in
    await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));

    return { success: true, user, isNewUser };
  } catch (error: any) {
    console.error("Magic link verification error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Resend verification email
 */
export async function resendVerificationEmail(email: string): Promise<{ success: boolean; token?: string; error?: string }> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    
    const userResult = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (userResult.length === 0) {
      return { success: false, error: "User not found" };
    }

    const user = userResult[0];

    const credResult = await db
      .select()
      .from(userCredentials)
      .where(eq(userCredentials.userId, user.id))
      .limit(1);

    if (credResult.length === 0) {
      return { success: false, error: "User not found" };
    }

    const cred = credResult[0];

    if (cred.emailVerified) {
      return { success: false, error: "Email already verified" };
    }

    const verificationToken = generateToken();
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await db
      .update(userCredentials)
      .set({
        emailVerificationToken: verificationToken,
        emailVerificationExpires: verificationExpires,
      })
      .where(eq(userCredentials.userId, user.id));

    return { success: true, token: verificationToken };
  } catch (error: any) {
    console.error("Resend verification error:", error);
    return { success: false, error: error.message };
  }
}
