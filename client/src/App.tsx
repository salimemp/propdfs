import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Convert from "./pages/Convert";
import Files from "./pages/Files";
import Teams from "./pages/Teams";
import Analytics from "./pages/Analytics";
import Settings from "./pages/Settings";
import Pricing from "./pages/Pricing";
import Editor from "./pages/Editor";
import Compare from "./pages/Compare";
import BatchProcessing from "./pages/BatchProcessing";
import FormFilling from "./pages/FormFilling";
import SecuritySettings from "./pages/SecuritySettings";
import DevicesSettings from "./pages/DevicesSettings";
import Auth from "./pages/Auth";
import CloudOAuthCallback from "./pages/CloudOAuthCallback";
import CloudStorageSettings from "./pages/CloudStorageSettings";
import ShareFile from "./pages/ShareFile";
import AdminDashboard from "./pages/AdminDashboard";
import SharedFilesManager from "./pages/SharedFilesManager";
import VoiceCommand from "./components/VoiceCommand";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/convert" component={Convert} />
      <Route path="/files" component={Files} />
      <Route path="/teams" component={Teams} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/settings" component={Settings} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/editor" component={Editor} />
      <Route path="/compare" component={Compare} />
      <Route path="/batch" component={BatchProcessing} />
      <Route path="/forms" component={FormFilling} />
      <Route path="/security" component={SecuritySettings} />
      <Route path="/devices" component={DevicesSettings} />
      <Route path="/auth" component={Auth} />
      <Route path="/oauth/callback/:provider" component={CloudOAuthCallback} />
      <Route path="/cloud-storage" component={CloudStorageSettings} />
      <Route path="/share/:token" component={ShareFile} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/shared" component={SharedFilesManager} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable={true}>
        <TooltipProvider>
          <Toaster />
          <Router />
          <VoiceCommand />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
