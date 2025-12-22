import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { 
  User, Bell, Shield, Globe, Palette, Key, 
  Loader2, Save, LogOut, Trash2, CreditCard, Cloud,
  CheckCircle, XCircle, ExternalLink, Link2Off
} from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

const cloudProviders = [
  { 
    id: "google_drive" as const, 
    name: "Google Drive", 
    icon: "🔵", 
    color: "from-blue-500 to-blue-600",
    description: "Access files from your Google Drive account"
  },
  { 
    id: "dropbox" as const, 
    name: "Dropbox", 
    icon: "📦", 
    color: "from-blue-600 to-blue-700",
    description: "Connect your Dropbox for seamless file access"
  },
  { 
    id: "onedrive" as const, 
    name: "OneDrive", 
    icon: "☁️", 
    color: "from-sky-500 to-sky-600",
    description: "Import and export files to Microsoft OneDrive"
  },
];

export default function Settings() {
  const { user, loading: authLoading, isAuthenticated, logout } = useAuth();
  const [, setLocation] = useLocation();
  
  // Preferences state
  const [language, setLanguage] = useState("en");
  const [timezone, setTimezone] = useState("UTC");
  const [dateFormat, setDateFormat] = useState("MM/DD/YYYY");
  const [measurementUnit, setMeasurementUnit] = useState<"metric" | "imperial">("metric");
  const [currency, setCurrency] = useState("USD");
  const [highContrastMode, setHighContrastMode] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      window.location.href = getLoginUrl();
    }
  }, [authLoading, isAuthenticated]);

  const { data: profile, isLoading: profileLoading } = trpc.user.getProfile.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const { data: usageStats } = trpc.user.getUsageStats.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  // Cloud storage queries
  const { data: cloudConnections, refetch: refetchConnections } = trpc.cloudStorage.listConnections.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const disconnectMutation = trpc.cloudStorage.disconnect.useMutation({
    onSuccess: () => {
      toast.success("Cloud storage disconnected");
      refetchConnections();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updatePreferencesMutation = trpc.user.updatePreferences.useMutation({
    onSuccess: () => {
      toast.success("Preferences saved successfully");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Load preferences from profile
  useEffect(() => {
    if (profile) {
      setLanguage(profile.language || "en");
      setTimezone(profile.timezone || "UTC");
      setDateFormat(profile.dateFormat || "MM/DD/YYYY");
      setMeasurementUnit(profile.measurementUnit || "metric");
      setCurrency(profile.currency || "USD");
      setHighContrastMode(profile.highContrastMode || false);
    }
  }, [profile]);

  const handleSavePreferences = () => {
    updatePreferencesMutation.mutate({
      language,
      timezone,
      dateFormat,
      measurementUnit,
      currency,
      highContrastMode,
    });
  };

  const handleLogout = async () => {
    await logout();
    setLocation("/");
  };

  // OAuth connect mutation
  const getAuthUrlMutation = trpc.cloudStorage.getAuthUrl.useMutation({
    onSuccess: (data) => {
      // Redirect to OAuth provider
      window.location.href = data.authUrl;
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Handle OAuth callback
  const handleCallbackMutation = trpc.cloudStorage.handleCallback.useMutation({
    onSuccess: (data) => {
      toast.success(`Successfully connected to ${data.provider}!`);
      refetchConnections();
      // Clear URL params
      window.history.replaceState({}, document.title, window.location.pathname);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Check for OAuth callback on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    
    if (code && state && isAuthenticated) {
      handleCallbackMutation.mutate({ code, state });
    }
  }, [isAuthenticated]);

  const handleConnectCloud = (providerId: "google_drive" | "dropbox" | "onedrive") => {
    getAuthUrlMutation.mutate({ provider: providerId });
  };

  const handleDisconnectCloud = (providerId: "google_drive" | "dropbox" | "onedrive") => {
    disconnectMutation.mutate({ provider: providerId });
  };

  if (authLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Settings</h1>
          <p className="text-slate-600 mt-1">
            Manage your account and preferences
          </p>
        </div>

        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="flex-wrap">
            <TabsTrigger value="profile" className="gap-2">
              <User className="h-4 w-4" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="preferences" className="gap-2">
              <Globe className="h-4 w-4" />
              Preferences
            </TabsTrigger>
            <TabsTrigger value="integrations" className="gap-2">
              <Cloud className="h-4 w-4" />
              Integrations
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-2">
              <Shield className="h-4 w-4" />
              Security
            </TabsTrigger>
            <TabsTrigger value="billing" className="gap-2">
              <CreditCard className="h-4 w-4" />
              Billing
            </TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
                <CardDescription>
                  Your account details and personal information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center gap-6">
                  <div className="h-20 w-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold">
                    {user?.name?.charAt(0) || 'U'}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">{user?.name || 'User'}</h3>
                    <p className="text-slate-500">{user?.email}</p>
                    <p className="text-sm text-slate-400 mt-1">
                      Member since {profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : 'N/A'}
                    </p>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Display Name</Label>
                    <Input id="name" value={user?.name || ''} disabled />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input id="email" value={user?.email || ''} disabled />
                  </div>
                </div>

                <p className="text-sm text-slate-500">
                  Profile information is managed through your authentication provider.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Preferences Tab */}
          <TabsContent value="preferences" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Regional Settings</CardTitle>
                <CardDescription>
                  Customize language, timezone, and format preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>Language</Label>
                    <Select value={language} onValueChange={setLanguage}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="es">Español</SelectItem>
                        <SelectItem value="fr">Français</SelectItem>
                        <SelectItem value="de">Deutsch</SelectItem>
                        <SelectItem value="zh">中文</SelectItem>
                        <SelectItem value="ja">日本語</SelectItem>
                        <SelectItem value="ko">한국어</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Timezone</Label>
                    <Select value={timezone} onValueChange={setTimezone}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="UTC">UTC</SelectItem>
                        <SelectItem value="America/New_York">Eastern Time</SelectItem>
                        <SelectItem value="America/Chicago">Central Time</SelectItem>
                        <SelectItem value="America/Denver">Mountain Time</SelectItem>
                        <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                        <SelectItem value="Europe/London">London</SelectItem>
                        <SelectItem value="Europe/Paris">Paris</SelectItem>
                        <SelectItem value="Asia/Tokyo">Tokyo</SelectItem>
                        <SelectItem value="Asia/Shanghai">Shanghai</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Date Format</Label>
                    <Select value={dateFormat} onValueChange={setDateFormat}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                        <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                        <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Measurement Unit</Label>
                    <Select value={measurementUnit} onValueChange={(v) => setMeasurementUnit(v as any)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="metric">Metric (cm, kg)</SelectItem>
                        <SelectItem value="imperial">Imperial (in, lb)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Currency</Label>
                    <Select value={currency} onValueChange={setCurrency}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USD">USD ($)</SelectItem>
                        <SelectItem value="EUR">EUR (€)</SelectItem>
                        <SelectItem value="GBP">GBP (£)</SelectItem>
                        <SelectItem value="JPY">JPY (¥)</SelectItem>
                        <SelectItem value="CNY">CNY (¥)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Accessibility</CardTitle>
                <CardDescription>
                  Customize your viewing experience
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>High Contrast Mode</Label>
                    <p className="text-sm text-slate-500">
                      Increase contrast for better visibility
                    </p>
                  </div>
                  <Switch 
                    checked={highContrastMode} 
                    onCheckedChange={setHighContrastMode}
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button 
                onClick={handleSavePreferences}
                disabled={updatePreferencesMutation.isPending}
                className="gap-2"
              >
                {updatePreferencesMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save Preferences
              </Button>
            </div>
          </TabsContent>

          {/* Integrations Tab */}
          <TabsContent value="integrations" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Cloud Storage Integrations</CardTitle>
                <CardDescription>
                  Connect your cloud storage accounts to import and export files directly
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {cloudProviders.map((provider) => {
                  const connection = cloudConnections?.find(c => c.provider === provider.id);
                  const isConnected = !!connection;
                  
                  return (
                    <div 
                      key={provider.id}
                      className={`p-4 rounded-lg border-2 transition-all ${
                        isConnected 
                          ? 'border-green-200 bg-green-50' 
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`h-12 w-12 rounded-lg bg-gradient-to-br ${provider.color} flex items-center justify-center text-white text-xl`}>
                            {provider.icon}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold">{provider.name}</h3>
                              {isConnected && (
                                <span className="flex items-center gap-1 text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
                                  <CheckCircle className="h-3 w-3" />
                                  Connected
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-slate-500">{provider.description}</p>
                            {isConnected && connection?.accountEmail && (
                              <p className="text-xs text-slate-400 mt-1">
                                {connection.accountEmail}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {isConnected ? (
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleDisconnectCloud(provider.id)}
                              disabled={disconnectMutation.isPending}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              {disconnectMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Link2Off className="h-4 w-4 mr-1" />
                              )}
                              Disconnect
                            </Button>
                          ) : (
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleConnectCloud(provider.id)}
                              disabled={getAuthUrlMutation.isPending}
                            >
                              {getAuthUrlMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                              ) : (
                                <ExternalLink className="h-4 w-4 mr-1" />
                              )}
                              Connect
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>API Access</CardTitle>
                <CardDescription>
                  Manage API keys for programmatic access
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="p-4 bg-slate-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">API Key</p>
                      <p className="text-sm text-slate-500">
                        Use this key to access ProPDFs API
                      </p>
                    </div>
                    <Button variant="outline" onClick={() => toast.info("API access coming soon!")}>
                      Generate Key
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Webhooks</CardTitle>
                <CardDescription>
                  Configure webhooks for real-time notifications
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="p-4 bg-slate-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Webhook Endpoints</p>
                      <p className="text-sm text-slate-500">
                        Receive notifications when conversions complete
                      </p>
                    </div>
                    <Button variant="outline" onClick={() => toast.info("Webhooks coming soon!")}>
                      Add Endpoint
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Two-Factor Authentication</CardTitle>
                <CardDescription>
                  Add an extra layer of security to your account
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Authenticator App</p>
                    <p className="text-sm text-slate-500">
                      Use an authenticator app to generate one-time codes
                    </p>
                  </div>
                  <Button variant="outline" onClick={() => toast.info("Feature coming soon!")}>
                    <Key className="h-4 w-4 mr-2" />
                    Enable 2FA
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Sessions</CardTitle>
                <CardDescription>
                  Manage your active sessions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                    <div>
                      <p className="font-medium">Current Session</p>
                      <p className="text-sm text-slate-500">
                        Last active: Just now
                      </p>
                    </div>
                    <div className="text-sm text-green-600 font-medium">Active</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-red-200">
              <CardHeader>
                <CardTitle className="text-red-600">Danger Zone</CardTitle>
                <CardDescription>
                  Irreversible actions for your account
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Sign Out</p>
                    <p className="text-sm text-slate-500">
                      Sign out of your current session
                    </p>
                  </div>
                  <Button variant="outline" onClick={handleLogout}>
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-red-600">Delete Account</p>
                    <p className="text-sm text-slate-500">
                      Permanently delete your account and all data
                    </p>
                  </div>
                  <Button variant="destructive" onClick={() => toast.info("Please contact support to delete your account")}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Account
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Billing Tab */}
          <TabsContent value="billing" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Current Plan</CardTitle>
                <CardDescription>
                  Your subscription details
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between p-6 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg">
                  <div>
                    <h3 className="text-2xl font-bold capitalize">{usageStats?.tier || 'Free'} Plan</h3>
                    <p className="text-slate-600 mt-1">
                      {usageStats?.tier === 'free' 
                        ? '10 conversions/month, 25MB file limit'
                        : usageStats?.tier === 'pro'
                        ? 'Unlimited conversions, 500MB file limit'
                        : 'Unlimited conversions, 2GB file limit, team features'}
                    </p>
                  </div>
                  {usageStats?.tier !== 'enterprise' && (
                    <Link href="/pricing">
                      <Button>Upgrade Plan</Button>
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Usage This Month</CardTitle>
                <CardDescription>
                  Your current usage statistics
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm text-slate-500">Conversions</p>
                    <p className="text-2xl font-bold">
                      {usageStats?.conversionsUsed || 0}
                      <span className="text-lg font-normal text-slate-400">
                        /{usageStats?.conversionsLimit === Infinity ? '∞' : usageStats?.conversionsLimit || 10}
                      </span>
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Storage Used</p>
                    <p className="text-2xl font-bold">
                      {((usageStats?.storageUsed || 0) / (1024 * 1024 * 1024)).toFixed(2)} GB
                      <span className="text-lg font-normal text-slate-400">
                        /{((usageStats?.storageLimit || 0) / (1024 * 1024 * 1024)).toFixed(0)} GB
                      </span>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Payment Method</CardTitle>
                <CardDescription>
                  Manage your payment information
                </CardDescription>
              </CardHeader>
              <CardContent>
                {usageStats?.tier === 'free' ? (
                  <div className="text-center py-6">
                    <CreditCard className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500">No payment method on file</p>
                    <Link href="/pricing">
                      <Button variant="link" className="mt-2">
                        Add payment method to upgrade →
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-16 bg-gradient-to-r from-blue-600 to-blue-800 rounded flex items-center justify-center text-white text-xs font-bold">
                        VISA
                      </div>
                      <div>
                        <p className="font-medium">•••• •••• •••• 4242</p>
                        <p className="text-sm text-slate-500">Expires 12/25</p>
                      </div>
                    </div>
                    <Button variant="outline" onClick={() => toast.info("Feature coming soon!")}>
                      Update
                    </Button>
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
