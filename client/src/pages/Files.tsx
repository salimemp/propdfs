import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { 
  FileText, FolderOpen, Upload, Search, Grid, List,
  MoreVertical, Download, Trash2, Tag, Share2, Eye,
  Plus, FolderPlus, Loader2, Clock, Filter
} from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

export default function Files() {
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      window.location.href = getLoginUrl();
    }
  }, [authLoading, isAuthenticated]);

  const { data: files, isLoading: filesLoading, refetch: refetchFiles } = trpc.files.list.useQuery(
    { folderId: currentFolderId, search: searchQuery || undefined, limit: 50 },
    { enabled: isAuthenticated }
  );

  const { data: folders, isLoading: foldersLoading, refetch: refetchFolders } = trpc.folders.list.useQuery(
    { parentId: currentFolderId },
    { enabled: isAuthenticated }
  );

  const { data: tags } = trpc.tags.list.useQuery(undefined, { enabled: isAuthenticated });

  const createFolderMutation = trpc.folders.create.useMutation({
    onSuccess: () => {
      toast.success("Folder created successfully");
      setIsCreateFolderOpen(false);
      setNewFolderName("");
      refetchFolders();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteFileMutation = trpc.files.delete.useMutation({
    onSuccess: () => {
      toast.success("File deleted successfully");
      refetchFiles();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) {
      toast.error("Please enter a folder name");
      return;
    }
    createFolderMutation.mutate({
      name: newFolderName.trim(),
      parentId: currentFolderId || undefined,
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.includes('pdf')) return '📄';
    if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
    if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📊';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📽️';
    return '📁';
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">My Files</h1>
            <p className="text-slate-600 mt-1">
              Manage and organize your documents
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Dialog open={isCreateFolderOpen} onOpenChange={setIsCreateFolderOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <FolderPlus className="h-4 w-4" />
                  New Folder
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Folder</DialogTitle>
                  <DialogDescription>
                    Enter a name for your new folder
                  </DialogDescription>
                </DialogHeader>
                <Input
                  placeholder="Folder name"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                />
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreateFolderOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateFolder} disabled={createFolderMutation.isPending}>
                    {createFolderMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Create
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Link href="/convert">
              <Button className="gap-2">
                <Upload className="h-4 w-4" />
                Upload Files
              </Button>
            </Link>
          </div>
        </div>

        {/* Search and Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search files..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button variant="outline" className="gap-2">
                <Filter className="h-4 w-4" />
                Filters
              </Button>
              <div className="flex items-center border rounded-lg">
                <Button
                  variant={viewMode === "grid" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("grid")}
                  className="rounded-r-none"
                >
                  <Grid className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "list" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("list")}
                  className="rounded-l-none"
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Breadcrumb */}
        {currentFolderId && (
          <div className="flex items-center gap-2 text-sm">
            <button 
              onClick={() => setCurrentFolderId(null)}
              className="text-blue-600 hover:underline"
            >
              My Files
            </button>
            <span className="text-slate-400">/</span>
            <span className="text-slate-600">Current Folder</span>
          </div>
        )}

        {/* Content */}
        {filesLoading || foldersLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : (
          <>
            {/* Folders */}
            {folders && folders.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-slate-500">Folders</h3>
                <div className={viewMode === "grid" 
                  ? "grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4"
                  : "space-y-2"
                }>
                  {folders.map((folder) => (
                    <Card 
                      key={folder.id}
                      className="hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => setCurrentFolderId(folder.id)}
                    >
                      <CardContent className={viewMode === "grid" ? "p-4 text-center" : "p-4 flex items-center gap-4"}>
                        <FolderOpen className={`text-yellow-500 ${viewMode === "grid" ? "h-12 w-12 mx-auto mb-2" : "h-8 w-8"}`} />
                        <div className={viewMode === "grid" ? "" : "flex-1"}>
                          <p className="font-medium text-slate-900 truncate">{folder.name}</p>
                          {viewMode === "list" && (
                            <p className="text-sm text-slate-500">{formatDate(folder.createdAt)}</p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Files */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-slate-500">Files</h3>
              {files && files.length > 0 ? (
                <div className={viewMode === "grid" 
                  ? "grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4"
                  : "space-y-2"
                }>
                  {files.map((file) => (
                    <Card key={file.id} className="hover:shadow-md transition-shadow group">
                      <CardContent className={viewMode === "grid" ? "p-4" : "p-4 flex items-center gap-4"}>
                        {viewMode === "grid" ? (
                          <>
                            <div className="text-4xl text-center mb-2">
                              {getFileIcon(file.mimeType)}
                            </div>
                            <p className="font-medium text-slate-900 truncate text-sm text-center">
                              {file.originalFilename}
                            </p>
                            <p className="text-xs text-slate-500 text-center">
                              {formatFileSize(Number(file.fileSize))}
                            </p>
                            <div className="flex justify-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <a href={file.url} target="_blank" rel="noopener noreferrer">
                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </a>
                              <a href={file.url} download={file.originalFilename}>
                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                                  <Download className="h-4 w-4" />
                                </Button>
                              </a>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className="h-8 w-8 p-0 text-red-500 hover:text-red-600"
                                onClick={() => deleteFileMutation.mutate({ id: file.id })}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="text-2xl">{getFileIcon(file.mimeType)}</div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-slate-900 truncate">
                                {file.originalFilename}
                              </p>
                              <div className="flex items-center gap-4 text-sm text-slate-500">
                                <span>{formatFileSize(Number(file.fileSize))}</span>
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {formatDate(file.createdAt)}
                                </span>
                              </div>
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <a href={file.url} target="_blank" rel="noopener noreferrer">
                                  <DropdownMenuItem>
                                    <Eye className="h-4 w-4 mr-2" />
                                    View
                                  </DropdownMenuItem>
                                </a>
                                <a href={file.url} download={file.originalFilename}>
                                  <DropdownMenuItem>
                                    <Download className="h-4 w-4 mr-2" />
                                    Download
                                  </DropdownMenuItem>
                                </a>
                                <DropdownMenuItem onClick={() => toast.info("Feature coming soon!")}>
                                  <Share2 className="h-4 w-4 mr-2" />
                                  Share
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => toast.info("Feature coming soon!")}>
                                  <Tag className="h-4 w-4 mr-2" />
                                  Add Tag
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  className="text-red-600"
                                  onClick={() => deleteFileMutation.mutate({ id: file.id })}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="p-12 text-center">
                    <FileText className="h-16 w-16 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-slate-900 mb-2">No files yet</h3>
                    <p className="text-slate-500 mb-4">
                      Upload your first file to get started
                    </p>
                    <Link href="/convert">
                      <Button className="gap-2">
                        <Upload className="h-4 w-4" />
                        Upload Files
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              )}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
