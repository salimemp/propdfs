import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { 
  Mic, 
  MicOff, 
  Volume2, 
  HelpCircle, 
  Settings,
  Loader2,
  CheckCircle,
  XCircle,
  Navigation,
  FileText,
  Cog,
  MessageSquare
} from "lucide-react";

// Check for browser support
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const speechSynthesis = window.speechSynthesis;

interface VoiceCommandProps {
  onCommand?: (command: string, action: string, params: Record<string, any>) => void;
}

export function VoiceCommand({ onCommand }: VoiceCommandProps) {
  const [, setLocation] = useLocation();
  
  
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [language, setLanguage] = useState("en-US");
  const [showHelp, setShowHelp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [voiceFeedback, setVoiceFeedback] = useState(true);
  const [lastResult, setLastResult] = useState<{
    success: boolean;
    response: string;
    command?: string;
  } | null>(null);
  
  const recognitionRef = useRef<any>(null);
  
  // Fetch available commands
  const { data: commands } = trpc.voice.getCommands.useQuery();
  const { data: languages } = trpc.voice.getLanguages.useQuery();
  
  // Execute voice command mutation
  const executeCommand = trpc.voice.execute.useMutation({
    onSuccess: (result) => {
      setLastResult({
        success: result.command.type !== "unknown",
        response: result.response,
        command: result.command.action,
      });
      
      // Speak the response if voice feedback is enabled
      if (voiceFeedback && speechSynthesis) {
        const utterance = new SpeechSynthesisUtterance(result.response);
        utterance.lang = language;
        speechSynthesis.speak(utterance);
      }
      
      // Handle navigation
      if (result.navigationPath) {
        setTimeout(() => {
          setLocation(result.navigationPath!);
        }, 500);
      }
      
      // Call external handler
      if (onCommand && result.command.type !== "unknown") {
        onCommand(result.command.originalTranscript, result.command.action, result.command.parameters);
      }
      
      // Show toast for non-navigation commands
      if (!result.navigationPath) {
        if (result.command.type !== "unknown") {
          toast.success("Command recognized", { description: result.response });
        } else {
          toast.error("Command not recognized", { description: result.response });
        }
      }
    },
    onError: (error) => {
      toast.error("Error", { description: error.message });
    },
  });
  
  // Initialize speech recognition
  useEffect(() => {
    if (!SpeechRecognition) {
      console.warn("Speech recognition not supported");
      return;
    }
    
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = language;
    
    recognition.onstart = () => {
      setIsListening(true);
      setTranscript("");
      setLastResult(null);
    };
    
    recognition.onresult = (event: any) => {
      const current = event.resultIndex;
      const result = event.results[current];
      const transcriptText = result[0].transcript;
      
      setTranscript(transcriptText);
      
      // If final result, process the command
      if (result.isFinal) {
        executeCommand.mutate({ transcript: transcriptText, language });
      }
    };
    
    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
      
      if (event.error === "not-allowed") {
        toast.error("Microphone access denied", {
          description: "Please allow microphone access to use voice commands.",
        });
      }
    };
    
    recognition.onend = () => {
      setIsListening(false);
    };
    
    recognitionRef.current = recognition;
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [language]);
  
  // Toggle listening
  const toggleListening = useCallback(() => {
    if (!SpeechRecognition) {
      toast.error("Not supported", {
        description: "Voice commands are not supported in this browser.",
      });
      return;
    }
    
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      recognitionRef.current?.start();
    }
  }, [isListening]);
  
  // Keyboard shortcut (Ctrl+Shift+V)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "V") {
        e.preventDefault();
        toggleListening();
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleListening]);
  
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "Navigation":
        return <Navigation className="h-4 w-4" />;
      case "Conversions":
      case "PDF Operations":
      case "File Operations":
        return <FileText className="h-4 w-4" />;
      case "Settings":
        return <Cog className="h-4 w-4" />;
      case "Help":
        return <HelpCircle className="h-4 w-4" />;
      default:
        return <MessageSquare className="h-4 w-4" />;
    }
  };
  
  if (!SpeechRecognition) {
    return null; // Don't render if not supported
  }
  
  return (
    <>
      {/* Voice Command Button */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
        {/* Status indicator */}
        {(isListening || transcript || lastResult) && (
          <Card className="w-72 shadow-lg">
            <CardContent className="p-3">
              {isListening && (
                <div className="flex items-center gap-2 text-sm">
                  <div className="relative">
                    <Mic className="h-4 w-4 text-red-500 animate-pulse" />
                    <span className="absolute -top-1 -right-1 h-2 w-2 bg-red-500 rounded-full animate-ping" />
                  </div>
                  <span className="text-muted-foreground">Listening...</span>
                </div>
              )}
              
              {transcript && (
                <p className="text-sm mt-1 font-medium">"{transcript}"</p>
              )}
              
              {executeCommand.isPending && (
                <div className="flex items-center gap-2 text-sm mt-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-muted-foreground">Processing...</span>
                </div>
              )}
              
              {lastResult && (
                <div className="flex items-center gap-2 text-sm mt-2">
                  {lastResult.success ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                  <span className={lastResult.success ? "text-green-600" : "text-red-600"}>
                    {lastResult.response}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        )}
        
        {/* Control buttons */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowHelp(true)}
            title="Voice command help"
          >
            <HelpCircle className="h-4 w-4" />
          </Button>
          
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowSettings(true)}
            title="Voice settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
          
          <Button
            variant={isListening ? "destructive" : "default"}
            size="lg"
            className="rounded-full h-14 w-14 shadow-lg"
            onClick={toggleListening}
            title={isListening ? "Stop listening" : "Start voice command (Ctrl+Shift+V)"}
          >
            {isListening ? (
              <MicOff className="h-6 w-6" />
            ) : (
              <Mic className="h-6 w-6" />
            )}
          </Button>
        </div>
      </div>
      
      {/* Help Dialog */}
      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mic className="h-5 w-5" />
              Voice Commands
            </DialogTitle>
            <DialogDescription>
              Say any of these commands to control ProPDFs with your voice.
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="h-[60vh] pr-4">
            <Tabs defaultValue={commands?.[0]?.category || "Navigation"}>
              <TabsList className="flex flex-wrap h-auto gap-1 mb-4">
                {commands?.map((cat) => (
                  <TabsTrigger key={cat.category} value={cat.category} className="flex items-center gap-1">
                    {getCategoryIcon(cat.category)}
                    {cat.category}
                  </TabsTrigger>
                ))}
              </TabsList>
              
              {commands?.map((cat) => (
                <TabsContent key={cat.category} value={cat.category}>
                  <div className="space-y-2">
                    {cat.commands.map((cmd, idx) => (
                      <Card key={idx}>
                        <CardContent className="p-3 flex justify-between items-center">
                          <div>
                            <p className="font-medium">"{cmd.phrase}"</p>
                            <p className="text-sm text-muted-foreground">{cmd.description}</p>
                          </div>
                          <Badge variant="outline">{cat.category}</Badge>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </ScrollArea>
          
          <div className="flex items-center gap-2 text-sm text-muted-foreground border-t pt-4">
            <kbd className="px-2 py-1 bg-muted rounded text-xs">Ctrl</kbd>
            <span>+</span>
            <kbd className="px-2 py-1 bg-muted rounded text-xs">Shift</kbd>
            <span>+</span>
            <kbd className="px-2 py-1 bg-muted rounded text-xs">V</kbd>
            <span>to toggle voice commands</span>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Voice Settings
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Recognition Language</label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger>
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  {languages?.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <label className="text-sm font-medium">Voice Feedback</label>
                <p className="text-xs text-muted-foreground">
                  Speak command responses aloud
                </p>
              </div>
              <Button
                variant={voiceFeedback ? "default" : "outline"}
                size="sm"
                onClick={() => setVoiceFeedback(!voiceFeedback)}
              >
                <Volume2 className="h-4 w-4 mr-1" />
                {voiceFeedback ? "On" : "Off"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default VoiceCommand;
