import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import { Slider } from "@/components/ui/slider";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Settings,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface ReadAloudProps {
  fileUrl?: string;
  text?: string;
  onClose?: () => void;
}

export function ReadAloud({ fileUrl, text: initialText, onClose }: ReadAloudProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sentences, setSentences] = useState<string[]>([]);
  const [text, setText] = useState(initialText || "");
  const [showSettings, setShowSettings] = useState(false);
  
  // Settings
  const [rate, setRate] = useState(1.0);
  const [pitch, setPitch] = useState(1.0);
  const [volume, setVolume] = useState(1.0);
  const [selectedVoice, setSelectedVoice] = useState<string>("");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  
  // Progress
  const [elapsedTime, setElapsedTime] = useState(0);
  const [estimatedTime, setEstimatedTime] = useState(0);
  
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const sentenceRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  
  // Fetch available voices and settings
  const { data: defaultSettings } = trpc.readAloud.getDefaultSettings.useQuery();
  const { data: speedPresets } = trpc.readAloud.getSpeedPresets.useQuery();
  const { data: shortcuts } = trpc.readAloud.getShortcuts.useQuery();
  
  // Extract text from PDF
  const extractText = trpc.readAloud.extractText.useMutation({
    onSuccess: (result) => {
      setText(result.text);
      setSentences(result.segments);
      setEstimatedTime(result.estimatedTime);
      toast.success("Text extracted", {
        description: `${result.segments.length} sentences ready to read`,
      });
    },
    onError: (error) => {
      toast.error("Failed to extract text", { description: error.message });
    },
  });
  
  // Load voices
  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = speechSynthesis.getVoices();
      setVoices(availableVoices);
      if (availableVoices.length > 0 && !selectedVoice) {
        // Try to find a default English voice
        const defaultVoice = availableVoices.find(v => v.lang.startsWith("en") && v.default) ||
                           availableVoices.find(v => v.lang.startsWith("en")) ||
                           availableVoices[0];
        setSelectedVoice(defaultVoice.name);
      }
    };
    
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
    
    return () => {
      speechSynthesis.onvoiceschanged = null;
    };
  }, []);
  
  // Extract text from PDF if URL provided
  useEffect(() => {
    if (fileUrl && !text) {
      extractText.mutate({ fileUrl });
    }
  }, [fileUrl]);
  
  // Split initial text into sentences
  useEffect(() => {
    if (initialText && !sentences.length) {
      const splitSentences = initialText
        .split(/(?<=[.!?])\s+/)
        .map(s => s.trim())
        .filter(s => s.length > 0);
      setSentences(splitSentences);
      
      // Estimate reading time (150 words per minute)
      const words = initialText.split(/\s+/).length;
      setEstimatedTime(Math.ceil((words / 150) * 60));
    }
  }, [initialText]);
  
  // Scroll to current sentence
  useEffect(() => {
    if (sentenceRefs.current[currentIndex]) {
      sentenceRefs.current[currentIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [currentIndex]);
  
  // Speak a sentence
  const speakSentence = useCallback((index: number) => {
    if (index >= sentences.length) {
      stop();
      return;
    }
    
    speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(sentences[index]);
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.volume = isMuted ? 0 : volume;
    
    const voice = voices.find(v => v.name === selectedVoice);
    if (voice) {
      utterance.voice = voice;
    }
    
    utterance.onend = () => {
      if (isPlaying && !isPaused) {
        setCurrentIndex(prev => prev + 1);
        speakSentence(index + 1);
      }
    };
    
    utterance.onerror = (event) => {
      console.error("Speech synthesis error:", event);
      if (event.error !== "interrupted") {
        toast.error("Speech error", { description: event.error });
      }
    };
    
    utteranceRef.current = utterance;
    speechSynthesis.speak(utterance);
  }, [sentences, rate, pitch, volume, isMuted, selectedVoice, voices, isPlaying, isPaused]);
  
  // Play/Resume
  const play = useCallback(() => {
    if (sentences.length === 0) {
      toast.error("No text to read");
      return;
    }
    
    if (isPaused) {
      speechSynthesis.resume();
      setIsPaused(false);
    } else {
      speakSentence(currentIndex);
    }
    
    setIsPlaying(true);
    
    // Start timer
    timerRef.current = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);
  }, [sentences, isPaused, currentIndex, speakSentence]);
  
  // Pause
  const pause = useCallback(() => {
    speechSynthesis.pause();
    setIsPaused(true);
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
  }, []);
  
  // Stop
  const stop = useCallback(() => {
    speechSynthesis.cancel();
    setIsPlaying(false);
    setIsPaused(false);
    setCurrentIndex(0);
    setElapsedTime(0);
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
  }, []);
  
  // Skip forward
  const skipForward = useCallback(() => {
    if (currentIndex < sentences.length - 1) {
      speechSynthesis.cancel();
      const newIndex = currentIndex + 1;
      setCurrentIndex(newIndex);
      if (isPlaying) {
        speakSentence(newIndex);
      }
    }
  }, [currentIndex, sentences.length, isPlaying, speakSentence]);
  
  // Skip backward
  const skipBackward = useCallback(() => {
    if (currentIndex > 0) {
      speechSynthesis.cancel();
      const newIndex = currentIndex - 1;
      setCurrentIndex(newIndex);
      if (isPlaying) {
        speakSentence(newIndex);
      }
    }
  }, [currentIndex, isPlaying, speakSentence]);
  
  // Toggle mute
  const toggleMute = useCallback(() => {
    setIsMuted(prev => !prev);
  }, []);
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      switch (e.key) {
        case " ":
          e.preventDefault();
          if (isPlaying && !isPaused) {
            pause();
          } else {
            play();
          }
          break;
        case "Escape":
          stop();
          break;
        case "ArrowRight":
          skipForward();
          break;
        case "ArrowLeft":
          skipBackward();
          break;
        case "ArrowUp":
          e.preventDefault();
          setRate(prev => Math.min(2, prev + 0.25));
          break;
        case "ArrowDown":
          e.preventDefault();
          setRate(prev => Math.max(0.5, prev - 0.25));
          break;
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying, isPaused, play, pause, stop, skipForward, skipBackward]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      speechSynthesis.cancel();
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);
  
  // Format time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };
  
  // Progress percentage
  const progress = sentences.length > 0 ? (currentIndex / sentences.length) * 100 : 0;
  
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Volume2 className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Read Aloud</h2>
          {extractText.isPending && (
            <Badge variant="outline" className="ml-2">
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
              Extracting text...
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={() => setShowSettings(true)}>
          <Settings className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Text display */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-2">
          {sentences.map((sentence, index) => (
            <p
              key={index}
              ref={(el) => { sentenceRefs.current[index] = el; }}
              className={`p-2 rounded transition-colors cursor-pointer ${
                index === currentIndex
                  ? "bg-primary/20 border-l-4 border-primary"
                  : index < currentIndex
                  ? "text-muted-foreground"
                  : ""
              }`}
              onClick={() => {
                setCurrentIndex(index);
                if (isPlaying) {
                  speechSynthesis.cancel();
                  speakSentence(index);
                }
              }}
            >
              {sentence}
            </p>
          ))}
          
          {sentences.length === 0 && !extractText.isPending && (
            <div className="text-center text-muted-foreground py-8">
              No text to read. Upload a PDF or provide text content.
            </div>
          )}
        </div>
      </ScrollArea>
      
      {/* Progress bar */}
      <div className="px-4 py-2 border-t">
        <Progress value={progress} className="h-1" />
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>{formatTime(elapsedTime)}</span>
          <span>
            {currentIndex + 1} / {sentences.length} sentences
          </span>
          <span>{formatTime(estimatedTime)}</span>
        </div>
      </div>
      
      {/* Controls */}
      <div className="p-4 border-t bg-muted/50">
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={skipBackward}
            disabled={currentIndex === 0}
          >
            <SkipBack className="h-4 w-4" />
          </Button>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={skipBackward}
            disabled={currentIndex === 0}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          
          {isPlaying && !isPaused ? (
            <Button size="lg" className="rounded-full h-12 w-12" onClick={pause}>
              <Pause className="h-5 w-5" />
            </Button>
          ) : (
            <Button size="lg" className="rounded-full h-12 w-12" onClick={play}>
              <Play className="h-5 w-5 ml-0.5" />
            </Button>
          )}
          
          <Button variant="outline" size="icon" onClick={stop}>
            <Square className="h-4 w-4" />
          </Button>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={skipForward}
            disabled={currentIndex >= sentences.length - 1}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={skipForward}
            disabled={currentIndex >= sentences.length - 1}
          >
            <SkipForward className="h-4 w-4" />
          </Button>
          
          <div className="w-px h-6 bg-border mx-2" />
          
          <Button variant="ghost" size="icon" onClick={toggleMute}>
            {isMuted ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </Button>
          
          <Badge variant="outline">{rate}x</Badge>
        </div>
        
        {/* Quick speed controls */}
        <div className="flex items-center justify-center gap-2 mt-3">
          {speedPresets?.map((preset) => (
            <Button
              key={preset.value}
              variant={rate === preset.value ? "default" : "ghost"}
              size="sm"
              onClick={() => setRate(preset.value)}
            >
              {preset.value}x
            </Button>
          ))}
        </div>
      </div>
      
      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Read Aloud Settings</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Voice selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Voice</label>
              <Select value={selectedVoice} onValueChange={setSelectedVoice}>
                <SelectTrigger>
                  <SelectValue placeholder="Select voice" />
                </SelectTrigger>
                <SelectContent>
                  {voices.map((voice) => (
                    <SelectItem key={voice.name} value={voice.name}>
                      {voice.name} ({voice.lang})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Speed */}
            <div className="space-y-2">
              <div className="flex justify-between">
                <label className="text-sm font-medium">Speed</label>
                <span className="text-sm text-muted-foreground">{rate}x</span>
              </div>
              <Slider
                value={[rate]}
                onValueChange={([v]) => setRate(v)}
                min={0.5}
                max={2}
                step={0.25}
              />
            </div>
            
            {/* Pitch */}
            <div className="space-y-2">
              <div className="flex justify-between">
                <label className="text-sm font-medium">Pitch</label>
                <span className="text-sm text-muted-foreground">{pitch}</span>
              </div>
              <Slider
                value={[pitch]}
                onValueChange={([v]) => setPitch(v)}
                min={0}
                max={2}
                step={0.1}
              />
            </div>
            
            {/* Volume */}
            <div className="space-y-2">
              <div className="flex justify-between">
                <label className="text-sm font-medium">Volume</label>
                <span className="text-sm text-muted-foreground">{Math.round(volume * 100)}%</span>
              </div>
              <Slider
                value={[volume]}
                onValueChange={([v]) => setVolume(v)}
                min={0}
                max={1}
                step={0.1}
              />
            </div>
            
            {/* Keyboard shortcuts */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Keyboard Shortcuts</label>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Play/Pause</span>
                  <kbd className="px-2 py-0.5 bg-muted rounded text-xs">Space</kbd>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Stop</span>
                  <kbd className="px-2 py-0.5 bg-muted rounded text-xs">Esc</kbd>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Previous</span>
                  <kbd className="px-2 py-0.5 bg-muted rounded text-xs">←</kbd>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Next</span>
                  <kbd className="px-2 py-0.5 bg-muted rounded text-xs">→</kbd>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Speed Up</span>
                  <kbd className="px-2 py-0.5 bg-muted rounded text-xs">↑</kbd>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Slow Down</span>
                  <kbd className="px-2 py-0.5 bg-muted rounded text-xs">↓</kbd>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ReadAloud;
