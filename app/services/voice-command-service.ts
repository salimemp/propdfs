/**
 * Voice Command Service
 * Handles voice recognition and command parsing for application control
 */

// Voice command types
export type VoiceCommandType = 
  | 'navigation'
  | 'conversion'
  | 'pdf_operation'
  | 'file_operation'
  | 'settings'
  | 'help'
  | 'unknown';

export interface ParsedCommand {
  type: VoiceCommandType;
  action: string;
  parameters: Record<string, string | number | boolean>;
  confidence: number;
  originalTranscript: string;
}

export interface VoiceCommandResult {
  success: boolean;
  command?: ParsedCommand;
  response: string;
  action?: () => void;
}

// Command patterns for matching
const COMMAND_PATTERNS: Array<{
  pattern: RegExp;
  type: VoiceCommandType;
  action: string;
  extractParams?: (match: RegExpMatchArray) => Record<string, any>;
}> = [
  // Navigation commands
  {
    pattern: /^(go to|open|navigate to|show me the?)\s+(dashboard|home|convert|files|teams?|settings|analytics|pricing|editor|compare|form)/i,
    type: 'navigation',
    action: 'navigate',
    extractParams: (match) => ({ page: match[2].toLowerCase() }),
  },
  {
    pattern: /^(go )?back$/i,
    type: 'navigation',
    action: 'back',
  },
  
  // Conversion commands
  {
    pattern: /^convert\s+(?:this\s+)?(?:file\s+)?(?:to\s+)?(pdf|word|excel|powerpoint|image|jpg|png|html|markdown)/i,
    type: 'conversion',
    action: 'convert',
    extractParams: (match) => ({ targetFormat: match[1].toLowerCase() }),
  },
  {
    pattern: /^(pdf to word|word to pdf|pdf to excel|excel to pdf|pdf to image|image to pdf)/i,
    type: 'conversion',
    action: 'convert',
    extractParams: (match) => {
      const parts = match[1].toLowerCase().split(' to ');
      return { sourceFormat: parts[0], targetFormat: parts[1] };
    },
  },
  
  // PDF operation commands
  {
    pattern: /^merge\s+(?:these\s+)?(?:pdf\s+)?files?/i,
    type: 'pdf_operation',
    action: 'merge',
  },
  {
    pattern: /^split\s+(?:this\s+)?(?:pdf\s+)?(?:file)?/i,
    type: 'pdf_operation',
    action: 'split',
  },
  {
    pattern: /^compress\s+(?:this\s+)?(?:pdf\s+)?(?:file)?/i,
    type: 'pdf_operation',
    action: 'compress',
  },
  {
    pattern: /^rotate\s+(?:this\s+)?(?:pdf\s+)?(?:file)?\s*(?:(left|right|clockwise|counter.?clockwise))?/i,
    type: 'pdf_operation',
    action: 'rotate',
    extractParams: (match) => ({ direction: match[1]?.toLowerCase() || 'right' }),
  },
  {
    pattern: /^add\s+watermark/i,
    type: 'pdf_operation',
    action: 'watermark',
  },
  {
    pattern: /^(encrypt|protect|password protect)\s+(?:this\s+)?(?:pdf\s+)?(?:file)?/i,
    type: 'pdf_operation',
    action: 'encrypt',
  },
  {
    pattern: /^(decrypt|remove password|unlock)\s+(?:this\s+)?(?:pdf\s+)?(?:file)?/i,
    type: 'pdf_operation',
    action: 'decrypt',
  },
  
  // File operations
  {
    pattern: /^upload\s+(?:a\s+)?file/i,
    type: 'file_operation',
    action: 'upload',
  },
  {
    pattern: /^download\s+(?:this\s+)?(?:file)?/i,
    type: 'file_operation',
    action: 'download',
  },
  {
    pattern: /^delete\s+(?:this\s+)?(?:file)?/i,
    type: 'file_operation',
    action: 'delete',
  },
  {
    pattern: /^(search|find)\s+(?:for\s+)?(.+)/i,
    type: 'file_operation',
    action: 'search',
    extractParams: (match) => ({ query: match[2] }),
  },
  {
    pattern: /^create\s+(?:new\s+)?folder\s*(?:named?\s+)?(.+)?/i,
    type: 'file_operation',
    action: 'createFolder',
    extractParams: (match) => ({ name: match[1] }),
  },
  
  // Settings commands
  {
    pattern: /^(change|set|switch)\s+(?:to\s+)?(dark|light)\s+(?:mode|theme)/i,
    type: 'settings',
    action: 'changeTheme',
    extractParams: (match) => ({ theme: match[2].toLowerCase() }),
  },
  {
    pattern: /^(change|set)\s+language\s+(?:to\s+)?(.+)/i,
    type: 'settings',
    action: 'changeLanguage',
    extractParams: (match) => ({ language: match[2] }),
  },
  {
    pattern: /^(enable|disable|turn on|turn off)\s+(high contrast|accessibility|notifications)/i,
    type: 'settings',
    action: 'toggleSetting',
    extractParams: (match) => ({
      setting: match[2].toLowerCase().replace(/\s+/g, '_'),
      enabled: match[1].toLowerCase().includes('enable') || match[1].toLowerCase().includes('on'),
    }),
  },
  
  // Help commands
  {
    pattern: /^(help|what can you do|show commands|voice commands)/i,
    type: 'help',
    action: 'showHelp',
  },
  {
    pattern: /^how\s+(?:do\s+i|to)\s+(.+)/i,
    type: 'help',
    action: 'howTo',
    extractParams: (match) => ({ topic: match[1] }),
  },
];

/**
 * Parse voice transcript into a command
 */
export function parseVoiceCommand(transcript: string): ParsedCommand {
  const normalizedTranscript = transcript.trim().toLowerCase();
  
  for (const { pattern, type, action, extractParams } of COMMAND_PATTERNS) {
    const match = normalizedTranscript.match(pattern);
    if (match) {
      return {
        type,
        action,
        parameters: extractParams ? extractParams(match) : {},
        confidence: 0.9, // High confidence for pattern match
        originalTranscript: transcript,
      };
    }
  }
  
  // No pattern matched
  return {
    type: 'unknown',
    action: 'unknown',
    parameters: {},
    confidence: 0.3,
    originalTranscript: transcript,
  };
}

/**
 * Get navigation path for a page name
 */
export function getNavigationPath(pageName: string): string | null {
  const paths: Record<string, string> = {
    dashboard: '/dashboard',
    home: '/',
    convert: '/convert',
    files: '/files',
    team: '/teams',
    teams: '/teams',
    settings: '/settings',
    analytics: '/analytics',
    pricing: '/pricing',
    editor: '/editor',
    compare: '/compare',
    form: '/form-filling',
  };
  
  return paths[pageName] || null;
}

/**
 * Generate voice feedback response
 */
export function generateVoiceResponse(command: ParsedCommand): string {
  switch (command.type) {
    case 'navigation':
      return `Navigating to ${command.parameters.page || 'the requested page'}`;
    
    case 'conversion':
      if (command.parameters.sourceFormat && command.parameters.targetFormat) {
        return `Starting conversion from ${command.parameters.sourceFormat} to ${command.parameters.targetFormat}`;
      }
      return `Converting to ${command.parameters.targetFormat || 'the selected format'}`;
    
    case 'pdf_operation':
      const operations: Record<string, string> = {
        merge: 'Merging PDF files',
        split: 'Splitting PDF file',
        compress: 'Compressing PDF file',
        rotate: `Rotating PDF ${command.parameters.direction || 'clockwise'}`,
        watermark: 'Opening watermark options',
        encrypt: 'Opening encryption options',
        decrypt: 'Removing password protection',
      };
      return operations[command.action] || 'Processing PDF';
    
    case 'file_operation':
      const fileOps: Record<string, string> = {
        upload: 'Opening file upload dialog',
        download: 'Downloading file',
        delete: 'Deleting file',
        search: `Searching for "${command.parameters.query}"`,
        createFolder: `Creating folder ${command.parameters.name || ''}`,
      };
      return fileOps[command.action] || 'Processing file operation';
    
    case 'settings':
      if (command.action === 'changeTheme') {
        return `Switching to ${command.parameters.theme} mode`;
      }
      if (command.action === 'changeLanguage') {
        return `Changing language to ${command.parameters.language}`;
      }
      return 'Updating settings';
    
    case 'help':
      return 'Here are some things you can say...';
    
    default:
      return "I didn't understand that command. Say 'help' for available commands.";
  }
}

/**
 * Get list of available voice commands for help
 */
export function getAvailableCommands(): Array<{
  category: string;
  commands: Array<{ phrase: string; description: string }>;
}> {
  return [
    {
      category: 'Navigation',
      commands: [
        { phrase: 'Go to dashboard', description: 'Navigate to the dashboard' },
        { phrase: 'Open convert', description: 'Open the conversion page' },
        { phrase: 'Show me the files', description: 'Navigate to file manager' },
        { phrase: 'Go to settings', description: 'Open settings page' },
        { phrase: 'Go back', description: 'Return to previous page' },
      ],
    },
    {
      category: 'Conversions',
      commands: [
        { phrase: 'Convert to PDF', description: 'Convert current file to PDF' },
        { phrase: 'PDF to Word', description: 'Convert PDF to Word document' },
        { phrase: 'Convert to image', description: 'Convert PDF to images' },
      ],
    },
    {
      category: 'PDF Operations',
      commands: [
        { phrase: 'Merge files', description: 'Merge multiple PDFs' },
        { phrase: 'Split PDF', description: 'Split PDF into pages' },
        { phrase: 'Compress PDF', description: 'Reduce PDF file size' },
        { phrase: 'Rotate left/right', description: 'Rotate PDF pages' },
        { phrase: 'Add watermark', description: 'Add watermark to PDF' },
        { phrase: 'Encrypt PDF', description: 'Password protect PDF' },
      ],
    },
    {
      category: 'File Operations',
      commands: [
        { phrase: 'Upload file', description: 'Open file upload dialog' },
        { phrase: 'Download file', description: 'Download current file' },
        { phrase: 'Search for [query]', description: 'Search files' },
        { phrase: 'Create folder [name]', description: 'Create new folder' },
      ],
    },
    {
      category: 'Settings',
      commands: [
        { phrase: 'Switch to dark mode', description: 'Enable dark theme' },
        { phrase: 'Change language to [language]', description: 'Change UI language' },
        { phrase: 'Enable high contrast', description: 'Enable accessibility mode' },
      ],
    },
    {
      category: 'Help',
      commands: [
        { phrase: 'Help', description: 'Show available commands' },
        { phrase: 'How do I [task]', description: 'Get help with a task' },
      ],
    },
  ];
}

/**
 * Supported languages for voice recognition
 */
export const SUPPORTED_VOICE_LANGUAGES = [
  { code: 'en-US', name: 'English (US)' },
  { code: 'en-GB', name: 'English (UK)' },
  { code: 'es-ES', name: 'Spanish (Spain)' },
  { code: 'es-MX', name: 'Spanish (Mexico)' },
  { code: 'fr-FR', name: 'French' },
  { code: 'de-DE', name: 'German' },
  { code: 'it-IT', name: 'Italian' },
  { code: 'pt-BR', name: 'Portuguese (Brazil)' },
  { code: 'pt-PT', name: 'Portuguese (Portugal)' },
  { code: 'zh-CN', name: 'Chinese (Simplified)' },
  { code: 'zh-TW', name: 'Chinese (Traditional)' },
  { code: 'ja-JP', name: 'Japanese' },
  { code: 'ko-KR', name: 'Korean' },
  { code: 'ar-SA', name: 'Arabic' },
  { code: 'hi-IN', name: 'Hindi' },
  { code: 'ru-RU', name: 'Russian' },
  { code: 'nl-NL', name: 'Dutch' },
  { code: 'pl-PL', name: 'Polish' },
  { code: 'tr-TR', name: 'Turkish' },
  { code: 'vi-VN', name: 'Vietnamese' },
];
