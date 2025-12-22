/**
 * TOTP (Time-based One-Time Password) Service
 * Implements RFC 6238 for 2FA with authenticator apps
 */

import * as crypto from 'crypto';

// TOTP configuration
const TOTP_DIGITS = 6;
const TOTP_PERIOD = 30; // seconds
const TOTP_ALGORITHM = 'sha1';
const BACKUP_CODE_LENGTH = 8;
const BACKUP_CODE_COUNT = 10;

/**
 * Generate a random base32 secret for TOTP
 */
export function generateTOTPSecret(): string {
  const buffer = crypto.randomBytes(20);
  return base32Encode(buffer);
}

/**
 * Generate TOTP code from secret
 */
export function generateTOTP(secret: string, timestamp?: number): string {
  const time = timestamp || Date.now();
  const counter = Math.floor(time / 1000 / TOTP_PERIOD);
  
  const secretBuffer = base32Decode(secret);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(counter));
  
  const hmac = crypto.createHmac(TOTP_ALGORITHM, secretBuffer);
  hmac.update(counterBuffer);
  const hash = hmac.digest();
  
  const offset = hash[hash.length - 1] & 0x0f;
  const binary = 
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);
  
  const otp = binary % Math.pow(10, TOTP_DIGITS);
  return otp.toString().padStart(TOTP_DIGITS, '0');
}

/**
 * Verify TOTP code with time window tolerance
 */
export function verifyTOTP(secret: string, code: string, windowSize: number = 1): boolean {
  const now = Date.now();
  
  // Check current time and adjacent windows
  for (let i = -windowSize; i <= windowSize; i++) {
    const timestamp = now + (i * TOTP_PERIOD * 1000);
    const expectedCode = generateTOTP(secret, timestamp);
    
    if (constantTimeCompare(code, expectedCode)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Generate otpauth:// URI for QR code
 */
export function generateOTPAuthURI(
  secret: string,
  accountName: string,
  issuer: string = 'ProPDFs'
): string {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedAccount = encodeURIComponent(accountName);
  
  return `otpauth://totp/${encodedIssuer}:${encodedAccount}?secret=${secret}&issuer=${encodedIssuer}&algorithm=${TOTP_ALGORITHM.toUpperCase()}&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD}`;
}

/**
 * Generate backup codes for account recovery
 */
export function generateBackupCodes(): string[] {
  const codes: string[] = [];
  
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const code = crypto.randomBytes(BACKUP_CODE_LENGTH / 2)
      .toString('hex')
      .toUpperCase();
    // Format as XXXX-XXXX for readability
    codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }
  
  return codes;
}

/**
 * Hash backup code for storage
 */
export function hashBackupCode(code: string): string {
  // Normalize the code (remove dashes, uppercase)
  const normalized = code.replace(/-/g, '').toUpperCase();
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Verify backup code
 */
export function verifyBackupCode(inputCode: string, hashedCode: string): boolean {
  const inputHash = hashBackupCode(inputCode);
  return constantTimeCompare(inputHash, hashedCode);
}

/**
 * Base32 encoding (RFC 4648)
 */
function base32Encode(buffer: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let result = '';
  let bits = 0;
  let value = 0;
  
  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i];
    value = (value << 8) | byte;
    bits += 8;
    
    while (bits >= 5) {
      bits -= 5;
      result += alphabet[(value >> bits) & 0x1f];
    }
  }
  
  if (bits > 0) {
    result += alphabet[(value << (5 - bits)) & 0x1f];
  }
  
  return result;
}

/**
 * Base32 decoding (RFC 4648)
 */
function base32Decode(encoded: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleanedInput = encoded.toUpperCase().replace(/[^A-Z2-7]/g, '');
  
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  
  for (const char of cleanedInput) {
    const index = alphabet.indexOf(char);
    if (index === -1) continue;
    
    value = (value << 5) | index;
    bits += 5;
    
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >> bits) & 0xff);
    }
  }
  
  return Buffer.from(bytes);
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  
  return result === 0;
}

/**
 * Generate QR code data URL for TOTP setup
 * Uses a simple SVG-based QR code generator
 */
export async function generateQRCodeDataURL(uri: string): Promise<string> {
  // For production, you'd use a library like 'qrcode'
  // Here we return a placeholder that can be used with a QR code library on the frontend
  return uri;
}

/**
 * TOTP setup result
 */
export interface TOTPSetupResult {
  secret: string;
  otpauthUri: string;
  backupCodes: string[];
}

/**
 * Complete TOTP setup for a user
 */
export function setupTOTP(email: string): TOTPSetupResult {
  const secret = generateTOTPSecret();
  const otpauthUri = generateOTPAuthURI(secret, email);
  const backupCodes = generateBackupCodes();
  
  return {
    secret,
    otpauthUri,
    backupCodes,
  };
}
