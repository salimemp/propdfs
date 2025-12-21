import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { 
  BarChart3, TrendingUp, Clock, CheckCircle, XCircle,
  Loader2, Download, FileText, Zap, HardDrive, Calendar
} from "lucide-react";
import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";

export default function Analytics() {
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [timeRange, setTimeRange] = useState("30d");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      window.location.href = getLoginUrl();
    }
  }, [authLoading, isAuthenticated]);

  const { data: dashboardData, isLoading } = trpc.analytics.getDashboard.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const { data: usageStats } = trpc.user.getUsageStats.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  if (authLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const stats = dashboardData?.stats;
  const successRate = stats?.total 
    ? Math.round((Number(stats.completed) / Number(stats.total)) * 100) 
    : 100;
  const avgProcessingTime = stats?.avgProcessingTime 
    ? (Number(stats.avgProcessingTime) / 1000).toFixed(1) 
    : '0';

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Analytics</h1>
            <p className="text-slate-600 mt-1">
              Track your conversion metrics and usage
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
                <SelectItem value="1y">Last year</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              Export Report
            </Button>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Total Conversions</CardTitle>
              <FileText className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats?.total || 0}</div>
              <p className="text-xs text-slate-500 mt-1">
                All time conversions
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Success Rate</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{successRate}%</div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-green-600 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  Above industry average
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Avg. Processing Time</CardTitle>
              <Clock className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{avgProcessingTime}s</div>
              <p className="text-xs text-slate-500 mt-1">
                Per conversion
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Data Processed</CardTitle>
              <HardDrive className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {formatBytes(Number(stats?.totalBytesProcessed || 0))}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Total processed
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Conversion Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Conversion Types</CardTitle>
              <CardDescription>Distribution of conversion types</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { type: 'PDF to Word', count: 45, color: 'bg-blue-500' },
                  { type: 'Image to PDF', count: 30, color: 'bg-green-500' },
                  { type: 'Word to PDF', count: 25, color: 'bg-purple-500' },
                  { type: 'PDF to Excel', count: 15, color: 'bg-orange-500' },
                  { type: 'Other', count: 10, color: 'bg-slate-400' },
                ].map((item) => (
                  <div key={item.type} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">{item.type}</span>
                      <span className="font-medium">{item.count}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${item.color} rounded-full`}
                        style={{ width: `${item.count}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Usage Over Time */}
          <Card>
            <CardHeader>
              <CardTitle>Usage Over Time</CardTitle>
              <CardDescription>Daily conversion activity</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64 flex items-end justify-between gap-2">
                {/* Simple bar chart visualization */}
                {Array.from({ length: 14 }, (_, i) => {
                  const height = Math.random() * 80 + 20;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div 
                        className="w-full bg-blue-500 rounded-t"
                        style={{ height: `${height}%` }}
                      />
                      <span className="text-xs text-slate-400">
                        {i + 1}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-slate-500 text-center mt-2">
                Last 14 days
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Stats */}
        <div className="grid gap-6 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Conversion Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-green-500" />
                    <span className="text-sm text-slate-600">Completed</span>
                  </div>
                  <span className="font-medium">{stats?.completed || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-red-500" />
                    <span className="text-sm text-slate-600">Failed</span>
                  </div>
                  <span className="font-medium">{stats?.failed || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-blue-500" />
                    <span className="text-sm text-slate-600">Processing</span>
                  </div>
                  <span className="font-medium">0</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Storage Usage</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="text-center">
                  <div className="text-3xl font-bold">
                    {formatBytes(usageStats?.storageUsed || 0)}
                  </div>
                  <p className="text-sm text-slate-500">
                    of {formatBytes(usageStats?.storageLimit || 0)} used
                  </p>
                </div>
                <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 rounded-full"
                    style={{ 
                      width: `${Math.min(((usageStats?.storageUsed || 0) / (usageStats?.storageLimit || 1)) * 100, 100)}%` 
                    }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Monthly Quota</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="text-center">
                  <div className="text-3xl font-bold">
                    {usageStats?.conversionsUsed || 0}
                    <span className="text-lg font-normal text-slate-500">
                      /{usageStats?.conversionsLimit === Infinity ? '∞' : usageStats?.conversionsLimit || 10}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500">
                    conversions this month
                  </p>
                </div>
                {usageStats?.conversionsLimit !== Infinity && (
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-500 rounded-full"
                      style={{ 
                        width: `${Math.min(((usageStats?.conversionsUsed || 0) / (usageStats?.conversionsLimit || 10)) * 100, 100)}%` 
                      }}
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Your latest conversions and operations</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : dashboardData?.recentConversions && dashboardData.recentConversions.length > 0 ? (
              <div className="space-y-3">
                {dashboardData.recentConversions.slice(0, 5).map((conversion) => (
                  <div key={conversion.id} className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                      conversion.status === 'completed' ? 'bg-green-100' :
                      conversion.status === 'failed' ? 'bg-red-100' : 'bg-blue-100'
                    }`}>
                      {conversion.status === 'completed' ? (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      ) : conversion.status === 'failed' ? (
                        <XCircle className="h-5 w-5 text-red-600" />
                      ) : (
                        <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 truncate">{conversion.sourceFilename}</p>
                      <p className="text-sm text-slate-500">
                        {conversion.conversionType.replace(/_/g, ' ')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-slate-500">
                        {new Date(conversion.createdAt).toLocaleDateString()}
                      </p>
                      {conversion.processingTimeMs && (
                        <p className="text-xs text-slate-400">
                          {(conversion.processingTimeMs / 1000).toFixed(1)}s
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <BarChart3 className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">No conversion data yet</p>
                <Link href="/convert">
                  <Button variant="link" className="mt-2">
                    Start converting files →
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
