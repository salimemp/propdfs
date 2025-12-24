// ==================== CONVERSION PROGRESS TRACKING SERVICE ====================
// Real-time progress tracking for PDF conversions

export interface ConversionProgress {
  id: string;
  userId: number;
  fileName: string;
  conversionType: string;
  status: "queued" | "processing" | "completed" | "failed" | "cancelled";
  progress: number; // 0-100
  currentStep: string;
  totalSteps: number;
  currentStepNumber: number;
  startedAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  error?: string;
  result?: {
    outputUrl?: string;
    outputSize?: number;
    pageCount?: number;
    processingTime?: number;
  };
  metadata?: Record<string, any>;
}

export interface ProgressUpdate {
  progress: number;
  currentStep: string;
  currentStepNumber?: number;
  metadata?: Record<string, any>;
}

// In-memory progress storage (in production, use Redis or similar)
const progressStore: Map<string, ConversionProgress> = new Map();
const userProgressMap: Map<number, Set<string>> = new Map();

// Progress event listeners
type ProgressListener = (progress: ConversionProgress) => void;
const listeners: Map<string, Set<ProgressListener>> = new Map();

// ==================== CONVERSION STEPS ====================
export const CONVERSION_STEPS = {
  PDF_TO_WORD: [
    "Uploading file",
    "Analyzing PDF structure",
    "Extracting text content",
    "Converting images",
    "Formatting document",
    "Generating Word file",
    "Finalizing conversion",
  ],
  PDF_TO_EXCEL: [
    "Uploading file",
    "Analyzing PDF structure",
    "Detecting tables",
    "Extracting table data",
    "Formatting cells",
    "Generating Excel file",
    "Finalizing conversion",
  ],
  PDF_TO_POWERPOINT: [
    "Uploading file",
    "Analyzing PDF structure",
    "Extracting slides",
    "Converting graphics",
    "Formatting slides",
    "Generating PowerPoint file",
    "Finalizing conversion",
  ],
  PDF_TO_IMAGE: [
    "Uploading file",
    "Analyzing PDF pages",
    "Rendering pages",
    "Optimizing images",
    "Generating output",
    "Finalizing conversion",
  ],
  WORD_TO_PDF: [
    "Uploading file",
    "Parsing document",
    "Converting styles",
    "Rendering pages",
    "Generating PDF",
    "Finalizing conversion",
  ],
  EXCEL_TO_PDF: [
    "Uploading file",
    "Parsing spreadsheet",
    "Formatting tables",
    "Rendering pages",
    "Generating PDF",
    "Finalizing conversion",
  ],
  IMAGE_TO_PDF: [
    "Uploading file",
    "Processing images",
    "Optimizing quality",
    "Creating PDF pages",
    "Generating PDF",
    "Finalizing conversion",
  ],
  MERGE_PDF: [
    "Uploading files",
    "Analyzing PDFs",
    "Merging pages",
    "Optimizing output",
    "Generating merged PDF",
    "Finalizing conversion",
  ],
  SPLIT_PDF: [
    "Uploading file",
    "Analyzing PDF",
    "Splitting pages",
    "Creating output files",
    "Generating split PDFs",
    "Finalizing conversion",
  ],
  COMPRESS_PDF: [
    "Uploading file",
    "Analyzing content",
    "Compressing images",
    "Optimizing fonts",
    "Reducing file size",
    "Generating compressed PDF",
    "Finalizing conversion",
  ],
  OCR_PDF: [
    "Uploading file",
    "Analyzing pages",
    "Detecting text regions",
    "Running OCR engine",
    "Embedding text layer",
    "Generating searchable PDF",
    "Finalizing conversion",
  ],
  DEFAULT: [
    "Uploading file",
    "Processing",
    "Converting",
    "Generating output",
    "Finalizing conversion",
  ],
};

// ==================== PROGRESS MANAGEMENT ====================

export function createConversion(options: {
  userId: number;
  fileName: string;
  conversionType: string;
  metadata?: Record<string, any>;
}): ConversionProgress {
  const id = `conv_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const steps = CONVERSION_STEPS[options.conversionType as keyof typeof CONVERSION_STEPS] || CONVERSION_STEPS.DEFAULT;
  
  const progress: ConversionProgress = {
    id,
    userId: options.userId,
    fileName: options.fileName,
    conversionType: options.conversionType,
    status: "queued",
    progress: 0,
    currentStep: steps[0],
    totalSteps: steps.length,
    currentStepNumber: 0,
    startedAt: new Date(),
    updatedAt: new Date(),
    metadata: options.metadata,
  };
  
  progressStore.set(id, progress);
  
  // Add to user's progress list
  let userProgress = userProgressMap.get(options.userId);
  if (!userProgress) {
    userProgress = new Set();
    userProgressMap.set(options.userId, userProgress);
  }
  userProgress.add(id);
  
  notifyListeners(id, progress);
  return progress;
}

export function updateProgress(id: string, update: ProgressUpdate): ConversionProgress | null {
  const progress = progressStore.get(id);
  if (!progress) return null;
  
  progress.progress = Math.min(100, Math.max(0, update.progress));
  progress.currentStep = update.currentStep;
  if (update.currentStepNumber !== undefined) {
    progress.currentStepNumber = update.currentStepNumber;
  }
  progress.status = "processing";
  progress.updatedAt = new Date();
  
  if (update.metadata) {
    progress.metadata = { ...progress.metadata, ...update.metadata };
  }
  
  progressStore.set(id, progress);
  notifyListeners(id, progress);
  
  return progress;
}

export function completeConversion(id: string, result?: ConversionProgress["result"]): ConversionProgress | null {
  const progress = progressStore.get(id);
  if (!progress) return null;
  
  progress.status = "completed";
  progress.progress = 100;
  progress.currentStep = "Completed";
  progress.completedAt = new Date();
  progress.updatedAt = new Date();
  
  if (result) {
    progress.result = {
      ...result,
      processingTime: progress.completedAt.getTime() - progress.startedAt.getTime(),
    };
  }
  
  progressStore.set(id, progress);
  notifyListeners(id, progress);
  
  // Schedule cleanup after 1 hour
  setTimeout(() => {
    cleanupConversion(id);
  }, 60 * 60 * 1000);
  
  return progress;
}

export function failConversion(id: string, error: string): ConversionProgress | null {
  const progress = progressStore.get(id);
  if (!progress) return null;
  
  progress.status = "failed";
  progress.error = error;
  progress.updatedAt = new Date();
  
  progressStore.set(id, progress);
  notifyListeners(id, progress);
  
  return progress;
}

export function cancelConversion(id: string): ConversionProgress | null {
  const progress = progressStore.get(id);
  if (!progress) return null;
  
  if (progress.status === "completed" || progress.status === "failed") {
    return progress; // Cannot cancel completed/failed conversions
  }
  
  progress.status = "cancelled";
  progress.updatedAt = new Date();
  
  progressStore.set(id, progress);
  notifyListeners(id, progress);
  
  return progress;
}

export function getProgress(id: string): ConversionProgress | null {
  return progressStore.get(id) || null;
}

export function getUserConversions(userId: number): ConversionProgress[] {
  const userProgress = userProgressMap.get(userId);
  if (!userProgress) return [];
  
  return Array.from(userProgress)
    .map((id) => progressStore.get(id))
    .filter((p): p is ConversionProgress => p !== undefined)
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
}

export function getActiveConversions(userId: number): ConversionProgress[] {
  return getUserConversions(userId).filter(
    (p) => p.status === "queued" || p.status === "processing"
  );
}

export function getRecentConversions(userId: number, limit: number = 10): ConversionProgress[] {
  return getUserConversions(userId).slice(0, limit);
}

// ==================== EVENT LISTENERS ====================

export function subscribeToProgress(id: string, listener: ProgressListener): () => void {
  let progressListeners = listeners.get(id);
  if (!progressListeners) {
    progressListeners = new Set();
    listeners.set(id, progressListeners);
  }
  progressListeners.add(listener);
  
  // Return unsubscribe function
  return () => {
    progressListeners?.delete(listener);
    if (progressListeners?.size === 0) {
      listeners.delete(id);
    }
  };
}

function notifyListeners(id: string, progress: ConversionProgress): void {
  const progressListeners = listeners.get(id);
  if (progressListeners) {
    progressListeners.forEach((listener) => {
      try {
        listener(progress);
      } catch (error) {
        console.error("Error in progress listener:", error);
      }
    });
  }
}

// ==================== CLEANUP ====================

function cleanupConversion(id: string): void {
  const progress = progressStore.get(id);
  if (!progress) return;
  
  progressStore.delete(id);
  
  const userProgress = userProgressMap.get(progress.userId);
  if (userProgress) {
    userProgress.delete(id);
    if (userProgress.size === 0) {
      userProgressMap.delete(progress.userId);
    }
  }
  
  listeners.delete(id);
}

export function cleanupOldConversions(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
  const now = Date.now();
  let cleaned = 0;
  
  progressStore.forEach((progress, id) => {
    const age = now - progress.updatedAt.getTime();
    if (age > maxAgeMs && (progress.status === "completed" || progress.status === "failed" || progress.status === "cancelled")) {
      cleanupConversion(id);
      cleaned++;
    }
  });
  
  return cleaned;
}

// ==================== STATISTICS ====================

export function getConversionStats(userId?: number): {
  total: number;
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
  averageProcessingTime: number;
} {
  const conversions = userId ? getUserConversions(userId) : Array.from(progressStore.values());
  
  const stats = {
    total: conversions.length,
    queued: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    averageProcessingTime: 0,
  };
  
  let totalProcessingTime = 0;
  let completedCount = 0;
  
  conversions.forEach((conv) => {
    stats[conv.status]++;
    if (conv.status === "completed" && conv.result?.processingTime) {
      totalProcessingTime += conv.result.processingTime;
      completedCount++;
    }
  });
  
  if (completedCount > 0) {
    stats.averageProcessingTime = Math.round(totalProcessingTime / completedCount);
  }
  
  return stats;
}

// ==================== SIMULATION (for testing) ====================

export async function simulateConversion(
  id: string,
  durationMs: number = 5000
): Promise<ConversionProgress | null> {
  const progress = progressStore.get(id);
  if (!progress) return null;
  
  const steps = CONVERSION_STEPS[progress.conversionType as keyof typeof CONVERSION_STEPS] || CONVERSION_STEPS.DEFAULT;
  const stepDuration = durationMs / steps.length;
  
  for (let i = 0; i < steps.length; i++) {
    // Check if cancelled
    const current = progressStore.get(id);
    if (!current || current.status === "cancelled") {
      return current || null;
    }
    
    updateProgress(id, {
      progress: Math.round(((i + 1) / steps.length) * 100),
      currentStep: steps[i],
      currentStepNumber: i + 1,
    });
    
    await new Promise((resolve) => setTimeout(resolve, stepDuration));
  }
  
  return completeConversion(id, {
    outputUrl: `/api/files/output_${id}.pdf`,
    outputSize: Math.floor(Math.random() * 1000000) + 100000,
    pageCount: Math.floor(Math.random() * 20) + 1,
  });
}
