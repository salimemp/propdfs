import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
  ArrowRight,
  Sparkles,
  Shield,
  FileText,
} from "lucide-react";

// Password strength calculation
function calculatePasswordStrength(password: string): {
  score: number;
  label: string;
  color: string;
} {
  let score = 0;
  
  if (password.length >= 8) score += 20;
  if (password.length >= 12) score += 10;
  if (password.length >= 16) score += 10;
  if (/[a-z]/.test(password)) score += 15;
  if (/[A-Z]/.test(password)) score += 15;
  if (/[0-9]/.test(password)) score += 15;
  if (/[^a-zA-Z0-9]/.test(password)) score += 15;

  if (score < 30) return { score, label: "Weak", color: "bg-red-500" };
  if (score < 50) return { score, label: "Fair", color: "bg-orange-500" };
  if (score < 70) return { score, label: "Good", color: "bg-yellow-500" };
  if (score < 90) return { score, label: "Strong", color: "bg-green-500" };
  return { score: 100, label: "Very Strong", color: "bg-emerald-500" };
}

// Password requirements check
function checkPasswordRequirements(password: string) {
  return {
    length: password.length >= 8,
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^a-zA-Z0-9]/.test(password),
  };
}

export default function Auth() {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState("login");
  
  // Login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  
  // Register form state
  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState("");
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  
  // Magic link form state
  const [magicLinkEmail, setMagicLinkEmail] = useState("");
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  
  // Forgot password state
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  const [forgotPasswordSent, setForgotPasswordSent] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      setLocation("/dashboard");
    }
  }, [isAuthenticated, user, setLocation]);

  // Mutations
  const loginMutation = trpc.auth.loginWithPassword.useMutation({
    onSuccess: () => {
      toast.success("Login successful!");
      setLocation("/dashboard");
    },
    onError: (error: any) => {
      toast.error(error.message || "Login failed");
    },
  });

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: () => {
      toast.success("Registration successful! Please check your email to verify your account.");
      setActiveTab("login");
    },
    onError: (error: any) => {
      toast.error(error.message || "Registration failed");
    },
  });

  const magicLinkMutation = trpc.auth.requestMagicLink.useMutation({
    onSuccess: () => {
      setMagicLinkSent(true);
      toast.success("Magic link sent! Check your email.");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to send magic link");
    },
  });

  const forgotPasswordMutation = trpc.auth.requestPasswordReset.useMutation({
    onSuccess: () => {
      setForgotPasswordSent(true);
      toast.success("Password reset email sent!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to send reset email");
    },
  });

  // Form handlers
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) {
      toast.error("Please fill in all fields");
      return;
    }
    loginMutation.mutate({ email: loginEmail, password: loginPassword });
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!registerName || !registerEmail || !registerPassword || !registerConfirmPassword) {
      toast.error("Please fill in all fields");
      return;
    }
    if (registerPassword !== registerConfirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    const requirements = checkPasswordRequirements(registerPassword);
    if (!requirements.length || !requirements.lowercase || !requirements.uppercase || !requirements.number) {
      toast.error("Password does not meet requirements");
      return;
    }
    registerMutation.mutate({
      name: registerName,
      email: registerEmail,
      password: registerPassword,
    });
  };

  const handleMagicLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!magicLinkEmail) {
      toast.error("Please enter your email");
      return;
    }
    magicLinkMutation.mutate({ email: magicLinkEmail });
  };

  const handleForgotPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotPasswordEmail) {
      toast.error("Please enter your email");
      return;
    }
    forgotPasswordMutation.mutate({ email: forgotPasswordEmail });
  };

  const passwordStrength = calculatePasswordStrength(registerPassword);
  const passwordRequirements = checkPasswordRequirements(registerPassword);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo and Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4">
            <FileText className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold">ProPDFs</h1>
          <p className="text-muted-foreground mt-1">Professional PDF Conversion</p>
        </div>

        <Card className="shadow-xl border-0">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <CardHeader className="pb-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="login">Sign In</TabsTrigger>
                <TabsTrigger value="register">Register</TabsTrigger>
                <TabsTrigger value="magic">Magic Link</TabsTrigger>
              </TabsList>
            </CardHeader>

            <CardContent>
              {/* Login Tab */}
              <TabsContent value="login" className="mt-0">
                {showForgotPassword ? (
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <div className="text-center mb-4">
                      <h3 className="font-semibold">Reset Password</h3>
                      <p className="text-sm text-muted-foreground">
                        Enter your email to receive a reset link
                      </p>
                    </div>
                    {forgotPasswordSent ? (
                      <div className="text-center py-4">
                        <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                        <p className="font-medium">Check your email</p>
                        <p className="text-sm text-muted-foreground mt-2">
                          We've sent a password reset link to {forgotPasswordEmail}
                        </p>
                        <Button
                          variant="link"
                          className="mt-4"
                          onClick={() => {
                            setShowForgotPassword(false);
                            setForgotPasswordSent(false);
                          }}
                        >
                          Back to login
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="forgot-email">Email</Label>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              id="forgot-email"
                              type="email"
                              placeholder="you@example.com"
                              className="pl-10"
                              value={forgotPasswordEmail}
                              onChange={(e) => setForgotPasswordEmail(e.target.value)}
                            />
                          </div>
                        </div>
                        <Button type="submit" className="w-full" disabled={forgotPasswordMutation.isPending}>
                          {forgotPasswordMutation.isPending && (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          )}
                          Send Reset Link
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="w-full"
                          onClick={() => setShowForgotPassword(false)}
                        >
                          Back to login
                        </Button>
                      </>
                    )}
                  </form>
                ) : (
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="login-email">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="login-email"
                          type="email"
                          placeholder="you@example.com"
                          className="pl-10"
                          value={loginEmail}
                          onChange={(e) => setLoginEmail(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="login-password">Password</Label>
                        <Button
                          type="button"
                          variant="link"
                          className="px-0 h-auto text-xs"
                          onClick={() => setShowForgotPassword(true)}
                        >
                          Forgot password?
                        </Button>
                      </div>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="login-password"
                          type={showLoginPassword ? "text" : "password"}
                          placeholder="••••••••"
                          className="pl-10 pr-10"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                          onClick={() => setShowLoginPassword(!showLoginPassword)}
                        >
                          {showLoginPassword ? (
                            <EyeOff className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Eye className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                      </div>
                    </div>
                    <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
                      {loginMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <ArrowRight className="h-4 w-4 mr-2" />
                      )}
                      Sign In
                    </Button>
                  </form>
                )}
              </TabsContent>

              {/* Register Tab */}
              <TabsContent value="register" className="mt-0">
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="register-name">Full Name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="register-name"
                        type="text"
                        placeholder="John Doe"
                        className="pl-10"
                        value={registerName}
                        onChange={(e) => setRegisterName(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="register-email"
                        type="email"
                        placeholder="you@example.com"
                        className="pl-10"
                        value={registerEmail}
                        onChange={(e) => setRegisterEmail(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="register-password"
                        type={showRegisterPassword ? "text" : "password"}
                        placeholder="••••••••"
                        className="pl-10 pr-10"
                        value={registerPassword}
                        onChange={(e) => setRegisterPassword(e.target.value)}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                        onClick={() => setShowRegisterPassword(!showRegisterPassword)}
                      >
                        {showRegisterPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                    {registerPassword && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Password strength:</span>
                          <span className={`font-medium ${
                            passwordStrength.score < 50 ? "text-red-500" :
                            passwordStrength.score < 70 ? "text-yellow-500" : "text-green-500"
                          }`}>
                            {passwordStrength.label}
                          </span>
                        </div>
                        <Progress value={passwordStrength.score} className="h-1.5" />
                        <div className="grid grid-cols-2 gap-1 text-xs">
                          <div className={`flex items-center gap-1 ${passwordRequirements.length ? "text-green-600" : "text-muted-foreground"}`}>
                            {passwordRequirements.length ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                            8+ characters
                          </div>
                          <div className={`flex items-center gap-1 ${passwordRequirements.lowercase ? "text-green-600" : "text-muted-foreground"}`}>
                            {passwordRequirements.lowercase ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                            Lowercase
                          </div>
                          <div className={`flex items-center gap-1 ${passwordRequirements.uppercase ? "text-green-600" : "text-muted-foreground"}`}>
                            {passwordRequirements.uppercase ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                            Uppercase
                          </div>
                          <div className={`flex items-center gap-1 ${passwordRequirements.number ? "text-green-600" : "text-muted-foreground"}`}>
                            {passwordRequirements.number ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                            Number
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-confirm">Confirm Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="register-confirm"
                        type="password"
                        placeholder="••••••••"
                        className="pl-10"
                        value={registerConfirmPassword}
                        onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                      />
                      {registerConfirmPassword && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          {registerPassword === registerConfirmPassword ? (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500" />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
                    {registerMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Shield className="h-4 w-4 mr-2" />
                    )}
                    Create Account
                  </Button>
                </form>
              </TabsContent>

              {/* Magic Link Tab */}
              <TabsContent value="magic" className="mt-0">
                {magicLinkSent ? (
                  <div className="text-center py-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full mb-4">
                      <CheckCircle className="h-8 w-8 text-green-600" />
                    </div>
                    <h3 className="font-semibold text-lg">Check your email</h3>
                    <p className="text-sm text-muted-foreground mt-2 mb-4">
                      We've sent a magic link to <strong>{magicLinkEmail}</strong>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      The link will expire in 15 minutes
                    </p>
                    <Button
                      variant="outline"
                      className="mt-6"
                      onClick={() => {
                        setMagicLinkSent(false);
                        setMagicLinkEmail("");
                      }}
                    >
                      Send another link
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleMagicLink} className="space-y-4">
                    <div className="text-center mb-4">
                      <div className="inline-flex items-center justify-center w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-full mb-3">
                        <Sparkles className="h-6 w-6 text-purple-600" />
                      </div>
                      <h3 className="font-semibold">Passwordless Sign In</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        We'll send you a magic link to sign in instantly
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="magic-email">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="magic-email"
                          type="email"
                          placeholder="you@example.com"
                          className="pl-10"
                          value={magicLinkEmail}
                          onChange={(e) => setMagicLinkEmail(e.target.value)}
                        />
                      </div>
                    </div>
                    <Button type="submit" className="w-full" disabled={magicLinkMutation.isPending}>
                      {magicLinkMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Mail className="h-4 w-4 mr-2" />
                      )}
                      Send Magic Link
                    </Button>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground justify-center">
                      <AlertCircle className="h-3.5 w-3.5" />
                      No password needed - just click the link in your email
                    </div>
                  </form>
                )}
              </TabsContent>
            </CardContent>

            <CardFooter className="flex flex-col gap-4 pt-0">
              <Separator />
              <p className="text-xs text-center text-muted-foreground">
                By continuing, you agree to our{" "}
                <a href="/terms" className="underline hover:text-primary">
                  Terms of Service
                </a>{" "}
                and{" "}
                <a href="/privacy" className="underline hover:text-primary">
                  Privacy Policy
                </a>
              </p>
            </CardFooter>
          </Tabs>
        </Card>

        {/* Back to home link */}
        <div className="text-center mt-6">
          <Button variant="link" onClick={() => setLocation("/")}>
            ← Back to home
          </Button>
        </div>
      </div>
    </div>
  );
}
