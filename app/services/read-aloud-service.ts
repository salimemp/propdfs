/**
 * Read Aloud Service
 * Provides text-to-speech functionality for documents
 */

// Supported voices by language
export interface VoiceOption {
  name: string;
  lang: string;
  gender: 'male' | 'female' | 'neutral';
  voiceURI?: string;
}

export interface ReadAloudSettings {
  voice: string;
  rate: number; // 0.5 to 2.0
  pitch: number; // 0 to 2
  volume: number; // 0 to 1
  highlightColor: string;
}

export interface ReadAloudState {
  isPlaying: boolean;
  isPaused: boolean;
  currentSentenceIndex: number;
  totalSentences: number;
  currentPageIndex: number;
  totalPages: number;
  elapsedTime: number;
  estimatedTotalTime: number;
}

export interface TextSegment {
  text: string;
  pageIndex: number;
  sentenceIndex: number;
  startOffset: number;
  endOffset: number;
}

/**
 * Default read aloud settings
 */
export const DEFAULT_READ_ALOUD_SETTINGS: ReadAloudSettings = {
  voice: 'default',
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0,
  highlightColor: '#FFEB3B',
};

/**
 * Split text into sentences for reading
 */
export function splitIntoSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by space or end of string
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
  
  return sentences;
}

/**
 * Split text into paragraphs
 */
export function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
}

/**
 * Extract text segments from document pages
 */
export function extractTextSegments(pages: Array<{ text: string; pageNumber: number }>): TextSegment[] {
  const segments: TextSegment[] = [];
  let globalSentenceIndex = 0;
  
  for (const page of pages) {
    const sentences = splitIntoSentences(page.text);
    let offset = 0;
    
    for (const sentence of sentences) {
      const startOffset = page.text.indexOf(sentence, offset);
      segments.push({
        text: sentence,
        pageIndex: page.pageNumber - 1,
        sentenceIndex: globalSentenceIndex,
        startOffset,
        endOffset: startOffset + sentence.length,
      });
      offset = startOffset + sentence.length;
      globalSentenceIndex++;
    }
  }
  
  return segments;
}

/**
 * Estimate reading time in seconds
 */
export function estimateReadingTime(text: string, wordsPerMinute: number = 150): number {
  const words = text.split(/\s+/).length;
  return Math.ceil((words / wordsPerMinute) * 60);
}

/**
 * Format time in MM:SS
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Get available voices from browser
 * This is a helper for the frontend to use
 */
export function getAvailableVoices(): VoiceOption[] {
  // This will be populated on the frontend using speechSynthesis.getVoices()
  // Returning common voice options as a fallback
  return [
    { name: 'Default', lang: 'en-US', gender: 'neutral' },
    { name: 'US English Female', lang: 'en-US', gender: 'female' },
    { name: 'US English Male', lang: 'en-US', gender: 'male' },
    { name: 'UK English Female', lang: 'en-GB', gender: 'female' },
    { name: 'UK English Male', lang: 'en-GB', gender: 'male' },
    { name: 'Spanish Female', lang: 'es-ES', gender: 'female' },
    { name: 'French Female', lang: 'fr-FR', gender: 'female' },
    { name: 'German Female', lang: 'de-DE', gender: 'female' },
    { name: 'Italian Female', lang: 'it-IT', gender: 'female' },
    { name: 'Portuguese Female', lang: 'pt-BR', gender: 'female' },
    { name: 'Chinese Female', lang: 'zh-CN', gender: 'female' },
    { name: 'Japanese Female', lang: 'ja-JP', gender: 'female' },
    { name: 'Korean Female', lang: 'ko-KR', gender: 'female' },
  ];
}

/**
 * Language codes for read aloud
 */
export const READ_ALOUD_LANGUAGES = [
  { code: 'en-US', name: 'English (US)', flag: '🇺🇸' },
  { code: 'en-GB', name: 'English (UK)', flag: '🇬🇧' },
  { code: 'en-AU', name: 'English (Australia)', flag: '🇦🇺' },
  { code: 'es-ES', name: 'Spanish (Spain)', flag: '🇪🇸' },
  { code: 'es-MX', name: 'Spanish (Mexico)', flag: '🇲🇽' },
  { code: 'fr-FR', name: 'French', flag: '🇫🇷' },
  { code: 'de-DE', name: 'German', flag: '🇩🇪' },
  { code: 'it-IT', name: 'Italian', flag: '🇮🇹' },
  { code: 'pt-BR', name: 'Portuguese (Brazil)', flag: '🇧🇷' },
  { code: 'pt-PT', name: 'Portuguese (Portugal)', flag: '🇵🇹' },
  { code: 'zh-CN', name: 'Chinese (Simplified)', flag: '🇨🇳' },
  { code: 'zh-TW', name: 'Chinese (Traditional)', flag: '🇹🇼' },
  { code: 'ja-JP', name: 'Japanese', flag: '🇯🇵' },
  { code: 'ko-KR', name: 'Korean', flag: '🇰🇷' },
  { code: 'ar-SA', name: 'Arabic', flag: '🇸🇦' },
  { code: 'hi-IN', name: 'Hindi', flag: '🇮🇳' },
  { code: 'ru-RU', name: 'Russian', flag: '🇷🇺' },
  { code: 'nl-NL', name: 'Dutch', flag: '🇳🇱' },
  { code: 'pl-PL', name: 'Polish', flag: '🇵🇱' },
  { code: 'tr-TR', name: 'Turkish', flag: '🇹🇷' },
  { code: 'vi-VN', name: 'Vietnamese', flag: '🇻🇳' },
  { code: 'th-TH', name: 'Thai', flag: '🇹🇭' },
  { code: 'id-ID', name: 'Indonesian', flag: '🇮🇩' },
  { code: 'ms-MY', name: 'Malay', flag: '🇲🇾' },
  { code: 'sv-SE', name: 'Swedish', flag: '🇸🇪' },
  { code: 'da-DK', name: 'Danish', flag: '🇩🇰' },
  { code: 'no-NO', name: 'Norwegian', flag: '🇳🇴' },
  { code: 'fi-FI', name: 'Finnish', flag: '🇫🇮' },
  { code: 'el-GR', name: 'Greek', flag: '🇬🇷' },
  { code: 'he-IL', name: 'Hebrew', flag: '🇮🇱' },
  { code: 'cs-CZ', name: 'Czech', flag: '🇨🇿' },
  { code: 'hu-HU', name: 'Hungarian', flag: '🇭🇺' },
  { code: 'ro-RO', name: 'Romanian', flag: '🇷🇴' },
  { code: 'uk-UA', name: 'Ukrainian', flag: '🇺🇦' },
];

/**
 * Speed presets for read aloud
 */
export const SPEED_PRESETS = [
  { value: 0.5, label: '0.5x (Very Slow)' },
  { value: 0.75, label: '0.75x (Slow)' },
  { value: 1.0, label: '1x (Normal)' },
  { value: 1.25, label: '1.25x (Fast)' },
  { value: 1.5, label: '1.5x (Faster)' },
  { value: 1.75, label: '1.75x (Very Fast)' },
  { value: 2.0, label: '2x (Maximum)' },
];

/**
 * Keyboard shortcuts for read aloud
 */
export const READ_ALOUD_SHORTCUTS = {
  playPause: 'Space',
  stop: 'Escape',
  skipForward: 'ArrowRight',
  skipBackward: 'ArrowLeft',
  speedUp: 'ArrowUp',
  speedDown: 'ArrowDown',
  nextPage: 'PageDown',
  previousPage: 'PageUp',
};

/**
 * Clean text for better speech synthesis
 */
export function cleanTextForSpeech(text: string): string {
  return text
    // Remove multiple spaces
    .replace(/\s+/g, ' ')
    // Remove special characters that might cause issues
    .replace(/[•◦▪▫]/g, '')
    // Convert common abbreviations
    .replace(/\betc\./gi, 'etcetera')
    .replace(/\be\.g\./gi, 'for example')
    .replace(/\bi\.e\./gi, 'that is')
    // Add pauses after colons
    .replace(/:/g, ': ')
    // Clean up
    .trim();
}

/**
 * Detect language from text (simple heuristic)
 */
export function detectLanguage(text: string): string {
  // Simple detection based on character ranges
  const sample = text.slice(0, 500);
  
  // Chinese characters
  if (/[\u4e00-\u9fff]/.test(sample)) {
    return 'zh-CN';
  }
  
  // Japanese (Hiragana/Katakana)
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(sample)) {
    return 'ja-JP';
  }
  
  // Korean (Hangul)
  if (/[\uac00-\ud7af]/.test(sample)) {
    return 'ko-KR';
  }
  
  // Arabic
  if (/[\u0600-\u06ff]/.test(sample)) {
    return 'ar-SA';
  }
  
  // Hebrew
  if (/[\u0590-\u05ff]/.test(sample)) {
    return 'he-IL';
  }
  
  // Cyrillic (Russian, Ukrainian, etc.)
  if (/[\u0400-\u04ff]/.test(sample)) {
    return 'ru-RU';
  }
  
  // Greek
  if (/[\u0370-\u03ff]/.test(sample)) {
    return 'el-GR';
  }
  
  // Thai
  if (/[\u0e00-\u0e7f]/.test(sample)) {
    return 'th-TH';
  }
  
  // Hindi/Devanagari
  if (/[\u0900-\u097f]/.test(sample)) {
    return 'hi-IN';
  }
  
  // Default to English
  return 'en-US';
}
