import { describe, it, expect, vi, beforeEach } from "vitest";
import * as passwordAuthService from "./passwordAuthService";

describe("Password Authentication Service", () => {
  describe("hashPassword", () => {
    it("should hash a password", async () => {
      const password = "testPassword123";
      const hash = await passwordAuthService.hashPassword(password);
      
      expect(hash).toBeDefined();
      expect(hash).toContain(":");
      expect(hash.length).toBeGreaterThan(50);
    });

    it("should generate different hashes for the same password", async () => {
      const password = "testPassword123";
      const hash1 = await passwordAuthService.hashPassword(password);
      const hash2 = await passwordAuthService.hashPassword(password);
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("verifyPassword", () => {
    it("should verify a correct password", async () => {
      const password = "testPassword123";
      const hash = await passwordAuthService.hashPassword(password);
      
      const isValid = await passwordAuthService.verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it("should reject an incorrect password", async () => {
      const password = "testPassword123";
      const hash = await passwordAuthService.hashPassword(password);
      
      const isValid = await passwordAuthService.verifyPassword("wrongPassword", hash);
      expect(isValid).toBe(false);
    });

    it("should handle invalid hash format", async () => {
      const isValid = await passwordAuthService.verifyPassword("test", "invalid-hash");
      expect(isValid).toBe(false);
    });
  });

  describe("generateToken", () => {
    it("should generate a token of default length", () => {
      const token = passwordAuthService.generateToken();
      expect(token).toBeDefined();
      expect(token.length).toBe(64); // 32 bytes = 64 hex chars
    });

    it("should generate a token of specified length", () => {
      const token = passwordAuthService.generateToken(16);
      expect(token.length).toBe(32); // 16 bytes = 32 hex chars
    });

    it("should generate unique tokens", () => {
      const token1 = passwordAuthService.generateToken();
      const token2 = passwordAuthService.generateToken();
      expect(token1).not.toBe(token2);
    });
  });
});
