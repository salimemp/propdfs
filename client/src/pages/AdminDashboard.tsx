import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Database, 
  HardDrive, 
  RefreshCw, 
  Server, 
  Users, 
  FileText,
  XCircle,
  Cpu,
  MemoryStick,
  Wifi,
  Shield
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

interface HealthStatus {
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

interface ComponentHealth {
  status: "healthy" | "degraded" | "unhealthy";
  latency?: number;
  message?: string;
  details?: Record<string, any>;
}

interface Metrics {
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

interface ErrorLog {
  id: string;
  timestamp: Date;
  level: "error" | "warn" | "info";
  message: string;
  stack?: string;
  context?: Record<string, any>;
}

interface Alert {
  id: string;
  type: "error_rate" | "latency" | "memory" | "downtime";
  severity: "critical" | "warning" | "info";
  message: string;
  timestamp: Date;
  acknowledged: boolean;
}

export default function AdminDashboard() {
  const [, navigate] = useLocation();
  const { user, loading: authLoading } = useAuth();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(30000); // 30 seconds

  // Check if user is admin
  useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) {
      toast.error("Access denied. Admin privileges required.");
      navigate("/dashboard");
    }
  }, [user, authLoading, navigate]);

  // Fetch health status
  const { data: health, refetch: refetchHealth, isLoading: healthLoading } = trpc.monitoring.health.useQuery(
    undefined,
    { refetchInterval: autoRefresh ? refreshInterval : false }
  );

  // Fetch metrics (admin only)
  const { data: metrics, refetch: refetchMetrics, isLoading: metricsLoading } = trpc.monitoring.metrics.useQuery(
    undefined,
    { 
      refetchInterval: autoRefresh ? refreshInterval : false,
      enabled: user?.role === "admin"
    }
  );

  // Fetch errors (admin only)
  const { data: errors, refetch: refetchErrors } = trpc.monitoring.errors.useQuery(
    { limit: 50 },
    { 
      refetchInterval: autoRefresh ? refreshInterval : false,
      enabled: user?.role === "admin"
    }
  );

  // Fetch error stats (admin only)
  const { data: errorStats } = trpc.monitoring.errorStats.useQuery(
    undefined,
    { 
      refetchInterval: autoRefresh ? refreshInterval : false,
      enabled: user?.role === "admin"
    }
  );

  // Fetch alerts (admin only)
  const { data: alerts, refetch: refetchAlerts } = trpc.monitoring.alerts.useQuery(
    undefined,
    { 
      refetchInterval: autoRefresh ? refreshInterval : false,
      enabled: user?.role === "admin"
    }
  );

  // Fetch uptime stats (admin only)
  const { data: uptime } = trpc.monitoring.uptime.useQuery(
    undefined,
    { 
      refetchInterval: autoRefresh ? refreshInterval : false,
      enabled: user?.role === "admin"
    }
  );

  // Acknowledge alert mutation
  const acknowledgeAlert = trpc.monitoring.acknowledgeAlert.useMutation({
    onSuccess: () => {
      toast.success("Alert acknowledged");
      refetchAlerts();
    },
    onError: (error) => {
      toast.error(`Failed to acknowledge alert: ${error.message}`);
    },
  });

  const handleRefresh = () => {
    refetchHealth();
    refetchMetrics();
    refetchErrors();
    refetchAlerts();
    toast.success("Dashboard refreshed");
  };

  const formatUptime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "healthy": return "text-green-500";
      case "degraded": return "text-yellow-500";
      case "unhealthy": return "text-red-500";
      default: return "text-gray-500";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "healthy": return <Badge className="bg-green-500">Healthy</Badge>;
      case "degraded": return <Badge className="bg-yellow-500">Degraded</Badge>;
      case "unhealthy": return <Badge variant="destructive">Unhealthy</Badge>;
      default: return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "critical": return <Badge variant="destructive">Critical</Badge>;
      case "warning": return <Badge className="bg-yellow-500">Warning</Badge>;
      case "info": return <Badge variant="secondary">Info</Badge>;
      default: return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const getLevelBadge = (level: string) => {
    switch (level) {
      case "error": return <Badge variant="destructive">Error</Badge>;
      case "warn": return <Badge className="bg-yellow-500">Warning</Badge>;
      case "info": return <Badge variant="secondary">Info</Badge>;
      default: return <Badge variant="outline">Unknown</Badge>;
    }
  };

  if (authLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (!user || user.role !== "admin") {
    return null;
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Admin Dashboard</h1>
            <p className="text-muted-foreground">
              Monitor system health, metrics, and alerts in real-time
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Auto-refresh:</span>
              <Button
                variant={autoRefresh ? "default" : "outline"}
                size="sm"
                onClick={() => setAutoRefresh(!autoRefresh)}
              >
                {autoRefresh ? "On" : "Off"}
              </Button>
            </div>
            <Button onClick={handleRefresh} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* System Status Overview */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">System Status</CardTitle>
              <Server className={`h-4 w-4 ${health ? getStatusColor(health.status) : "text-gray-500"}`} />
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                {health ? getStatusBadge(health.status) : <Badge variant="secondary">Loading...</Badge>}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Version: {health?.version || "N/A"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Uptime</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {health ? formatUptime(health.uptime) : "N/A"}
              </div>
              <p className="text-xs text-muted-foreground">
                24h: {uptime?.last24hUptime?.toFixed(2) || "N/A"}%
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics?.users.active24h || 0}</div>
              <p className="text-xs text-muted-foreground">
                Total: {metrics?.users.total || 0} users
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Alerts</CardTitle>
              <AlertTriangle className={`h-4 w-4 ${(alerts?.length || 0) > 0 ? "text-yellow-500" : "text-green-500"}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{alerts?.length || 0}</div>
              <p className="text-xs text-muted-foreground">
                Errors (24h): {errorStats?.last24h || 0}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs for different sections */}
        <Tabs defaultValue="health" className="space-y-4">
          <TabsList>
            <TabsTrigger value="health">System Health</TabsTrigger>
            <TabsTrigger value="metrics">Metrics</TabsTrigger>
            <TabsTrigger value="errors">Error Logs</TabsTrigger>
            <TabsTrigger value="alerts">Alerts</TabsTrigger>
          </TabsList>

          {/* System Health Tab */}
          <TabsContent value="health" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {/* Database Health */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5" />
                    Database
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span>Status</span>
                      {health?.checks.database ? getStatusBadge(health.checks.database.status) : <Badge variant="secondary">N/A</Badge>}
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Latency</span>
                      <span>{health?.checks.database?.latency || "N/A"} ms</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {health?.checks.database?.message || "No status message"}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Storage Health */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <HardDrive className="h-5 w-5" />
                    Storage
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span>Status</span>
                      {health?.checks.storage ? getStatusBadge(health.checks.storage.status) : <Badge variant="secondary">N/A</Badge>}
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Total Files</span>
                      <span>{metrics?.storage.totalFiles || 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Total Size</span>
                      <span>{(metrics?.storage.totalSizeMB || 0).toFixed(2)} MB</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {health?.checks.storage?.message || "No status message"}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Memory Health */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MemoryStick className="h-5 w-5" />
                    Memory
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span>Status</span>
                      {health?.checks.memory ? getStatusBadge(health.checks.memory.status) : <Badge variant="secondary">N/A</Badge>}
                    </div>
                    {health?.checks.memory?.details && (
                      <>
                        <div className="flex items-center justify-between">
                          <span>Heap Used</span>
                          <span>{health.checks.memory.details.heapUsed} MB</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Heap Total</span>
                          <span>{health.checks.memory.details.heapTotal} MB</span>
                        </div>
                        <Progress 
                          value={(health.checks.memory.details.heapUsed / health.checks.memory.details.heapTotal) * 100} 
                          className="h-2"
                        />
                      </>
                    )}
                    <p className="text-sm text-muted-foreground">
                      {health?.checks.memory?.message || "No status message"}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* CPU Health */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Cpu className="h-5 w-5" />
                    CPU
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span>Status</span>
                      {health?.checks.cpu ? getStatusBadge(health.checks.cpu.status) : <Badge variant="secondary">N/A</Badge>}
                    </div>
                    {health?.checks.cpu?.details && (
                      <>
                        <div className="flex items-center justify-between">
                          <span>User Time</span>
                          <span>{health.checks.cpu.details.user?.toFixed(2) || "N/A"} s</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>System Time</span>
                          <span>{health.checks.cpu.details.system?.toFixed(2) || "N/A"} s</span>
                        </div>
                      </>
                    )}
                    <p className="text-sm text-muted-foreground">
                      {health?.checks.cpu?.message || "No status message"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Metrics Tab */}
          <TabsContent value="metrics" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {/* Request Metrics */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wifi className="h-5 w-5" />
                    Requests
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span>Total</span>
                      <span className="font-bold">{metrics?.requests.total || 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-green-500">Success</span>
                      <span>{metrics?.requests.success || 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-red-500">Errors</span>
                      <span>{metrics?.requests.error || 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Avg Latency</span>
                      <span>{metrics?.requests.avgLatency || 0} ms</span>
                    </div>
                    {metrics?.requests.total && metrics.requests.total > 0 && (
                      <Progress 
                        value={(metrics.requests.success / metrics.requests.total) * 100} 
                        className="h-2"
                      />
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Conversion Metrics */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Conversions (24h)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span>Total</span>
                      <span className="font-bold">{metrics?.conversions.total || 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-green-500">Success</span>
                      <span>{metrics?.conversions.success || 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-red-500">Failed</span>
                      <span>{metrics?.conversions.failed || 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Avg Duration</span>
                      <span>{(metrics?.conversions.avgDuration || 0).toFixed(0)} ms</span>
                    </div>
                    {metrics?.conversions.total && metrics.conversions.total > 0 && (
                      <Progress 
                        value={(metrics.conversions.success / metrics.conversions.total) * 100} 
                        className="h-2"
                      />
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* User Metrics */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Users
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span>Total</span>
                      <span className="font-bold">{metrics?.users.total || 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Active (24h)</span>
                      <span>{metrics?.users.active24h || 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Active (7d)</span>
                      <span>{metrics?.users.active7d || 0}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Error Logs Tab */}
          <TabsContent value="errors" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Recent Error Logs</CardTitle>
                <CardDescription>
                  Last 50 errors, warnings, and info messages
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  {errors && errors.length > 0 ? (
                    <div className="space-y-4">
                      {errors.map((error: ErrorLog) => (
                        <div key={error.id} className="border rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            {getLevelBadge(error.level)}
                            <span className="text-xs text-muted-foreground">
                              {new Date(error.timestamp).toLocaleString()}
                            </span>
                          </div>
                          <p className="font-medium">{error.message}</p>
                          {error.stack && (
                            <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-x-auto">
                              {error.stack.slice(0, 500)}...
                            </pre>
                          )}
                          {error.context && (
                            <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-x-auto">
                              {JSON.stringify(error.context, null, 2)}
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                      <CheckCircle className="h-8 w-8 mb-2 text-green-500" />
                      <p>No errors logged</p>
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Alerts Tab */}
          <TabsContent value="alerts" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Active Alerts</CardTitle>
                <CardDescription>
                  Unacknowledged system alerts requiring attention
                </CardDescription>
              </CardHeader>
              <CardContent>
                {alerts && alerts.length > 0 ? (
                  <div className="space-y-4">
                    {alerts.map((alert: Alert) => (
                      <div key={alert.id} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {getSeverityBadge(alert.severity)}
                            <Badge variant="outline">{alert.type}</Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {new Date(alert.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <p className="font-medium mb-2">{alert.message}</p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => acknowledgeAlert.mutate({ alertId: alert.id })}
                          disabled={acknowledgeAlert.isPending}
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Acknowledge
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                    <Shield className="h-8 w-8 mb-2 text-green-500" />
                    <p>No active alerts</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
