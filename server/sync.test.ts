import { describe, it, expect } from "vitest";
import * as syncService from "./syncService";

describe("Sync Service", () => {
  describe("generateDeviceId", () => {
    it("should generate a unique device ID", () => {
      const id1 = syncService.generateDeviceId();
      const id2 = syncService.generateDeviceId();
      
      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
    });

    it("should generate a 64-character hex string", () => {
      const id = syncService.generateDeviceId();
      
      expect(id.length).toBe(64);
      expect(/^[a-f0-9]+$/.test(id)).toBe(true);
    });
  });
});
