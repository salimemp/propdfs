import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { 
  Cloud, 
  Link2, 
  Unlink, 
  RefreshCw, 
  CheckCircle2, 
  XCircle,
  HardDrive,
  Loader2
} from "lucide-react";

type CloudProvider = "google_drive" | "onedrive" | "dropbox" | "box";

interface ProviderConfig {
  id: CloudProvider;
  name: string;
  icon: string;
  color: string;
  description: string;
}

const providers: ProviderConfig[] = [
  {
    id: "google_drive",
    name: "Google Drive",
    icon: "https://upload.wikimedia.org/wikipedia/commons/1/12/Google_Drive_icon_%282020%29.svg",
    color: "#4285F4",
    description: "Connect your Google Drive to import and export files directly.",
  },
  {
    id: "onedrive",
    name: "OneDrive",
    icon: "https://upload.wikimedia.org/wikipedia/commons/3/3c/Microsoft_Office_OneDrive_%282019%E2%80%93present%29.svg",
    color: "#0078D4",
    description: "Sync with Microsoft OneDrive for seamless file management.",
  },
  {
    id: "dropbox",
    name: "Dropbox",
    icon: "https://upload.wikimedia.org/wikipedia/commons/7/78/Dropbox_Icon.svg",
    color: "#0061FF",
    description: "Access your Dropbox files for easy conversions.",
  },
  {
    id: "box",
    name: "Box",
    icon: "https://upload.wikimedia.org/wikipedia/commons/5/57/Box%2C_Inc._logo.svg",
    color: "#0061D5",
    description: "Connect to Box for enterprise file management.",
  },
];

interface CloudConnection {
  id: number;
  provider: CloudProvider;
  accountEmail: string | null;
  accountName: string | null;
  isActive: boolean;
  lastSyncAt: Date | null;
  storageUsed?: number | null;
  storageLimit?: number | null;
}

export default function CloudStorageSettings() {
  const { user } = useAuth();
  const [disconnectProvider, setDisconnectProvider] = useState<CloudProvider | null>(null);
  const [connectingProvider, setConnectingProvider] = useState<CloudProvider | null>(null);

  // Fetch connected accounts
  const { data: connections, isLoading, refetch } = trpc.cloudStorage.listConnections.useQuery(
    undefined,
    { enabled: !!user }
  );

  // Get auth URL mutation
  const getAuthUrl = trpc.cloudStorage.getAuthUrl.useMutation({
    onSuccess: (data) => {
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    },
    onError: (error) => {
      toast.error("Failed to connect: " + error.message);
      setConnectingProvider(null);
    },
  });

  // Disconnect mutation
  const disconnect = trpc.cloudStorage.disconnect.useMutation({
    onSuccess: () => {
      toast.success("Account disconnected successfully");
      refetch();
      setDisconnectProvider(null);
    },
    onError: (error) => {
      toast.error("Failed to disconnect: " + error.message);
    },
  });

  const handleConnect = (provider: CloudProvider) => {
    setConnectingProvider(provider);
    getAuthUrl.mutate({ provider });
  };

  const handleDisconnect = (provider: CloudProvider) => {
    setDisconnectProvider(provider);
  };

  const confirmDisconnect = () => {
    if (disconnectProvider) {
      disconnect.mutate({ provider: disconnectProvider });
    }
  };

  const getConnectionForProvider = (provider: CloudProvider) => {
    return connections?.find((c) => c.provider === provider && c.isActive);
  };

  const formatStorageSize = (bytes: number | null): string => {
    if (bytes === null) return "Unknown";
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(1)} GB`;
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const formatLastSync = (dateStr: string | null): string => {
    if (!dateStr) return "Never";
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? "s" : ""} ago`;
  };

  return (
    <DashboardLayout>
      <div className="container max-w-4xl py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Cloud className="h-8 w-8 text-primary" />
            Cloud Storage
          </h1>
          <p className="text-muted-foreground mt-2">
            Connect your cloud storage accounts to import and export files directly.
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid gap-6">
            {providers.map((provider) => {
              const connection = getConnectionForProvider(provider.id);
              const isConnected = !!connection;
              const isConnecting = connectingProvider === provider.id;

              return (
                <Card key={provider.id} className="overflow-hidden">
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4">
                        <div 
                          className="w-12 h-12 rounded-lg flex items-center justify-center p-2"
                          style={{ backgroundColor: `${provider.color}15` }}
                        >
                          <img 
                            src={provider.icon} 
                            alt={provider.name}
                            className="w-8 h-8 object-contain"
                          />
                        </div>
                        <div>
                          <CardTitle className="text-lg flex items-center gap-2">
                            {provider.name}
                            {isConnected ? (
                              <Badge variant="default" className="bg-green-500/10 text-green-600 hover:bg-green-500/20">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Connected
                              </Badge>
                            ) : (
                              <Badge variant="secondary">
                                <XCircle className="h-3 w-3 mr-1" />
                                Not connected
                              </Badge>
                            )}
                          </CardTitle>
                          <CardDescription className="mt-1">
                            {provider.description}
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isConnected ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => refetch()}
                            >
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Sync
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDisconnect(provider.id)}
                            >
                              <Unlink className="h-4 w-4 mr-2" />
                              Disconnect
                            </Button>
                          </>
                        ) : (
                          <Button
                            onClick={() => handleConnect(provider.id)}
                            disabled={isConnecting}
                            style={{ backgroundColor: provider.color }}
                            className="text-white hover:opacity-90"
                          >
                            {isConnecting ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Link2 className="h-4 w-4 mr-2" />
                            )}
                            Connect
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  
                  {isConnected && connection && (
                    <CardContent className="pt-0">
                      <div className="bg-muted/50 rounded-lg p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Account</p>
                          <p className="text-sm font-medium truncate">
                            {connection.accountEmail || connection.accountName || "Unknown"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Last Synced</p>
                          <p className="text-sm font-medium">
                            {formatLastSync(connection.lastSyncAt?.toString() || null)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Storage</p>
                          <p className="text-sm font-medium flex items-center gap-1">
                            <HardDrive className="h-3 w-3" />
                            Connected
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Status</p>
                          <p className="text-sm font-medium text-green-600 flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-green-500"></span>
                            Active
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        {/* Disconnect Confirmation Dialog */}
        <AlertDialog open={!!disconnectProvider} onOpenChange={() => setDisconnectProvider(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Disconnect {providers.find(p => p.id === disconnectProvider)?.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove the connection to your {providers.find(p => p.id === disconnectProvider)?.name} account. 
                You can reconnect at any time, but you'll need to authorize access again.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDisconnect}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Disconnect
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Help Section */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="text-lg">Need Help?</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              <strong>Connecting accounts:</strong> Click the "Connect" button to authorize ProPDFs to access your cloud storage. 
              You'll be redirected to the provider's login page.
            </p>
            <p>
              <strong>Importing files:</strong> Once connected, you can import files from your cloud storage in the Convert or Files pages.
            </p>
            <p>
              <strong>Exporting files:</strong> After converting a file, you can save it directly to your connected cloud storage.
            </p>
            <p>
              <strong>Privacy:</strong> ProPDFs only accesses files you explicitly select. We never browse or store your files without your permission.
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
