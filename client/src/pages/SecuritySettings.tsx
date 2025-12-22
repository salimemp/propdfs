import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Shield,
  Smartphone,
  Key,
  Fingerprint,
  Trash2,
  Plus,
  Copy,
  CheckCircle,
  AlertTriangle,
  Loader2,
  QrCode,
  RefreshCw,
} from "lucide-react";

export default function SecuritySettings() {
  const { user } = useAuth();
  const [showSetup2FA, setShowSetup2FA] = useState(false);
  const [showDisable2FA, setShowDisable2FA] = useState(false);
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [showRegenerateBackup, setShowRegenerateBackup] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [regenerateCode, setRegenerateCode] = useState("");
  const [setupData, setSetupData] = useState<{
    secret: string;
    otpauthUri: string;
    backupCodes: string[];
  } | null>(null);
  const [newBackupCodes, setNewBackupCodes] = useState<string[]>([]);
  const [showAddPasskey, setShowAddPasskey] = useState(false);
  const [passkeyName, setPasskeyName] = useState("");
  const [deletePasskeyId, setDeletePasskeyId] = useState<string | null>(null);

  // Fetch 2FA status
  const { data: twoFactorStatus, refetch: refetchTwoFactor } = trpc.twoFactor.getStatus.useQuery();
  
  // Fetch passkeys
  const { data: passkeys, refetch: refetchPasskeys } = trpc.passkeys.list.useQuery();
  const { data: passkeyStatus } = trpc.passkeys.getStatus.useQuery();
  
  // Fetch social connections
  const { data: socialConnections } = trpc.socialAuth.getConnections.useQuery();

  // 2FA mutations
  const setup2FA = trpc.twoFactor.setup.useMutation({
    onSuccess: (data) => {
      setSetupData(data);
    },
    onError: (error) => {
      toast.error("Failed to setup 2FA", { description: error.message });
    },
  });

  const enable2FA = trpc.twoFactor.enable.useMutation({
    onSuccess: () => {
      toast.success("Two-factor authentication enabled!");
      setShowSetup2FA(false);
      setSetupData(null);
      setVerificationCode("");
      refetchTwoFactor();
    },
    onError: (error) => {
      toast.error("Failed to enable 2FA", { description: error.message });
    },
  });

  const disable2FA = trpc.twoFactor.disable.useMutation({
    onSuccess: () => {
      toast.success("Two-factor authentication disabled");
      setShowDisable2FA(false);
      setDisableCode("");
      refetchTwoFactor();
    },
    onError: (error) => {
      toast.error("Failed to disable 2FA", { description: error.message });
    },
  });

  const regenerateBackupCodes = trpc.twoFactor.regenerateBackupCodes.useMutation({
    onSuccess: (data) => {
      setNewBackupCodes(data.backupCodes);
      setShowRegenerateBackup(false);
      setShowBackupCodes(true);
      setRegenerateCode("");
      refetchTwoFactor();
      toast.success("New backup codes generated");
    },
    onError: (error) => {
      toast.error("Failed to regenerate codes", { description: error.message });
    },
  });

  // Passkey mutations
  const { data: registrationOptions } = trpc.passkeys.getRegistrationOptions.useQuery(undefined, {
    enabled: showAddPasskey,
  });

  const registerPasskey = trpc.passkeys.register.useMutation({
    onSuccess: () => {
      toast.success("Passkey registered successfully!");
      setShowAddPasskey(false);
      setPasskeyName("");
      refetchPasskeys();
    },
    onError: (error) => {
      toast.error("Failed to register passkey", { description: error.message });
    },
  });

  const deletePasskey = trpc.passkeys.delete.useMutation({
    onSuccess: () => {
      toast.success("Passkey deleted");
      setDeletePasskeyId(null);
      refetchPasskeys();
    },
    onError: (error) => {
      toast.error("Failed to delete passkey", { description: error.message });
    },
  });

  const renamePasskey = trpc.passkeys.rename.useMutation({
    onSuccess: () => {
      toast.success("Passkey renamed");
      refetchPasskeys();
    },
  });

  // Social auth
  const disconnectSocial = trpc.socialAuth.disconnect.useMutation({
    onSuccess: () => {
      toast.success("Account disconnected");
    },
  });

  // Handle 2FA setup
  const handleStartSetup = () => {
    setShowSetup2FA(true);
    setup2FA.mutate();
  };

  const handleEnable2FA = () => {
    if (!setupData || verificationCode.length !== 6) {
      toast.error("Please enter a 6-digit code");
      return;
    }
    enable2FA.mutate({
      secret: setupData.secret,
      code: verificationCode,
      backupCodes: setupData.backupCodes,
    });
  };

  const handleDisable2FA = () => {
    if (!disableCode) {
      toast.error("Please enter your verification code");
      return;
    }
    disable2FA.mutate({ code: disableCode });
  };

  const handleRegenerateBackupCodes = () => {
    if (!regenerateCode) {
      toast.error("Please enter your verification code");
      return;
    }
    regenerateBackupCodes.mutate({ code: regenerateCode });
  };

  // Handle passkey registration
  const handleAddPasskey = async () => {
    if (!registrationOptions) return;

    try {
      // Check for WebAuthn support
      if (!window.PublicKeyCredential) {
        toast.error("Passkeys are not supported in this browser");
        return;
      }

      // Create credential
      const challengeArray = new Uint8Array(atob(registrationOptions.challenge).split('').map(c => c.charCodeAt(0)));
      const userIdArray = new Uint8Array(atob(registrationOptions.user.id).split('').map(c => c.charCodeAt(0)));
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: challengeArray,
          rp: registrationOptions.rp,
          user: {
            id: userIdArray,
            name: registrationOptions.user.name,
            displayName: registrationOptions.user.displayName,
          },
          pubKeyCredParams: registrationOptions.pubKeyCredParams as PublicKeyCredentialParameters[],
          timeout: registrationOptions.timeout,
          attestation: registrationOptions.attestation as AttestationConveyancePreference,
          authenticatorSelection: registrationOptions.authenticatorSelection as AuthenticatorSelectionCriteria,
        },
      }) as PublicKeyCredential;

      if (!credential) {
        toast.error("Failed to create passkey");
        return;
      }

      const response = credential.response as AuthenticatorAttestationResponse;
      
      // Register with server
      registerPasskey.mutate({
        credentialId: btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(credential.rawId)))),
        publicKey: btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(response.getPublicKey()!)))),
        deviceName: passkeyName || "My Passkey",
        deviceType: credential.authenticatorAttachment || undefined,
        transports: response.getTransports?.() || undefined,
      });
    } catch (error: any) {
      console.error("Passkey registration error:", error);
      if (error.name === "NotAllowedError") {
        toast.error("Passkey registration was cancelled");
      } else {
        toast.error("Failed to create passkey", { description: error.message });
      }
    }
  };

  // Copy backup codes
  const copyBackupCodes = (codes: string[]) => {
    navigator.clipboard.writeText(codes.join("\n"));
    toast.success("Backup codes copied to clipboard");
  };

  return (
    <DashboardLayout>
      <div className="container max-w-4xl py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-8 w-8" />
            Security Settings
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage your account security, two-factor authentication, and passkeys.
          </p>
        </div>

        <div className="space-y-6">
          {/* Two-Factor Authentication */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5" />
                  <CardTitle>Two-Factor Authentication</CardTitle>
                </div>
                {twoFactorStatus?.enabled ? (
                  <Badge className="bg-green-500">Enabled</Badge>
                ) : (
                  <Badge variant="outline">Disabled</Badge>
                )}
              </div>
              <CardDescription>
                Add an extra layer of security using an authenticator app like Google Authenticator or Authy.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {twoFactorStatus?.enabled ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <span>Two-factor authentication is active</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        {twoFactorStatus.backupCodesRemaining} backup codes remaining
                      </Badge>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setShowRegenerateBackup(true)}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Regenerate Backup Codes
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => setShowDisable2FA(true)}
                    >
                      Disable 2FA
                    </Button>
                  </div>
                </div>
              ) : (
                <Button onClick={handleStartSetup} disabled={setup2FA.isPending}>
                  {setup2FA.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <Key className="h-4 w-4 mr-2" />
                  Enable Two-Factor Authentication
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Passkeys */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Fingerprint className="h-5 w-5" />
                  <CardTitle>Passkeys</CardTitle>
                </div>
                {passkeyStatus?.enabled ? (
                  <Badge className="bg-green-500">{passkeyStatus.count} registered</Badge>
                ) : (
                  <Badge variant="outline">Not configured</Badge>
                )}
              </div>
              <CardDescription>
                Use biometric authentication like Face ID, Touch ID, or Windows Hello for passwordless sign-in.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {passkeys && passkeys.length > 0 && (
                  <div className="space-y-2">
                    {passkeys.map((passkey) => (
                      <div
                        key={passkey.credentialId}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <Fingerprint className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{passkey.deviceName || "Unnamed Passkey"}</p>
                            <p className="text-sm text-muted-foreground">
                              Added {new Date(passkey.createdAt).toLocaleDateString()}
                              {passkey.lastUsedAt && (
                                <> · Last used {new Date(passkey.lastUsedAt).toLocaleDateString()}</>
                              )}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeletePasskeyId(passkey.credentialId)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                
                <Button onClick={() => setShowAddPasskey(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Passkey
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Connected Accounts */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                <CardTitle>Connected Accounts</CardTitle>
              </div>
              <CardDescription>
                Social login accounts connected to your ProPDFs account.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Google */}
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <svg className="h-5 w-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    <div>
                      <p className="font-medium">Google</p>
                      {socialConnections?.find(c => c.provider === "google") ? (
                        <p className="text-sm text-muted-foreground">
                          {socialConnections.find(c => c.provider === "google")?.email}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground">Not connected</p>
                      )}
                    </div>
                  </div>
                  {socialConnections?.find(c => c.provider === "google") ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => disconnectSocial.mutate({ provider: "google" })}
                    >
                      Disconnect
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => toast.info("Configure Google OAuth in Settings")}>
                      Connect
                    </Button>
                  )}
                </div>

                {/* GitHub */}
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                    </svg>
                    <div>
                      <p className="font-medium">GitHub</p>
                      {socialConnections?.find(c => c.provider === "github") ? (
                        <p className="text-sm text-muted-foreground">
                          {socialConnections.find(c => c.provider === "github")?.name}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground">Not connected</p>
                      )}
                    </div>
                  </div>
                  {socialConnections?.find(c => c.provider === "github") ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => disconnectSocial.mutate({ provider: "github" })}
                    >
                      Disconnect
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => toast.info("Configure GitHub OAuth in Settings")}>
                      Connect
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 2FA Setup Dialog */}
      <Dialog open={showSetup2FA} onOpenChange={setShowSetup2FA}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Set Up Two-Factor Authentication</DialogTitle>
            <DialogDescription>
              Scan the QR code with your authenticator app, then enter the verification code.
            </DialogDescription>
          </DialogHeader>
          
          {setupData ? (
            <div className="space-y-4">
              {/* QR Code placeholder */}
              <div className="flex justify-center p-4 bg-white rounded-lg">
                <div className="text-center">
                  <QrCode className="h-32 w-32 mx-auto text-gray-400" />
                  <p className="text-xs text-muted-foreground mt-2 break-all">
                    {setupData.otpauthUri}
                  </p>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Manual entry key</Label>
                <div className="flex gap-2">
                  <Input value={setupData.secret} readOnly className="font-mono text-sm" />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      navigator.clipboard.writeText(setupData.secret);
                      toast.success("Secret copied");
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              <Separator />
              
              <div className="space-y-2">
                <Label>Verification code</Label>
                <Input
                  placeholder="000000"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  maxLength={6}
                  className="text-center text-2xl tracking-widest"
                />
              </div>
              
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-yellow-800">Save your backup codes</p>
                    <p className="text-yellow-700 mt-1">
                      These codes can be used to access your account if you lose your authenticator.
                    </p>
                  </div>
                </div>
                <div className="mt-3 p-2 bg-white rounded border font-mono text-sm">
                  {setupData.backupCodes.map((code, i) => (
                    <div key={i}>{code}</div>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 w-full"
                  onClick={() => copyBackupCodes(setupData.backupCodes)}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Backup Codes
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSetup2FA(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleEnable2FA}
              disabled={!setupData || verificationCode.length !== 6 || enable2FA.isPending}
            >
              {enable2FA.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Enable 2FA
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disable 2FA Dialog */}
      <AlertDialog open={showDisable2FA} onOpenChange={setShowDisable2FA}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable Two-Factor Authentication</AlertDialogTitle>
            <AlertDialogDescription>
              Enter your verification code or a backup code to disable 2FA.
              This will make your account less secure.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Input
              placeholder="Verification code or backup code"
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisable2FA}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {disable2FA.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Disable 2FA
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Regenerate Backup Codes Dialog */}
      <Dialog open={showRegenerateBackup} onOpenChange={setShowRegenerateBackup}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regenerate Backup Codes</DialogTitle>
            <DialogDescription>
              Enter your current verification code to generate new backup codes.
              Your old backup codes will be invalidated.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="Current verification code"
              value={regenerateCode}
              onChange={(e) => setRegenerateCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              maxLength={6}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRegenerateBackup(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleRegenerateBackupCodes}
              disabled={regenerateCode.length !== 6 || regenerateBackupCodes.isPending}
            >
              {regenerateBackupCodes.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Generate New Codes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Backup Codes Dialog */}
      <Dialog open={showBackupCodes} onOpenChange={setShowBackupCodes}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your New Backup Codes</DialogTitle>
            <DialogDescription>
              Save these codes in a secure place. Each code can only be used once.
            </DialogDescription>
          </DialogHeader>
          <div className="p-4 bg-muted rounded-lg font-mono text-sm">
            {newBackupCodes.map((code, i) => (
              <div key={i} className="py-1">{code}</div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => copyBackupCodes(newBackupCodes)}>
              <Copy className="h-4 w-4 mr-2" />
              Copy Codes
            </Button>
            <Button onClick={() => setShowBackupCodes(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Passkey Dialog */}
      <Dialog open={showAddPasskey} onOpenChange={setShowAddPasskey}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a Passkey</DialogTitle>
            <DialogDescription>
              Use your device's biometric authentication to create a passkey for passwordless sign-in.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Passkey Name (optional)</Label>
              <Input
                placeholder="e.g., MacBook Pro, iPhone 15"
                value={passkeyName}
                onChange={(e) => setPasskeyName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddPasskey(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddPasskey} disabled={registerPasskey.isPending}>
              {registerPasskey.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Fingerprint className="h-4 w-4 mr-2" />
              Create Passkey
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Passkey Dialog */}
      <AlertDialog open={!!deletePasskeyId} onOpenChange={() => setDeletePasskeyId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Passkey</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this passkey? You won't be able to use it to sign in anymore.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletePasskeyId && deletePasskey.mutate({ credentialId: deletePasskeyId })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
