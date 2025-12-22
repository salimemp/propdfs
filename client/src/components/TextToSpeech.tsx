import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { 
  Play, Pause, Square, Volume2, VolumeX, 
  SkipBack, SkipForward, Settings2
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface TextToSpeechProps {
  text: string;
  onClose?: () => void;
}

export default function TextToSpeech({ text, onClose }: TextToSpeechProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [rate, setRate] = useState(1);
  const [pitch, setPitch] = useState(1);
  const [volume, setVolume] = useState(1);
  const [selectedVoice, setSelectedVoice] = useState<string>("");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [progress, setProgress] = useState(0);
  const [currentSentence, setCurrentSentence] = useState(0);
  
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const sentencesRef = useRef<string[]>([]);

  // Load available voices
  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      setVoices(availableVoices);
      
      // Set default voice (prefer English)
      const englishVoice = availableVoices.find(v => v.lang.startsWith("en"));
      if (englishVoice && !selectedVoice) {
        setSelectedVoice(englishVoice.name);
      }
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  // Split text into sentences
  useEffect(() => {
    sentencesRef.current = text
      .split(/(?<=[.!?])\s+/)
      .filter(s => s.trim().length > 0);
  }, [text]);

  const speak = (startIndex = 0) => {
    window.speechSynthesis.cancel();
    
    const sentences = sentencesRef.current;
    if (startIndex >= sentences.length) return;

    setCurrentSentence(startIndex);
    setIsPlaying(true);
    setIsPaused(false);

    const speakSentence = (index: number) => {
      if (index >= sentences.length) {
        setIsPlaying(false);
        setProgress(100);
        return;
      }

      const utterance = new SpeechSynthesisUtterance(sentences[index]);
      utteranceRef.current = utterance;

      // Set voice
      const voice = voices.find(v => v.name === selectedVoice);
      if (voice) utterance.voice = voice;

      // Set parameters
      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.volume = volume;

      utterance.onend = () => {
        setCurrentSentence(index + 1);
        setProgress(((index + 1) / sentences.length) * 100);
        speakSentence(index + 1);
      };

      utterance.onerror = (event) => {
        console.error("Speech error:", event);
        setIsPlaying(false);
      };

      window.speechSynthesis.speak(utterance);
    };

    speakSentence(startIndex);
  };

  const pause = () => {
    window.speechSynthesis.pause();
    setIsPaused(true);
  };

  const resume = () => {
    window.speechSynthesis.resume();
    setIsPaused(false);
  };

  const stop = () => {
    window.speechSynthesis.cancel();
    setIsPlaying(false);
    setIsPaused(false);
    setProgress(0);
    setCurrentSentence(0);
  };

  const skipBack = () => {
    const newIndex = Math.max(0, currentSentence - 1);
    speak(newIndex);
  };

  const skipForward = () => {
    const newIndex = Math.min(sentencesRef.current.length - 1, currentSentence + 1);
    speak(newIndex);
  };

  const toggleMute = () => {
    setVolume(volume === 0 ? 1 : 0);
  };

  // Group voices by language
  const voicesByLanguage = voices.reduce((acc, voice) => {
    const lang = voice.lang.split("-")[0];
    if (!acc[lang]) acc[lang] = [];
    acc[lang].push(voice);
    return acc;
  }, {} as Record<string, SpeechSynthesisVoice[]>);

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Volume2 className="h-5 w-5" />
          Text-to-Speech
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress bar */}
        <div className="space-y-2">
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-600 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-slate-500 text-center">
            Sentence {currentSentence + 1} of {sentencesRef.current.length}
          </p>
        </div>

        {/* Main controls */}
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={skipBack}
            disabled={!isPlaying || currentSentence === 0}
          >
            <SkipBack className="h-4 w-4" />
          </Button>
          
          {!isPlaying ? (
            <Button
              size="lg"
              onClick={() => speak(currentSentence)}
              className="w-16 h-16 rounded-full"
            >
              <Play className="h-6 w-6 ml-1" />
            </Button>
          ) : isPaused ? (
            <Button
              size="lg"
              onClick={resume}
              className="w-16 h-16 rounded-full"
            >
              <Play className="h-6 w-6 ml-1" />
            </Button>
          ) : (
            <Button
              size="lg"
              onClick={pause}
              className="w-16 h-16 rounded-full"
            >
              <Pause className="h-6 w-6" />
            </Button>
          )}
          
          <Button
            variant="outline"
            size="icon"
            onClick={stop}
            disabled={!isPlaying && !isPaused}
          >
            <Square className="h-4 w-4" />
          </Button>
          
          <Button
            variant="outline"
            size="icon"
            onClick={skipForward}
            disabled={!isPlaying || currentSentence >= sentencesRef.current.length - 1}
          >
            <SkipForward className="h-4 w-4" />
          </Button>
        </div>

        {/* Volume control */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleMute}
          >
            {volume === 0 ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </Button>
          <Slider
            value={[volume]}
            onValueChange={([v]) => setVolume(v)}
            max={1}
            step={0.1}
            className="flex-1"
          />
        </div>

        {/* Settings */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full">
              <Settings2 className="h-4 w-4 mr-2" />
              Voice Settings
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <div className="space-y-4">
              {/* Voice selection */}
              <div className="space-y-2">
                <Label>Voice</Label>
                <Select value={selectedVoice} onValueChange={setSelectedVoice}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select voice" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {Object.entries(voicesByLanguage).map(([lang, langVoices]) => (
                      <div key={lang}>
                        <div className="px-2 py-1.5 text-xs font-semibold text-slate-500 uppercase">
                          {lang}
                        </div>
                        {langVoices.map((voice) => (
                          <SelectItem key={voice.name} value={voice.name}>
                            {voice.name}
                          </SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Speed */}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Speed</Label>
                  <span className="text-sm text-slate-500">{rate}x</span>
                </div>
                <Slider
                  value={[rate]}
                  onValueChange={([v]) => setRate(v)}
                  min={0.5}
                  max={2}
                  step={0.1}
                />
              </div>

              {/* Pitch */}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Pitch</Label>
                  <span className="text-sm text-slate-500">{pitch}</span>
                </div>
                <Slider
                  value={[pitch]}
                  onValueChange={([v]) => setPitch(v)}
                  min={0.5}
                  max={2}
                  step={0.1}
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Current text preview */}
        {isPlaying && sentencesRef.current[currentSentence] && (
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-900">
              {sentencesRef.current[currentSentence]}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
