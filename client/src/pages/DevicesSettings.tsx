import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Smartphone,
  Laptop,
  Tablet,
  Monitor,
  HelpCircle,
  Pencil,
  Trash2,
  RefreshCw,
  Cloud,
  CloudOff,
  Check,
  Loader2,
} from "lucide-react";

interface Device {
  id: number;
  deviceId: string;
  deviceName: string | null;
  deviceType: "desktop" | "laptop" | "tablet" | "mobile" | "other";
  browser?: string | null;
  os?: string | null;
  ipAddress?: string | null;
  syncEnabled: boolean;
  pushEnabled: boolean;
  lastActiveAt: Date;
  lastSyncAt?: Date | null;
  createdAt: Date;
}

function getDeviceIcon(type: string) {
  switch (type) {
    case "mobile":
      return <Smartphone className="h-5 w-5" />;
    case "tablet":
      return <Tablet className="h-5 w-5" />;
    case "laptop":
      return <Laptop className="h-5 w-5" />;
    case "desktop":
      return <Monitor className="h-5 w-5" />;
    default:
      return <HelpCircle className="h-5 w-5" />;
  }
}

function formatDate(date: Date | string | undefined): string {
  if (!date) return "Never";
  const d = new Date(date);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getRelativeTime(date: Date | string | undefined): string {
  if (!date) return "Never";
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  return formatDate(date);
}

export default function DevicesSettings() {
  const { user } = useAuth();
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [newDeviceName, setNewDeviceName] = useState("");
  const [deviceToRemove, setDeviceToRemove] = useState<Device | null>(null);
  const [currentDeviceId] = useState(() => localStorage.getItem("deviceId") || "");

  const { data: devices, isLoading, refetch } = trpc.sync.getDevices.useQuery(undefined, {
    enabled: !!user,
  });

  const { data: syncStatus } = trpc.sync.getStatus.useQuery(undefined, {
    enabled: !!user,
  });

  const updateDevice = trpc.sync.updateDevice.useMutation({
    onSuccess: () => {
      toast.success("Device updated successfully");
      refetch();
      setEditingDevice(null);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update device");
    },
  });

  const removeDevice = trpc.sync.removeDevice.useMutation({
    onSuccess: () => {
      toast.success("Device removed successfully");
      refetch();
      setDeviceToRemove(null);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to remove device");
    },
  });

  const handleEditDevice = (device: Device) => {
    setEditingDevice(device);
    setNewDeviceName(device.deviceName || "");
  };

  const handleSaveDeviceName = () => {
    if (!editingDevice || !newDeviceName.trim()) return;
    updateDevice.mutate({
      deviceId: editingDevice.deviceId,
      deviceName: newDeviceName.trim(),
    });
  };

  const handleToggleSync = (device: Device, enabled: boolean) => {
    updateDevice.mutate({
      deviceId: device.deviceId,
      syncEnabled: enabled,
    });
  };

  const handleTogglePush = (device: Device, enabled: boolean) => {
    updateDevice.mutate({
      deviceId: device.deviceId,
      pushEnabled: enabled,
    });
  };

  const handleRemoveDevice = () => {
    if (!deviceToRemove) return;
    removeDevice.mutate({ deviceId: deviceToRemove.deviceId });
  };

  if (!user) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">Please log in to manage devices</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container max-w-4xl py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Device Management</h1>
          <p className="text-muted-foreground mt-2">
            Manage your synced devices and control how your data is synchronized across them.
          </p>
        </div>

        {/* Sync Status Overview */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cloud className="h-5 w-5 text-blue-500" />
              Sync Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <div className="text-2xl font-bold">{syncStatus?.deviceCount || 0}</div>
                <div className="text-sm text-muted-foreground">Devices</div>
              </div>
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <div className="text-2xl font-bold">{syncStatus?.pendingChanges || 0}</div>
                <div className="text-sm text-muted-foreground">Pending Changes</div>
              </div>
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <div className="text-2xl font-bold">{syncStatus?.conflicts || 0}</div>
                <div className="text-sm text-muted-foreground">Conflicts</div>
              </div>
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <div className="text-sm font-medium">
                  {syncStatus?.lastSync ? getRelativeTime(syncStatus.lastSync) : "Never"}
                </div>
                <div className="text-sm text-muted-foreground">Last Sync</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Devices List */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Your Devices</CardTitle>
                <CardDescription>
                  Devices that have access to your ProPDFs account
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !devices || devices.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CloudOff className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No devices registered yet</p>
                <p className="text-sm mt-2">
                  Devices will appear here when you log in from different browsers or devices.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {devices.map((device: Device) => {
                  const isCurrentDevice = device.deviceId === currentDeviceId;
                  return (
                    <div
                      key={device.id}
                      className={`flex items-start gap-4 p-4 rounded-lg border ${
                        isCurrentDevice ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20" : ""
                      }`}
                    >
                      <div className="flex-shrink-0 p-2 bg-muted rounded-lg">
                        {getDeviceIcon(device.deviceType)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium truncate">{device.deviceName || "Unknown Device"}</h3>
                          {isCurrentDevice && (
                            <Badge variant="secondary" className="text-xs">
                              <Check className="h-3 w-3 mr-1" />
                              This Device
                            </Badge>
                          )}
                          {device.syncEnabled && (
                            <Badge variant="outline" className="text-xs text-green-600">
                              Sync On
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground space-y-1">
                          <p>
                            {device.browser && device.os
                              ? `${device.browser} on ${device.os}`
                              : device.deviceType}
                          </p>
                          <p>Last active: {getRelativeTime(device.lastActiveAt)}</p>
                          {device.lastSyncAt && (
                            <p>Last sync: {getRelativeTime(device.lastSyncAt)}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditDevice(device)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {!isCurrentDevice && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeviceToRemove(device)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Edit Device Dialog */}
        <Dialog open={!!editingDevice} onOpenChange={() => setEditingDevice(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Device</DialogTitle>
              <DialogDescription>
                Update the name and sync settings for this device.
              </DialogDescription>
            </DialogHeader>
            {editingDevice && (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="deviceName">Device Name</Label>
                  <Input
                    id="deviceName"
                    value={newDeviceName}
                    onChange={(e) => setNewDeviceName(e.target.value)}
                    placeholder="Enter device name"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Enable Sync</Label>
                    <p className="text-sm text-muted-foreground">
                      Sync files and settings with this device
                    </p>
                  </div>
                  <Switch
                    checked={editingDevice.syncEnabled}
                    onCheckedChange={(checked) => handleToggleSync(editingDevice, checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Push Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Receive notifications on this device
                    </p>
                  </div>
                  <Switch
                    checked={editingDevice.pushEnabled}
                    onCheckedChange={(checked) => handleTogglePush(editingDevice, checked)}
                  />
                </div>
                <div className="pt-4 border-t">
                  <h4 className="text-sm font-medium mb-2">Device Information</h4>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>Type: {editingDevice.deviceType}</p>
                    {editingDevice.browser && <p>Browser: {editingDevice.browser}</p>}
                    {editingDevice.os && <p>OS: {editingDevice.os}</p>}
                    <p>Registered: {formatDate(editingDevice.createdAt)}</p>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingDevice(null)}>
                Cancel
              </Button>
              <Button onClick={handleSaveDeviceName} disabled={updateDevice.isPending}>
                {updateDevice.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Remove Device Confirmation */}
        <AlertDialog open={!!deviceToRemove} onOpenChange={() => setDeviceToRemove(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove Device</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to remove "{deviceToRemove?.deviceName || 'this device'}" from your account?
                This device will no longer be able to sync with your ProPDFs account.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRemoveDevice}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {removeDevice.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Remove Device
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
