import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Share2,
  Link,
  Mail,
  MoreHorizontal,
  Copy,
  Trash2,
  Eye,
  Download,
  Edit,
  Calendar,
  Lock,
  Unlock,
  Users,
  BarChart3,
  RefreshCw,
  Search,
  Filter,
  FileText,
  ExternalLink,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

interface Share {
  id: number;
  fileId: number;
  fileName: string;
  shareType: string;
  permission: string;
  shareToken: string;
  isPublic: boolean;
  hasPassword?: boolean;
  expiresAt: Date | null;
  maxDownloads?: number | null;
  maxViews?: number | null;
  downloadCount: number;
  viewCount: number;
  createdAt: Date;
  isActive: boolean;
  recipientCount?: number;
}

interface ShareAnalytics {
  totalViews: number;
  totalDownloads: number;
  uniqueVisitors: number;
  recentAccess: Array<{
    timestamp: Date;
    action: string;
    ip?: string;
    userAgent?: string;
  }>;
}

export default function SharedFilesManager() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "link" | "email" | "team">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "expired">("all");
  const [selectedShare, setSelectedShare] = useState<Share | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showAnalyticsDialog, setShowAnalyticsDialog] = useState(false);
  const [showRevokeDialog, setShowRevokeDialog] = useState(false);

  // Edit form state
  const [editPermission, setEditPermission] = useState<"view" | "download" | "edit" | "comment">("view");
  const [editExpiration, setEditExpiration] = useState<string>("");
  const [editMaxDownloads, setEditMaxDownloads] = useState<string>("");
  const [editMaxViews, setEditMaxViews] = useState<string>("");
  const [editPassword, setEditPassword] = useState<string>("");
  const [editHasPassword, setEditHasPassword] = useState(false);

  // Fetch user's shares
  const { data: shares, refetch: refetchShares, isLoading } = trpc.sharing.list.useQuery();

  // Fetch analytics for selected share
  const { data: analytics, isLoading: analyticsLoading } = trpc.sharing.getAnalytics.useQuery(
    { shareId: selectedShare?.id || 0 },
    { enabled: !!selectedShare && showAnalyticsDialog }
  );

  // Mutations
  const updateShare = trpc.sharing.update.useMutation({
    onSuccess: () => {
      toast.success("Share settings updated");
      setShowEditDialog(false);
      refetchShares();
    },
    onError: (error: any) => {
      toast.error(`Failed to update share: ${error.message}`);
    },
  });

  const revokeShare = trpc.sharing.revoke.useMutation({
    onSuccess: () => {
      toast.success("Share revoked successfully");
      setShowRevokeDialog(false);
      setSelectedShare(null);
      refetchShares();
    },
    onError: (error: any) => {
      toast.error(`Failed to revoke share: ${error.message}`);
    },
  });

  const handleCopyLink = (shareToken: string) => {
    const shareUrl = `${window.location.origin}/share/${shareToken}`;
    navigator.clipboard.writeText(shareUrl);
    toast.success("Share link copied to clipboard");
  };

  const handleEditShare = (share: Share) => {
    setSelectedShare(share);
    setEditPermission(share.permission as "view" | "download" | "edit" | "comment");
    setEditExpiration(share.expiresAt ? new Date(share.expiresAt).toISOString().split("T")[0] : "");
    setEditMaxDownloads(share.maxDownloads?.toString() || "");
    setEditMaxViews(share.maxViews?.toString() || "");
    setEditHasPassword(share.hasPassword || false);
    setEditPassword("");
    setShowEditDialog(true);
  };

  const handleSaveEdit = () => {
    if (!selectedShare) return;

    updateShare.mutate({
      shareId: selectedShare.id,
      permission: editPermission,
      expiresAt: editExpiration ? new Date(editExpiration) : null,
      maxDownloads: editMaxDownloads ? parseInt(editMaxDownloads) : null,
      maxViews: editMaxViews ? parseInt(editMaxViews) : null,
      password: editHasPassword && editPassword ? editPassword : null,
    });
  };

  const handleRevokeShare = () => {
    if (!selectedShare) return;
    revokeShare.mutate({ shareId: selectedShare.id });
  };

  const handleViewAnalytics = (share: Share) => {
    setSelectedShare(share);
    setShowAnalyticsDialog(true);
  };

  // Filter shares
  const filteredShares = shares?.filter((share: Share) => {
    // Search filter
    if (searchQuery && !share.fileName.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    // Type filter
    if (filterType !== "all" && share.shareType !== filterType) {
      return false;
    }
    // Status filter
    if (filterStatus === "active" && !share.isActive) {
      return false;
    }
    if (filterStatus === "expired" && share.isActive) {
      return false;
    }
    return true;
  }) || [];

  const getPermissionBadge = (permission: string) => {
    switch (permission) {
      case "view": return <Badge variant="secondary"><Eye className="h-3 w-3 mr-1" />View</Badge>;
      case "download": return <Badge variant="secondary"><Download className="h-3 w-3 mr-1" />Download</Badge>;
      case "edit": return <Badge><Edit className="h-3 w-3 mr-1" />Edit</Badge>;
      case "comment": return <Badge variant="outline"><FileText className="h-3 w-3 mr-1" />Comment</Badge>;
      default: return <Badge variant="outline">{permission}</Badge>;
    }
  };

  const getShareTypeBadge = (type: string) => {
    switch (type) {
      case "link": return <Badge variant="outline"><Link className="h-3 w-3 mr-1" />Link</Badge>;
      case "email": return <Badge variant="outline"><Mail className="h-3 w-3 mr-1" />Email</Badge>;
      case "team": return <Badge variant="outline"><Users className="h-3 w-3 mr-1" />Team</Badge>;
      default: return <Badge variant="outline">{type}</Badge>;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Shared Files</h1>
            <p className="text-muted-foreground">
              Manage your shared files and links
            </p>
          </div>
          <Button onClick={() => refetchShares()} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by file name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={filterType} onValueChange={(v) => setFilterType(v as any)}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Share type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="link">Link</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="team">Team</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Shares Table */}
        <Card>
          <CardHeader>
            <CardTitle>Your Shared Files</CardTitle>
            <CardDescription>
              {filteredShares.length} share{filteredShares.length !== 1 ? "s" : ""} found
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredShares.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                <Share2 className="h-8 w-8 mb-2" />
                <p>No shared files found</p>
              </div>
            ) : (
              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>File</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Permission</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Views/Downloads</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredShares.map((share: Share) => (
                      <TableRow key={share.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium truncate max-w-[200px]">
                              {share.fileName}
                            </span>
                            {share.hasPassword && (
                              <Lock className="h-3 w-3 text-muted-foreground" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{getShareTypeBadge(share.shareType)}</TableCell>
                        <TableCell>{getPermissionBadge(share.permission)}</TableCell>
                        <TableCell>
                          {share.isActive ? (
                            <Badge className="bg-green-500">Active</Badge>
                          ) : (
                            <Badge variant="secondary">Expired</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-sm">
                            <Eye className="h-3 w-3" /> {share.viewCount}
                            <span className="text-muted-foreground">/</span>
                            <Download className="h-3 w-3" /> {share.downloadCount}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(share.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleCopyLink(share.shareToken)}>
                                <Copy className="h-4 w-4 mr-2" />
                                Copy Link
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => window.open(`/share/${share.shareToken}`, "_blank")}>
                                <ExternalLink className="h-4 w-4 mr-2" />
                                Open Link
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleViewAnalytics(share)}>
                                <BarChart3 className="h-4 w-4 mr-2" />
                                View Analytics
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleEditShare(share)}>
                                <Edit className="h-4 w-4 mr-2" />
                                Edit Settings
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedShare(share);
                                  setShowRevokeDialog(true);
                                }}
                                className="text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Revoke Share
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Edit Share Dialog */}
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Share Settings</DialogTitle>
              <DialogDescription>
                Update the settings for this shared file
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Permission</Label>
                <Select value={editPermission} onValueChange={(v) => setEditPermission(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="view">View Only</SelectItem>
                    <SelectItem value="download">Download</SelectItem>
                    <SelectItem value="edit">Edit</SelectItem>
                    <SelectItem value="comment">Comment</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Expiration Date</Label>
                <Input
                  type="date"
                  value={editExpiration}
                  onChange={(e) => setEditExpiration(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Max Downloads</Label>
                  <Input
                    type="number"
                    placeholder="Unlimited"
                    value={editMaxDownloads}
                    onChange={(e) => setEditMaxDownloads(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max Views</Label>
                  <Input
                    type="number"
                    placeholder="Unlimited"
                    value={editMaxViews}
                    onChange={(e) => setEditMaxViews(e.target.value)}
                  />
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Password Protection</Label>
                  <p className="text-sm text-muted-foreground">
                    Require a password to access
                  </p>
                </div>
                <Switch
                  checked={editHasPassword}
                  onCheckedChange={setEditHasPassword}
                />
              </div>

              {editHasPassword && (
                <div className="space-y-2">
                  <Label>New Password</Label>
                  <Input
                    type="password"
                    placeholder={selectedShare?.hasPassword ? "Leave blank to keep current" : "Enter password"}
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveEdit} disabled={updateShare.isPending}>
                {updateShare.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Analytics Dialog */}
        <Dialog open={showAnalyticsDialog} onOpenChange={setShowAnalyticsDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Share Analytics</DialogTitle>
              <DialogDescription>
                {selectedShare?.fileName}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {analyticsLoading ? (
                <div className="flex items-center justify-center h-32">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : analytics ? (
                <>
                  <div className="grid grid-cols-3 gap-4">
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-center">
                          <Eye className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                          <div className="text-2xl font-bold">{analytics.totalViews}</div>
                          <p className="text-sm text-muted-foreground">Total Views</p>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-center">
                          <Download className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                          <div className="text-2xl font-bold">{analytics.totalDownloads}</div>
                          <p className="text-sm text-muted-foreground">Downloads</p>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-center">
                          <Users className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                          <div className="text-2xl font-bold">{analytics.uniqueViewers}</div>
                          <p className="text-sm text-muted-foreground">Unique Visitors</p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Recent Access</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-[200px]">
                        {analytics.recentAccess && analytics.recentAccess.length > 0 ? (
                          <div className="space-y-2">
                            {analytics.recentAccess.map((access: any, index: number) => (
                              <div key={index} className="flex items-center justify-between text-sm border-b pb-2">
                                <div className="flex items-center gap-2">
                                  {access.action === "view" ? (
                                    <Eye className="h-4 w-4 text-muted-foreground" />
                                  ) : (
                                    <Download className="h-4 w-4 text-muted-foreground" />
                                  )}
                                  <span className="capitalize">{access.action}</span>
                                </div>
                                <span className="text-muted-foreground">
                                  {new Date(access.timestamp).toLocaleString()}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-center text-muted-foreground">No recent access</p>
                        )}
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </>
              ) : (
                <p className="text-center text-muted-foreground">No analytics available</p>
              )}
            </div>
            <DialogFooter>
              <Button onClick={() => setShowAnalyticsDialog(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Revoke Share Dialog */}
        <Dialog open={showRevokeDialog} onOpenChange={setShowRevokeDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Revoke Share</DialogTitle>
              <DialogDescription>
                Are you sure you want to revoke this share? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <p className="text-sm">
                File: <span className="font-medium">{selectedShare?.fileName}</span>
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Anyone with the share link will no longer be able to access this file.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRevokeDialog(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleRevokeShare}
                disabled={revokeShare.isPending}
              >
                {revokeShare.isPending ? "Revoking..." : "Revoke Share"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
