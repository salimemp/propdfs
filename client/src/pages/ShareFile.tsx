import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { 
  FileText, 
  Download, 
  Eye, 
  Lock, 
  Loader2, 
  AlertCircle,
  FileIcon,
  Calendar,
  User
} from "lucide-react";

export default function ShareFile() {
  const params = useParams();
  const shareToken = params.token as string;
  const [password, setPassword] = useState("");
  const [showPasswordInput, setShowPasswordInput] = useState(false);

  // Access the shared file
  const { data, isLoading, error, refetch } = trpc.sharing.access.useQuery(
    { shareToken, password: showPasswordInput ? password : undefined },
    { enabled: !!shareToken, retry: false }
  );

  // Track download mutation
  const trackDownload = trpc.sharing.trackDownload.useMutation();

  useEffect(() => {
    if (data?.requiresPassword) {
      setShowPasswordInput(true);
    }
  }, [data]);

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    refetch();
  };

  const handleDownload = async () => {
    if (!data || !('file' in data) || !data.file) return;

    const fileData = data.file;
    try {
      // Track the download
      await trackDownload.mutateAsync({ shareToken });

      // Download the file
      const response = await fetch(fileData.url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileData.name;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success("Download started");
    } catch (error) {
      toast.error("Failed to download file");
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.includes("pdf")) return <FileText className="h-16 w-16 text-red-500" />;
    if (mimeType.includes("image")) return <FileIcon className="h-16 w-16 text-blue-500" />;
    if (mimeType.includes("word")) return <FileText className="h-16 w-16 text-blue-600" />;
    if (mimeType.includes("excel") || mimeType.includes("spreadsheet")) return <FileText className="h-16 w-16 text-green-600" />;
    return <FileIcon className="h-16 w-16 text-gray-500" />;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading shared file...</p>
        </div>
      </div>
    );
  }

  if (error || (data && !('requiresPassword' in data) && !('file' in data))) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle>File Not Available</CardTitle>
            <CardDescription>
              {(data as any)?.error || error?.message || "This share link may have expired, been revoked, or reached its access limit."}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button variant="outline" onClick={() => window.location.href = "/"}>
              Go to ProPDFs
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (showPasswordInput && data?.requiresPassword) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Lock className="h-8 w-8 text-primary" />
            </div>
            <CardTitle>Password Protected</CardTitle>
            <CardDescription>
              This file is password protected. Enter the password to access it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  autoFocus
                />
              </div>
              {(data as any)?.error === "Invalid password" && (
                <p className="text-sm text-destructive">Invalid password. Please try again.</p>
              )}
              <Button type="submit" className="w-full" disabled={!password}>
                Access File
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data || !('file' in data) || !data.file) {
    return null;
  }

  const file = data.file;
  const permission = data.permission;
  const canDownload = permission === "download" || permission === "edit";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container max-w-4xl py-4 flex items-center justify-between">
          <a href="/" className="text-xl font-bold text-primary flex items-center gap-2">
            📄 ProPDFs
          </a>
          <span className="text-sm text-muted-foreground">Shared File</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="container max-w-4xl py-8 px-4">
        <Card>
          <CardHeader className="text-center pb-4">
            <div className="mx-auto mb-4">
              {getFileIcon(file.mimeType)}
            </div>
            <CardTitle className="text-2xl">{file.name}</CardTitle>
            <CardDescription className="flex items-center justify-center gap-4 mt-2">
              <span className="flex items-center gap-1">
                <FileIcon className="h-4 w-4" />
                {formatFileSize(file.size)}
              </span>
              <span className="flex items-center gap-1">
                <Eye className="h-4 w-4" />
                {permission === "view" ? "View only" : 
                 permission === "download" ? "View & Download" :
                 permission === "edit" ? "Full access" : "Comment"}
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Preview (for PDFs and images) */}
            {(file.mimeType.includes("pdf") || file.mimeType.includes("image")) && (
              <div className="border rounded-lg overflow-hidden bg-muted/50">
                {file.mimeType.includes("pdf") ? (
                  <iframe
                    src={`${file.url}#toolbar=0`}
                    className="w-full h-[600px]"
                    title="PDF Preview"
                  />
                ) : (
                  <img
                    src={file.url}
                    alt={file.name}
                    className="w-full max-h-[600px] object-contain"
                  />
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {canDownload && (
                <Button onClick={handleDownload} size="lg" className="gap-2">
                  <Download className="h-5 w-5" />
                  Download File
                </Button>
              )}
              {file.mimeType.includes("pdf") && (
                <Button
                  variant="outline"
                  size="lg"
                  className="gap-2"
                  onClick={() => window.open(file.url, "_blank")}
                >
                  <Eye className="h-5 w-5" />
                  Open in New Tab
                </Button>
              )}
            </div>

            {/* Info */}
            <div className="text-center text-sm text-muted-foreground pt-4 border-t">
              <p>
                Shared via <a href="/" className="text-primary hover:underline">ProPDFs</a> - 
                Professional PDF Converter
              </p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
