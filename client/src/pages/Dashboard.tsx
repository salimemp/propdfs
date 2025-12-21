import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { 
  FileText, Upload, FolderOpen, Users, BarChart3, 
  Clock, CheckCircle, XCircle, Loader2, ArrowRight,
  Zap, Cloud, Shield
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useEffect } from "react";

export default function Dashboard() {
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  
  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      window.location.href = getLoginUrl();
    }
  }, [authLoading, isAuthenticated]);

  const { data: usageStats, isLoading: usageLoading } = trpc.user.getUsageStats.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );
  
  const { data: dashboardData, isLoading: dashboardLoading } = trpc.analytics.getDashboard.useQuery(
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

  const conversionPercentage = usageStats 
    ? Math.min((usageStats.conversionsUsed / (usageStats.conversionsLimit === Infinity ? 100 : usageStats.conversionsLimit)) * 100, 100)
    : 0;
  
  const storagePercentage = usageStats
    ? (usageStats.storageUsed / usageStats.storageLimit) * 100
    : 0;

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Welcome Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">
              Welcome back, {user?.name || 'User'}
            </h1>
            <p className="text-slate-600 mt-1">
              Here's an overview of your document activity
            </p>
          </div>
          <Link href="/convert">
            <Button className="gap-2">
              <Upload className="h-4 w-4" />
              New Conversion
            </Button>
          </Link>
        </div>

        {/* Quick Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Conversions This Month</CardTitle>
              <Zap className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {usageStats?.conversionsUsed || 0}
                <span className="text-sm font-normal text-slate-500">
                  /{usageStats?.conversionsLimit === Infinity ? '∞' : usageStats?.conversionsLimit || 10}
                </span>
              </div>
              <Progress value={conversionPercentage} className="mt-2" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Storage Used</CardTitle>
              <Cloud className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatBytes(usageStats?.storageUsed || 0)}
              </div>
              <Progress value={storagePercentage} className="mt-2" />
              <p className="text-xs text-slate-500 mt-1">
                of {formatBytes(usageStats?.storageLimit || 0)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Success Rate</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {dashboardData?.stats?.total 
                  ? Math.round((Number(dashboardData.stats.completed) / Number(dashboardData.stats.total)) * 100)
                  : 100}%
              </div>
              <p className="text-xs text-slate-500 mt-2">
                {dashboardData?.stats?.completed || 0} successful conversions
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Current Plan</CardTitle>
              <Shield className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold capitalize">
                {usageStats?.tier || 'Free'}
              </div>
              {usageStats?.tier === 'free' && (
                <Link href="/pricing">
                  <Button variant="link" className="p-0 h-auto text-xs text-blue-600">
                    Upgrade to Pro →
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid gap-4 md:grid-cols-3">
          <Link href="/convert">
            <Card className="hover:shadow-md transition-shadow cursor-pointer group">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                  <FileText className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">Convert Files</h3>
                  <p className="text-sm text-slate-600">PDF, Word, Excel, Images</p>
                </div>
                <ArrowRight className="h-5 w-5 text-slate-400 ml-auto group-hover:text-blue-600 transition-colors" />
              </CardContent>
            </Card>
          </Link>

          <Link href="/files">
            <Card className="hover:shadow-md transition-shadow cursor-pointer group">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="h-12 w-12 rounded-lg bg-green-100 flex items-center justify-center group-hover:bg-green-200 transition-colors">
                  <FolderOpen className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">My Files</h3>
                  <p className="text-sm text-slate-600">Manage your documents</p>
                </div>
                <ArrowRight className="h-5 w-5 text-slate-400 ml-auto group-hover:text-green-600 transition-colors" />
              </CardContent>
            </Card>
          </Link>

          <Link href="/teams">
            <Card className="hover:shadow-md transition-shadow cursor-pointer group">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="h-12 w-12 rounded-lg bg-purple-100 flex items-center justify-center group-hover:bg-purple-200 transition-colors">
                  <Users className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">Teams</h3>
                  <p className="text-sm text-slate-600">Collaborate with others</p>
                </div>
                <ArrowRight className="h-5 w-5 text-slate-400 ml-auto group-hover:text-purple-600 transition-colors" />
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Conversions</CardTitle>
            <CardDescription>Your latest document conversions</CardDescription>
          </CardHeader>
          <CardContent>
            {dashboardLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : dashboardData?.recentConversions && dashboardData.recentConversions.length > 0 ? (
              <div className="space-y-4">
                {dashboardData.recentConversions.map((conversion) => (
                  <div key={conversion.id} className="flex items-center gap-4 p-3 rounded-lg bg-slate-50">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                      conversion.status === 'completed' ? 'bg-green-100' :
                      conversion.status === 'failed' ? 'bg-red-100' :
                      conversion.status === 'processing' ? 'bg-blue-100' : 'bg-slate-100'
                    }`}>
                      {conversion.status === 'completed' ? (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      ) : conversion.status === 'failed' ? (
                        <XCircle className="h-5 w-5 text-red-600" />
                      ) : conversion.status === 'processing' ? (
                        <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
                      ) : (
                        <Clock className="h-5 w-5 text-slate-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 truncate">{conversion.sourceFilename}</p>
                      <p className="text-sm text-slate-500">
                        {conversion.sourceFormat.toUpperCase()} → {conversion.outputFormat.toUpperCase()}
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
                <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">No conversions yet</p>
                <Link href="/convert">
                  <Button variant="link" className="mt-2">
                    Start your first conversion →
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upgrade Banner (for free users) */}
        {usageStats?.tier === 'free' && (
          <Card className="bg-gradient-to-r from-blue-600 to-blue-700 text-white border-0">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold mb-1">Upgrade to Pro</h3>
                <p className="text-blue-100">
                  Get unlimited conversions, 50GB storage, and advanced features for just $5.99/month
                </p>
              </div>
              <Link href="/pricing">
                <Button variant="secondary" className="shrink-0">
                  View Plans
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
