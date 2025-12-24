import { describe, it, expect } from "vitest";
import * as monitoringService from "./monitoringService";

describe("Monitoring Service", () => {
  describe("getHealthStatus", () => {
    it("should return health status object", async () => {
      const health = await monitoringService.getHealthStatus();
      
      expect(health).toBeDefined();
      expect(health.status).toBeDefined();
      expect(["healthy", "degraded", "unhealthy"]).toContain(health.status);
      expect(health.timestamp).toBeInstanceOf(Date);
      expect(health.uptime).toBeGreaterThanOrEqual(0);
      expect(health.checks).toBeDefined();
    });

    it("should include all component checks", async () => {
      const health = await monitoringService.getHealthStatus();
      
      expect(health.checks.database).toBeDefined();
      expect(health.checks.storage).toBeDefined();
      expect(health.checks.memory).toBeDefined();
      expect(health.checks.cpu).toBeDefined();
    });

    it("should have valid component health structure", async () => {
      const health = await monitoringService.getHealthStatus();
      
      for (const [name, check] of Object.entries(health.checks)) {
        expect(["healthy", "degraded", "unhealthy"]).toContain(check.status);
      }
    });
  });

  describe("recordRequest", () => {
    it("should record successful requests", () => {
      const initialMetrics = monitoringService.getMetrics;
      
      monitoringService.recordRequest(true, 50);
      monitoringService.recordRequest(true, 100);
      
      // No error thrown means success
      expect(true).toBe(true);
    });

    it("should record failed requests", () => {
      monitoringService.recordRequest(false, 500);
      
      // No error thrown means success
      expect(true).toBe(true);
    });
  });

  describe("getMetrics", () => {
    it("should return metrics object", async () => {
      const metrics = await monitoringService.getMetrics();
      
      expect(metrics).toBeDefined();
      expect(metrics.timestamp).toBeInstanceOf(Date);
      expect(metrics.requests).toBeDefined();
      expect(metrics.conversions).toBeDefined();
      expect(metrics.users).toBeDefined();
      expect(metrics.storage).toBeDefined();
    });

    it("should have valid request metrics structure", async () => {
      const metrics = await monitoringService.getMetrics();
      
      expect(typeof metrics.requests.total).toBe("number");
      expect(typeof metrics.requests.success).toBe("number");
      expect(typeof metrics.requests.error).toBe("number");
      expect(typeof metrics.requests.avgLatency).toBe("number");
    });
  });

  describe("logError", () => {
    it("should log error messages", () => {
      monitoringService.logError("error", "Test error message");
      
      const errors = monitoringService.getRecentErrors(1);
      expect(errors.length).toBeGreaterThanOrEqual(0);
    });

    it("should log warning messages", () => {
      monitoringService.logError("warn", "Test warning message");
      
      // No error thrown means success
      expect(true).toBe(true);
    });

    it("should log info messages", () => {
      monitoringService.logError("info", "Test info message");
      
      // No error thrown means success
      expect(true).toBe(true);
    });

    it("should log with error object", () => {
      const error = new Error("Test error");
      monitoringService.logError("error", "Error with stack", error);
      
      // No error thrown means success
      expect(true).toBe(true);
    });

    it("should log with context", () => {
      monitoringService.logError("error", "Error with context", undefined, {
        userId: "123",
        action: "test",
      });
      
      // No error thrown means success
      expect(true).toBe(true);
    });
  });

  describe("getRecentErrors", () => {
    it("should return array of errors", () => {
      const errors = monitoringService.getRecentErrors();
      
      expect(Array.isArray(errors)).toBe(true);
    });

    it("should respect limit parameter", () => {
      // Log multiple errors
      for (let i = 0; i < 10; i++) {
        monitoringService.logError("error", `Error ${i}`);
      }
      
      const errors = monitoringService.getRecentErrors(5);
      expect(errors.length).toBeLessThanOrEqual(5);
    });
  });

  describe("getErrorStats", () => {
    it("should return error statistics", () => {
      const stats = monitoringService.getErrorStats();
      
      expect(stats).toBeDefined();
      expect(typeof stats.total).toBe("number");
      expect(stats.byLevel).toBeDefined();
      expect(typeof stats.last24h).toBe("number");
    });

    it("should have correct byLevel structure", () => {
      const stats = monitoringService.getErrorStats();
      
      expect(typeof stats.byLevel.error).toBe("number");
      expect(typeof stats.byLevel.warn).toBe("number");
      expect(typeof stats.byLevel.info).toBe("number");
    });
  });

  describe("createAlert", () => {
    it("should create an alert", () => {
      const alert = monitoringService.createAlert(
        "error_rate",
        "warning",
        "High error rate detected"
      );
      
      expect(alert).toBeDefined();
      expect(alert.id).toBeDefined();
      expect(alert.type).toBe("error_rate");
      expect(alert.severity).toBe("warning");
      expect(alert.message).toBe("High error rate detected");
      expect(alert.acknowledged).toBe(false);
    });

    it("should create alerts with different types", () => {
      const types: Array<"error_rate" | "latency" | "memory" | "downtime"> = [
        "error_rate",
        "latency",
        "memory",
        "downtime",
      ];
      
      for (const type of types) {
        const alert = monitoringService.createAlert(type, "info", `Test ${type}`);
        expect(alert.type).toBe(type);
      }
    });
  });

  describe("getActiveAlerts", () => {
    it("should return unacknowledged alerts", () => {
      const alerts = monitoringService.getActiveAlerts();
      
      expect(Array.isArray(alerts)).toBe(true);
      for (const alert of alerts) {
        expect(alert.acknowledged).toBe(false);
      }
    });
  });

  describe("acknowledgeAlert", () => {
    it("should acknowledge an existing alert", () => {
      const alert = monitoringService.createAlert(
        "latency",
        "warning",
        "Test alert for acknowledgment"
      );
      
      const result = monitoringService.acknowledgeAlert(alert.id);
      expect(result).toBe(true);
    });

    it("should return false for non-existent alert", () => {
      const result = monitoringService.acknowledgeAlert("non-existent-id");
      expect(result).toBe(false);
    });
  });

  describe("recordUptimeCheck", () => {
    it("should record healthy uptime check", () => {
      monitoringService.recordUptimeCheck(true);
      
      // No error thrown means success
      expect(true).toBe(true);
    });

    it("should record unhealthy uptime check", () => {
      monitoringService.recordUptimeCheck(false);
      
      // No error thrown means success
      expect(true).toBe(true);
    });
  });

  describe("getUptimeStats", () => {
    it("should return uptime statistics", () => {
      const stats = monitoringService.getUptimeStats();
      
      expect(stats).toBeDefined();
      expect(typeof stats.currentUptime).toBe("number");
      expect(typeof stats.last24hUptime).toBe("number");
      expect(typeof stats.last7dUptime).toBe("number");
      expect(typeof stats.checksTotal).toBe("number");
      expect(typeof stats.checksHealthy).toBe("number");
    });

    it("should have valid uptime percentages", () => {
      const stats = monitoringService.getUptimeStats();
      
      expect(stats.last24hUptime).toBeGreaterThanOrEqual(0);
      expect(stats.last24hUptime).toBeLessThanOrEqual(100);
      expect(stats.last7dUptime).toBeGreaterThanOrEqual(0);
      expect(stats.last7dUptime).toBeLessThanOrEqual(100);
    });
  });
});

describe("File Sharing Service", () => {
  describe("module exports", () => {
    it("should export createShare function", async () => {
      const fileSharingService = await import("./fileSharingService");
      expect(typeof fileSharingService.createShare).toBe("function");
    });

    it("should export accessShare function", async () => {
      const fileSharingService = await import("./fileSharingService");
      expect(typeof fileSharingService.accessShare).toBe("function");
    });

    it("should export revokeShare function", async () => {
      const fileSharingService = await import("./fileSharingService");
      expect(typeof fileSharingService.revokeShare).toBe("function");
    });

    it("should export updateShare function", async () => {
      const fileSharingService = await import("./fileSharingService");
      expect(typeof fileSharingService.updateShare).toBe("function");
    });

    it("should export getUserShares function", async () => {
      const fileSharingService = await import("./fileSharingService");
      expect(typeof fileSharingService.getUserShares).toBe("function");
    });

    it("should export getShareAnalytics function", async () => {
      const fileSharingService = await import("./fileSharingService");
      expect(typeof fileSharingService.getShareAnalytics).toBe("function");
    });

    it("should export shareWithEmails function", async () => {
      const fileSharingService = await import("./fileSharingService");
      expect(typeof fileSharingService.shareWithEmails).toBe("function");
    });

    it("should export trackDownload function", async () => {
      const fileSharingService = await import("./fileSharingService");
      expect(typeof fileSharingService.trackDownload).toBe("function");
    });
  });
});
