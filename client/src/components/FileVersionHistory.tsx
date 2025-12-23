import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  History,
  Clock,
  Download,
  RotateCcw,
  Shield,
  ShieldOff,
  Trash2,
  GitCompare,
  FileText,
  Loader2,
  ChevronRight,
  Calendar,
  HardDrive,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

interface Snapshot {
  id: number;
  snapshotNumber: number;
  type: "auto" | "manual" | "pre_edit";
  description?: string | null;
  fileSize: number | bigint;
  checksum?: string | null;
  createdAt: Date;
  isProtected: boolean;
  expiresAt?: Date | null;
}

interface FileVersionHistoryProps {
  fileId: number;
  fileName: string;
  onClose?: () => void;
}

function formatFileSize(bytes: number | bigint): string {
  const size = Number(bytes);
  if (size === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(size) / Math.log(k));
  return parseFloat((size / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getRelativeTime(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(date);
}

function getSnapshotTypeLabel(type: string): { label: string; color: string } {
  switch (type) {
    case "auto":
      return { label: "Auto", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" };
    case "manual":
      return { label: "Manual", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" };
    case "pre_edit":
      return { label: "Pre-Edit", color: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" };
    default:
      return { label: type, color: "bg-gray-100 text-gray-700" };
  }
}

export function FileVersionHistory({ fileId, fileName, onClose }: FileVersionHistoryProps) {
  const [selectedSnapshot, setSelectedSnapshot] = useState<Snapshot | null>(null);
  const [snapshotToRestore, setSnapshotToRestore] = useState<Snapshot | null>(null);
  const [snapshotToDelete, setSnapshotToDelete] = useState<Snapshot | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareSnapshots, setCompareSnapshots] = useState<[number | null, number | null]>([null, null]);

  const { data: timeline, isLoading, refetch } = trpc.recovery.getTimeline.useQuery(
    { fileId },
    { enabled: !!fileId }
  );

  const { data: storageUsage } = trpc.recovery.getStorageUsage.useQuery();

  const { data: comparisonResult } = trpc.recovery.compare.useQuery(
    { snapshotId1: compareSnapshots[0]!, snapshotId2: compareSnapshots[1]! },
    { enabled: compareSnapshots[0] !== null && compareSnapshots[1] !== null }
  );

  const restoreMutation = trpc.recovery.restore.useMutation({
    onSuccess: () => {
      toast.success("File restored successfully");
      refetch();
      setSnapshotToRestore(null);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to restore file");
    },
  });

  const deleteMutation = trpc.recovery.deleteSnapshot.useMutation({
    onSuccess: () => {
      toast.success("Snapshot deleted");
      refetch();
      setSnapshotToDelete(null);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete snapshot");
    },
  });

  const protectionMutation = trpc.recovery.setProtection.useMutation({
    onSuccess: (_, variables) => {
      toast.success(variables.isProtected ? "Snapshot protected" : "Protection removed");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update protection");
    },
  });

  const handleRestore = () => {
    if (!snapshotToRestore) return;
    restoreMutation.mutate({ snapshotId: snapshotToRestore.id });
  };

  const handleDelete = () => {
    if (!snapshotToDelete) return;
    deleteMutation.mutate({ snapshotId: snapshotToDelete.id });
  };

  const handleToggleProtection = (snapshot: Snapshot) => {
    protectionMutation.mutate({
      snapshotId: snapshot.id,
      isProtected: !snapshot.isProtected,
    });
  };

  const handleCompareSelect = (snapshotId: number) => {
    if (compareSnapshots[0] === null) {
      setCompareSnapshots([snapshotId, null]);
    } else if (compareSnapshots[1] === null) {
      setCompareSnapshots([compareSnapshots[0], snapshotId]);
    } else {
      setCompareSnapshots([snapshotId, null]);
    }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Version History
            </CardTitle>
            <CardDescription className="mt-1">
              {fileName} - {timeline?.length || 0} versions available
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={compareMode ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setCompareMode(!compareMode);
                setCompareSnapshots([null, null]);
              }}
            >
              <GitCompare className="h-4 w-4 mr-2" />
              Compare
            </Button>
            {onClose && (
              <Button variant="ghost" size="sm" onClick={onClose}>
                Close
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Storage Usage Summary */}
        {storageUsage && (
          <div className="mb-4 p-3 bg-muted/50 rounded-lg flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-muted-foreground" />
              <span>{storageUsage.totalSnapshots} snapshots</span>
            </div>
            <div className="flex items-center gap-4">
              <span>{formatFileSize(storageUsage.totalSizeBytes)} used</span>
              <span className="text-muted-foreground">
                {storageUsage.protectedSnapshots} protected
              </span>
            </div>
          </div>
        )}

        {/* Compare Mode Info */}
        {compareMode && (
          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              {compareSnapshots[0] === null
                ? "Select the first version to compare"
                : compareSnapshots[1] === null
                ? "Select the second version to compare"
                : "Comparison ready"}
            </p>
            {compareSnapshots[0] !== null && compareSnapshots[1] !== null && comparisonResult && (
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <div className="p-2 bg-white dark:bg-gray-800 rounded">
                  <div className="font-medium">Size Change</div>
                  <div className={comparisonResult.sizeChange > 0 ? "text-red-600" : "text-green-600"}>
                    {comparisonResult.sizeChange > 0 ? "+" : ""}
                    {formatFileSize(Math.abs(comparisonResult.sizeChange))}
                  </div>
                </div>
                <div className="p-2 bg-white dark:bg-gray-800 rounded">
                  <div className="font-medium">Time Diff</div>
                  <div>{Math.round(comparisonResult.timeDiff / 3600000)}h</div>
                </div>
                <div className="p-2 bg-white dark:bg-gray-800 rounded">
                  <div className="font-medium">Content</div>
                  <div className={comparisonResult.isIdentical ? "text-green-600" : "text-amber-600"}>
                    {comparisonResult.isIdentical ? "Identical" : "Different"}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Timeline */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !timeline || timeline.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No version history available</p>
            <p className="text-sm mt-2">
              Versions are created automatically when you edit the file.
            </p>
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />

              {/* Timeline items */}
              <div className="space-y-4">
                {timeline.map((snapshot: Snapshot, index: number) => {
                  const typeInfo = getSnapshotTypeLabel(snapshot.type);
                  const isSelected = compareMode && (
                    compareSnapshots[0] === snapshot.id || compareSnapshots[1] === snapshot.id
                  );
                  const isFirst = index === 0;

                  return (
                    <div
                      key={snapshot.id}
                      className={`relative pl-10 ${
                        isSelected ? "bg-blue-50 dark:bg-blue-950/30 -mx-2 px-12 py-2 rounded-lg" : ""
                      }`}
                    >
                      {/* Timeline dot */}
                      <div
                        className={`absolute left-2.5 w-3 h-3 rounded-full border-2 ${
                          isFirst
                            ? "bg-green-500 border-green-500"
                            : isSelected
                            ? "bg-blue-500 border-blue-500"
                            : "bg-background border-border"
                        }`}
                      />

                      <div
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                          isSelected
                            ? "border-blue-500"
                            : "hover:border-primary/50 hover:bg-muted/50"
                        }`}
                        onClick={() => {
                          if (compareMode) {
                            handleCompareSelect(snapshot.id);
                          } else {
                            setSelectedSnapshot(snapshot);
                          }
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium">Version {snapshot.snapshotNumber}</span>
                              <Badge className={`text-xs ${typeInfo.color}`}>
                                {typeInfo.label}
                              </Badge>
                              {snapshot.isProtected && (
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Shield className="h-3.5 w-3.5 text-blue-500" />
                                  </TooltipTrigger>
                                  <TooltipContent>Protected from auto-cleanup</TooltipContent>
                                </Tooltip>
                              )}
                              {isFirst && (
                                <Badge variant="secondary" className="text-xs">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Current
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground flex items-center gap-3">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5" />
                                {getRelativeTime(snapshot.createdAt)}
                              </span>
                              <span className="flex items-center gap-1">
                                <HardDrive className="h-3.5 w-3.5" />
                                {formatFileSize(snapshot.fileSize)}
                              </span>
                            </div>
                            {snapshot.description && (
                              <p className="text-sm text-muted-foreground mt-1 truncate">
                                {snapshot.description}
                              </p>
                            )}
                            {snapshot.expiresAt && (
                              <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                Expires {formatDate(snapshot.expiresAt)}
                              </p>
                            )}
                          </div>
                          {!compareMode && (
                            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </ScrollArea>
        )}
      </CardContent>

      {/* Snapshot Details Dialog */}
      <Dialog open={!!selectedSnapshot} onOpenChange={() => setSelectedSnapshot(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Version {selectedSnapshot?.snapshotNumber}</DialogTitle>
            <DialogDescription>
              Created {selectedSnapshot && formatDate(selectedSnapshot.createdAt)}
            </DialogDescription>
          </DialogHeader>
          {selectedSnapshot && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="text-sm text-muted-foreground">Type</div>
                  <div className="font-medium">
                    {getSnapshotTypeLabel(selectedSnapshot.type).label}
                  </div>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="text-sm text-muted-foreground">Size</div>
                  <div className="font-medium">{formatFileSize(selectedSnapshot.fileSize)}</div>
                </div>
              </div>
              {selectedSnapshot.description && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="text-sm text-muted-foreground">Description</div>
                  <div className="font-medium">{selectedSnapshot.description}</div>
                </div>
              )}
              {selectedSnapshot.checksum && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="text-sm text-muted-foreground">Checksum (SHA-256)</div>
                  <div className="font-mono text-xs break-all">{selectedSnapshot.checksum}</div>
                </div>
              )}
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div>
                  <div className="font-medium">Protection</div>
                  <div className="text-sm text-muted-foreground">
                    Prevent automatic cleanup
                  </div>
                </div>
                <Switch
                  checked={selectedSnapshot.isProtected}
                  onCheckedChange={() => handleToggleProtection(selectedSnapshot)}
                />
              </div>
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="text-destructive"
              onClick={() => {
                setSnapshotToDelete(selectedSnapshot);
                setSelectedSnapshot(null);
              }}
              disabled={selectedSnapshot?.isProtected}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setSnapshotToRestore(selectedSnapshot);
                setSelectedSnapshot(null);
              }}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Restore This Version
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore Confirmation */}
      <AlertDialog open={!!snapshotToRestore} onOpenChange={() => setSnapshotToRestore(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore Version {snapshotToRestore?.snapshotNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace the current file with version {snapshotToRestore?.snapshotNumber} from{" "}
              {snapshotToRestore && formatDate(snapshotToRestore.createdAt)}.
              A backup of the current version will be created automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestore}>
              {restoreMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!snapshotToDelete} onOpenChange={() => setSnapshotToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Version {snapshotToDelete?.snapshotNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This version will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export default FileVersionHistory;
