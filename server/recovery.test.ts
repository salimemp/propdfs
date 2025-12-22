import { describe, it, expect } from "vitest";
import * as recoveryService from "./recoveryService";

describe("Recovery Service", () => {
  describe("calculateChecksum", () => {
    it("should calculate SHA-256 checksum", () => {
      const data = Buffer.from("Hello, World!");
      const checksum = recoveryService.calculateChecksum(data);
      
      expect(checksum).toBeDefined();
      expect(checksum.length).toBe(64); // SHA-256 = 64 hex chars
    });

    it("should return same checksum for same data", () => {
      const data = Buffer.from("Test data");
      const checksum1 = recoveryService.calculateChecksum(data);
      const checksum2 = recoveryService.calculateChecksum(data);
      
      expect(checksum1).toBe(checksum2);
    });

    it("should return different checksums for different data", () => {
      const data1 = Buffer.from("Data 1");
      const data2 = Buffer.from("Data 2");
      const checksum1 = recoveryService.calculateChecksum(data1);
      const checksum2 = recoveryService.calculateChecksum(data2);
      
      expect(checksum1).not.toBe(checksum2);
    });

    it("should handle empty buffer", () => {
      const data = Buffer.from("");
      const checksum = recoveryService.calculateChecksum(data);
      
      expect(checksum).toBeDefined();
      expect(checksum.length).toBe(64);
    });

    it("should handle large data", () => {
      const data = Buffer.alloc(1024 * 1024); // 1MB
      const checksum = recoveryService.calculateChecksum(data);
      
      expect(checksum).toBeDefined();
      expect(checksum.length).toBe(64);
    });
  });
});
