import { getDb } from "./db";
import { sql } from "drizzle-orm";

// ==================== HEALTH CHECK ====================

export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: Date;
  version: string;
  uptime: number;
  checks: {
    database: ComponentHealth;
    storage: ComponentHealth;
    memory: ComponentHealth;
    cpu: ComponentHealth;
  };
}

export interface ComponentHealth {
  status: "healthy" | "degraded" | "unhealthy";
  latency?: number;
  message?: string;
  details?: Record<string, any>;
}

const startTime = Date.now();

export async function getHealthStatus(): Promise<HealthStatus> {
  const checks = {
    database: await checkDatabase(),
    storage: await checkStorage(),
    memory: checkMemory(),
    cpu: checkCpu(),
  };

  // Determine overall status
  const statuses = Object.values(checks).map(c => c.status);
  let overallStatus: "healthy" | "degraded" | "unhealthy" = "healthy";
  
  if (statuses.includes("unhealthy")) {
    overallStatus = "unhealthy";
  } else if (statuses.includes("degraded")) {
    overallStatus = "degraded";
  }

  return {
    status: overallStatus,
    timestamp: new Date(),
    version: process.env.npm_package_version || "1.0.0",
    uptime: Date.now() - startTime,
    checks,
  };
}

async function checkDatabase(): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    const db = await getDb();
    if (!db) {
      return {
        status: "unhealthy",
        message: "Database connection not available",
      };
    }

    // Simple query to check connection
    await db.execute(sql`SELECT 1`);
    const latency = Date.now() - start;

    return {
      status: latency < 100 ? "healthy" : latency < 500 ? "degraded" : "unhealthy",
      latency,
      message: latency < 100 ? "Database responding normally" : "Database response slow",
    };
  } catch (error) {
    return {
      status: "unhealthy",
      latency: Date.now() - start,
      message: `Database error: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

async function checkStorage(): Promise<ComponentHealth> {
  // Check S3 connectivity by verifying env vars are set
  const hasStorageConfig = !!(
    process.env.BUILT_IN_FORGE_API_URL && 
    process.env.BUILT_IN_FORGE_API_KEY
  );

  if (!hasStorageConfig) {
    return {
      status: "degraded",
      message: "Storage configuration incomplete",
    };
  }

  return {
    status: "healthy",
    message: "Storage service configured",
  };
}

function checkMemory(): ComponentHealth {
  const used = process.memoryUsage();
  const heapUsedMB = Math.round(used.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(used.heapTotal / 1024 / 1024);
  const usagePercent = (used.heapUsed / used.heapTotal) * 100;

  let status: "healthy" | "degraded" | "unhealthy" = "healthy";
  if (usagePercent > 90) {
    status = "unhealthy";
  } else if (usagePercent > 75) {
    status = "degraded";
  }

  return {
    status,
    message: `Memory usage: ${heapUsedMB}MB / ${heapTotalMB}MB (${usagePercent.toFixed(1)}%)`,
    details: {
      heapUsed: heapUsedMB,
      heapTotal: heapTotalMB,
      external: Math.round(used.external / 1024 / 1024),
      rss: Math.round(used.rss / 1024 / 1024),
    },
  };
}

function checkCpu(): ComponentHealth {
  const cpuUsage = process.cpuUsage();
  const totalUsage = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds

  return {
    status: "healthy",
    message: `CPU time: ${totalUsage.toFixed(2)}s`,
    details: {
      user: cpuUsage.user / 1000000,
      system: cpuUsage.system / 1000000,
    },
  };
}

// ==================== METRICS ====================

export interface Metrics {
  timestamp: Date;
  requests: {
    total: number;
    success: number;
    error: number;
    avgLatency: number;
  };
  conversions: {
    total: number;
    success: number;
    failed: number;
    avgDuration: number;
  };
  users: {
    total: number;
    active24h: number;
    active7d: number;
  };
  storage: {
    totalFiles: number;
    totalSizeMB: number;
  };
}

// In-memory metrics store (in production, use Redis or similar)
const metricsStore = {
  requests: {
    total: 0,
    success: 0,
    error: 0,
    latencies: [] as number[],
  },
};

export function recordRequest(success: boolean, latencyMs: number): void {
  metricsStore.requests.total++;
  if (success) {
    metricsStore.requests.success++;
  } else {
    metricsStore.requests.error++;
  }
  
  // Keep last 1000 latencies for averaging
  metricsStore.requests.latencies.push(latencyMs);
  if (metricsStore.requests.latencies.length > 1000) {
    metricsStore.requests.latencies.shift();
  }
}

export async function getMetrics(): Promise<Metrics> {
  const db = await getDb();
  
  // Calculate average latency
  const avgLatency = metricsStore.requests.latencies.length > 0
    ? metricsStore.requests.latencies.reduce((a, b) => a + b, 0) / metricsStore.requests.latencies.length
    : 0;

  // Get database metrics
  let userMetrics = { total: 0, active24h: 0, active7d: 0 };
  let storageMetrics = { totalFiles: 0, totalSizeMB: 0 };
  let conversionMetrics = { total: 0, success: 0, failed: 0, avgDuration: 0 };

  if (db) {
    try {
      // User metrics
      const userResult = await db.execute(sql`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN lastLoginAt > DATE_SUB(NOW(), INTERVAL 1 DAY) THEN 1 ELSE 0 END) as active24h,
          SUM(CASE WHEN lastLoginAt > DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) as active7d
        FROM users
      `);
      const userRows = userResult as unknown as any[];
      if (userRows && userRows[0]) {
        const row = userRows[0];
        userMetrics = {
          total: Number(row.total) || 0,
          active24h: Number(row.active24h) || 0,
          active7d: Number(row.active7d) || 0,
        };
      }

      // Storage metrics
      const storageResult = await db.execute(sql`
        SELECT 
          COUNT(*) as totalFiles,
          COALESCE(SUM(fileSize), 0) / 1024 / 1024 as totalSizeMB
        FROM files
      `);
      const storageRows = storageResult as unknown as any[];
      if (storageRows && storageRows[0]) {
        const row = storageRows[0];
        storageMetrics = {
          totalFiles: Number(row.totalFiles) || 0,
          totalSizeMB: Number(row.totalSizeMB) || 0,
        };
      }

      // Conversion metrics
      const conversionResult = await db.execute(sql`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as success,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          AVG(processingTimeMs) as avgDuration
        FROM conversions
        WHERE createdAt > DATE_SUB(NOW(), INTERVAL 24 HOUR)
      `);
      const conversionRows = conversionResult as unknown as any[];
      if (conversionRows && conversionRows[0]) {
        const row = conversionRows[0];
        conversionMetrics = {
          total: Number(row.total) || 0,
          success: Number(row.success) || 0,
          failed: Number(row.failed) || 0,
          avgDuration: Number(row.avgDuration) || 0,
        };
      }
    } catch (error) {
      console.error("Error fetching metrics:", error);
    }
  }

  return {
    timestamp: new Date(),
    requests: {
      total: metricsStore.requests.total,
      success: metricsStore.requests.success,
      error: metricsStore.requests.error,
      avgLatency: Math.round(avgLatency),
    },
    conversions: conversionMetrics,
    users: userMetrics,
    storage: storageMetrics,
  };
}

// ==================== ERROR TRACKING ====================

export interface ErrorLog {
  id: string;
  timestamp: Date;
  level: "error" | "warn" | "info";
  message: string;
  stack?: string;
  context?: Record<string, any>;
}

const errorLogs: ErrorLog[] = [];
const MAX_ERROR_LOGS = 1000;

export function logError(
  level: "error" | "warn" | "info",
  message: string,
  error?: Error,
  context?: Record<string, any>
): void {
  const log: ErrorLog = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date(),
    level,
    message,
    stack: error?.stack,
    context,
  };

  errorLogs.unshift(log);
  
  // Keep only last MAX_ERROR_LOGS entries
  if (errorLogs.length > MAX_ERROR_LOGS) {
    errorLogs.pop();
  }

  // Also log to console
  if (level === "error") {
    console.error(`[ERROR] ${message}`, error, context);
  } else if (level === "warn") {
    console.warn(`[WARN] ${message}`, context);
  } else {
    console.info(`[INFO] ${message}`, context);
  }
}

export function getRecentErrors(limit: number = 100): ErrorLog[] {
  return errorLogs.slice(0, limit);
}

export function getErrorStats(): {
  total: number;
  byLevel: Record<string, number>;
  last24h: number;
} {
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;

  const byLevel: Record<string, number> = { error: 0, warn: 0, info: 0 };
  let last24h = 0;

  for (const log of errorLogs) {
    byLevel[log.level]++;
    if (log.timestamp.getTime() > dayAgo) {
      last24h++;
    }
  }

  return {
    total: errorLogs.length,
    byLevel,
    last24h,
  };
}

// ==================== ALERTS ====================

export interface Alert {
  id: string;
  type: "error_rate" | "latency" | "memory" | "downtime";
  severity: "critical" | "warning" | "info";
  message: string;
  timestamp: Date;
  acknowledged: boolean;
}

const alerts: Alert[] = [];

export function createAlert(
  type: Alert["type"],
  severity: Alert["severity"],
  message: string
): Alert {
  const alert: Alert = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type,
    severity,
    message,
    timestamp: new Date(),
    acknowledged: false,
  };

  alerts.unshift(alert);
  
  // Keep only last 100 alerts
  if (alerts.length > 100) {
    alerts.pop();
  }

  return alert;
}

export function getActiveAlerts(): Alert[] {
  return alerts.filter(a => !a.acknowledged);
}

export function acknowledgeAlert(alertId: string): boolean {
  const alert = alerts.find(a => a.id === alertId);
  if (alert) {
    alert.acknowledged = true;
    return true;
  }
  return false;
}

// ==================== UPTIME TRACKING ====================

const uptimeChecks: { timestamp: Date; healthy: boolean }[] = [];

export function recordUptimeCheck(healthy: boolean): void {
  uptimeChecks.push({ timestamp: new Date(), healthy });
  
  // Keep last 24 hours of checks (assuming 1 check per minute = 1440 checks)
  if (uptimeChecks.length > 1440) {
    uptimeChecks.shift();
  }
}

export function getUptimeStats(): {
  currentUptime: number;
  last24hUptime: number;
  last7dUptime: number;
  checksTotal: number;
  checksHealthy: number;
} {
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

  let checksTotal = 0;
  let checksHealthy = 0;
  let last24hTotal = 0;
  let last24hHealthy = 0;
  let last7dTotal = 0;
  let last7dHealthy = 0;

  for (const check of uptimeChecks) {
    checksTotal++;
    if (check.healthy) checksHealthy++;

    if (check.timestamp.getTime() > dayAgo) {
      last24hTotal++;
      if (check.healthy) last24hHealthy++;
    }

    if (check.timestamp.getTime() > weekAgo) {
      last7dTotal++;
      if (check.healthy) last7dHealthy++;
    }
  }

  return {
    currentUptime: Date.now() - startTime,
    last24hUptime: last24hTotal > 0 ? (last24hHealthy / last24hTotal) * 100 : 100,
    last7dUptime: last7dTotal > 0 ? (last7dHealthy / last7dTotal) * 100 : 100,
    checksTotal,
    checksHealthy,
  };
}
