import { describe, it, expect } from "vitest";
import * as totpService from "../app/services/totp-service";

describe("TOTP Service", () => {
  describe("generateSecret", () => {
    it("should generate a base32 secret", () => {
      const setup = totpService.setupTOTP("test@example.com");
      expect(setup.secret).toBeDefined();
      expect(setup.secret.length).toBeGreaterThan(0);
      // Base32 characters only
      expect(setup.secret).toMatch(/^[A-Z2-7]+$/);
    });

    it("should generate unique secrets", () => {
      const setup1 = totpService.setupTOTP("test1@example.com");
      const setup2 = totpService.setupTOTP("test2@example.com");
      expect(setup1.secret).not.toBe(setup2.secret);
    });
  });

  describe("generateTOTP", () => {
    it("should generate a 6-digit code", () => {
      const setup = totpService.setupTOTP("test@example.com");
      const code = totpService.generateTOTP(setup.secret);
      expect(code).toBeDefined();
      expect(code.length).toBe(6);
      expect(code).toMatch(/^\d{6}$/);
    });

    it("should generate consistent codes for the same time window", () => {
      const setup = totpService.setupTOTP("test@example.com");
      const code1 = totpService.generateTOTP(setup.secret);
      const code2 = totpService.generateTOTP(setup.secret);
      expect(code1).toBe(code2);
    });
  });

  describe("verifyTOTP", () => {
    it("should verify a valid TOTP code", () => {
      const setup = totpService.setupTOTP("test@example.com");
      const code = totpService.generateTOTP(setup.secret);
      const isValid = totpService.verifyTOTP(setup.secret, code);
      expect(isValid).toBe(true);
    });

    it("should reject an invalid TOTP code", () => {
      const setup = totpService.setupTOTP("test@example.com");
      // Test with a clearly wrong code
      const isValid = totpService.verifyTOTP(setup.secret, "invalid");
      expect(isValid).toBe(false);
    });

    it("should handle window tolerance", () => {
      const setup = totpService.setupTOTP("test@example.com");
      const code = totpService.generateTOTP(setup.secret);
      // With default window of 1, should accept current code
      const isValid = totpService.verifyTOTP(setup.secret, code, 1);
      expect(isValid).toBe(true);
    });
  });

  describe("generateBackupCodes", () => {
    it("should generate 10 backup codes by default", () => {
      const codes = totpService.generateBackupCodes();
      expect(codes).toHaveLength(10);
    });

    it("should generate default number of codes", () => {
      const codes = totpService.generateBackupCodes();
      expect(codes).toHaveLength(10);
    });

    it("should generate codes in correct format (XXXX-XXXX)", () => {
      const codes = totpService.generateBackupCodes();
      for (const code of codes) {
        expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      }
    });

    it("should generate unique codes", () => {
      const codes = totpService.generateBackupCodes(10);
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(10);
    });
  });

  describe("setupTOTP", () => {
    it("should return secret, URI, and backup codes", () => {
      const setup = totpService.setupTOTP("test@example.com");
      expect(setup.secret).toBeDefined();
      expect(setup.otpauthUri).toBeDefined();
      expect(setup.backupCodes).toBeDefined();
      expect(setup.backupCodes).toHaveLength(10);
    });

    it("should generate valid otpauth URI", () => {
      const setup = totpService.setupTOTP("test@example.com");
      expect(setup.otpauthUri).toContain("otpauth://totp/");
      expect(setup.otpauthUri).toContain("ProPDFs");
      expect(setup.otpauthUri).toContain("secret=");
    });
  });
});
