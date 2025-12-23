import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle, Cloud } from "lucide-react";
import { toast } from "sonner";

type CloudProvider = "google_drive" | "dropbox" | "onedrive" | "box";

const providerNames: Record<CloudProvider, string> = {
  google_drive: "Google Drive",
  dropbox: "Dropbox",
  onedrive: "OneDrive",
  box: "Box",
};

const providerIcons: Record<CloudProvider, string> = {
  google_drive: "🔵",
  dropbox: "📦",
  onedrive: "☁️",
  box: "📁",
};

export default function CloudOAuthCallback() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");
  const [provider, setProvider] = useState<CloudProvider | null>(null);
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null);

  const handleCallbackMutation = trpc.cloudStorage.handleCallback.useMutation({
    onSuccess: (data) => {
      setStatus("success");
      setProvider(data.provider as CloudProvider);
      setConnectedEmail(data.email || null);
      setMessage(`Successfully connected to ${providerNames[data.provider as CloudProvider]}`);
      toast.success(`Connected to ${providerNames[data.provider as CloudProvider]}!`);
    },
    onError: (error: any) => {
      setStatus("error");
      setMessage(error.message || "Failed to connect cloud storage");
      toast.error(error.message || "Connection failed");
    },
  });

  useEffect(() => {
    // Parse URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");
    const state = urlParams.get("state");
    const error = urlParams.get("error");
    const errorDescription = urlParams.get("error_description");

    if (error) {
      setStatus("error");
      setMessage(errorDescription || error || "OAuth authorization was denied");
      return;
    }

    if (!code || !state) {
      setStatus("error");
      setMessage("Missing authorization code or state parameter");
      return;
    }

    // Exchange code for tokens
    handleCallbackMutation.mutate({ code, state });
  }, []);

  const handleGoToSettings = () => {
    setLocation("/settings");
  };

  const handleGoToFiles = () => {
    setLocation("/files");
  };

  const handleTryAgain = () => {
    setLocation("/settings");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            {status === "loading" && <Loader2 className="h-8 w-8 animate-spin text-primary" />}
            {status === "success" && <CheckCircle2 className="h-8 w-8 text-green-500" />}
            {status === "error" && <XCircle className="h-8 w-8 text-destructive" />}
          </div>
          <CardTitle className="text-2xl">
            {status === "loading" && "Connecting..."}
            {status === "success" && "Connected!"}
            {status === "error" && "Connection Failed"}
          </CardTitle>
          <CardDescription>
            {status === "loading" && "Please wait while we connect your cloud storage account."}
            {status === "success" && provider && (
              <span className="flex items-center justify-center gap-2 mt-2">
                <span className="text-2xl">{providerIcons[provider]}</span>
                <span>{providerNames[provider]}</span>
              </span>
            )}
            {status === "error" && "We couldn't connect your cloud storage account."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === "loading" && (
            <div className="text-center text-sm text-muted-foreground">
              <p>Exchanging authorization code...</p>
              <p className="mt-2">This may take a few seconds.</p>
            </div>
          )}

          {status === "success" && (
            <div className="space-y-4">
              {connectedEmail && (
                <div className="rounded-lg bg-muted p-4 text-center">
                  <p className="text-sm text-muted-foreground">Connected account</p>
                  <p className="font-medium">{connectedEmail}</p>
                </div>
              )}
              <p className="text-center text-sm text-muted-foreground">
                You can now import and export files from your {provider && providerNames[provider]} account.
              </p>
              <div className="flex gap-2">
                <Button onClick={handleGoToFiles} className="flex-1">
                  <Cloud className="mr-2 h-4 w-4" />
                  Browse Files
                </Button>
                <Button onClick={handleGoToSettings} variant="outline" className="flex-1">
                  Settings
                </Button>
              </div>
            </div>
          )}

          {status === "error" && (
            <div className="space-y-4">
              <div className="rounded-lg bg-destructive/10 p-4 text-center">
                <p className="text-sm text-destructive">{message}</p>
              </div>
              <p className="text-center text-sm text-muted-foreground">
                Please try connecting again or contact support if the issue persists.
              </p>
              <div className="flex gap-2">
                <Button onClick={handleTryAgain} className="flex-1">
                  Try Again
                </Button>
                <Button onClick={handleGoToSettings} variant="outline" className="flex-1">
                  Back to Settings
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
