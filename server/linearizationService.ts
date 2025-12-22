/**
 * PDF Linearization Service
 * 
 * Optimizes PDFs for fast web viewing (streaming delivery) using qpdf.
 * Linearized PDFs allow page-at-a-time downloading, enabling users to
 * view the first page while the rest of the document is still loading.
 * 
 * Benefits:
 * - Fast first-page display
 * - Efficient byte-serving for large documents
 * - Reduced perceived load time
 * - Better user experience for web-based PDF viewing
 */

import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import { nanoid } from "nanoid";
import { storagePut } from "./storage";

const execAsync = promisify(exec);

export interface LinearizationOptions {
  pdfBuffer: Buffer;
  /** Compress streams during linearization (default: true) */
  compressStreams?: boolean;
  /** Object stream mode: disable, preserve, or generate (default: preserve) */
  objectStreams?: "disable" | "preserve" | "generate";
  /** Minimum length for stream compression (default: 256) */
  minStreamLength?: number;
  /** Remove unreferenced objects (default: true) */
  removeUnreferencedResources?: boolean;
}

export interface LinearizationResult {
  success: boolean;
  url?: string;
  fileKey?: string;
  originalSize?: number;
  optimizedSize?: number;
  sizeReduction?: number;
  isLinearized?: boolean;
  error?: string;
}

export interface LinearizationCheckResult {
  isLinearized: boolean;
  details?: {
    linearizationVersion?: string;
    firstPageEndOffset?: number;
    pageCount?: number;
    hasHintStream?: boolean;
  };
  error?: string;
}

export interface PDFOptimizationInfo {
  isLinearized: boolean;
  fileSize: number;
  pageCount: number;
  pdfVersion: string;
  isEncrypted: boolean;
  hasObjectStreams: boolean;
  hasXrefStreams: boolean;
}

/**
 * Linearize a PDF for fast web viewing
 */
export async function linearizePdf(options: LinearizationOptions): Promise<LinearizationResult> {
  const {
    pdfBuffer,
    compressStreams = true,
    objectStreams = "preserve",
    minStreamLength = 256,
    removeUnreferencedResources = true,
  } = options;

  const tempDir = `/tmp/linearize-${nanoid()}`;
  const inputPath = path.join(tempDir, "input.pdf");
  const outputPath = path.join(tempDir, "output.pdf");

  try {
    // Create temp directory
    await fs.mkdir(tempDir, { recursive: true });

    // Write input PDF
    await fs.writeFile(inputPath, pdfBuffer);
    const originalSize = pdfBuffer.length;

    // Build qpdf command for linearization
    const args: string[] = [
      "--linearize",
    ];

    // Add compression options
    if (compressStreams) {
      args.push("--compress-streams=y");
    } else {
      args.push("--compress-streams=n");
    }

    // Add object stream mode
    args.push(`--object-streams=${objectStreams}`);

    // Add minimum stream length
    args.push(`--min-stream-length=${minStreamLength}`);

    // Add resource optimization
    if (removeUnreferencedResources) {
      args.push("--remove-unreferenced-resources=yes");
    }

    // Add decode level for better compression
    args.push("--decode-level=generalized");

    // Input and output files
    args.push(inputPath, outputPath);

    // Execute qpdf
    const command = `qpdf ${args.join(" ")}`;
    await execAsync(command, { timeout: 120000 });

    // Read the output file
    const outputBuffer = await fs.readFile(outputPath);
    const optimizedSize = outputBuffer.length;

    // Calculate size reduction
    const sizeReduction = ((originalSize - optimizedSize) / originalSize) * 100;

    // Upload to S3
    const fileKey = `linearized/${nanoid()}.pdf`;
    const { url } = await storagePut(fileKey, outputBuffer, "application/pdf");

    // Verify linearization
    const checkResult = await checkLinearization(outputBuffer);

    return {
      success: true,
      url,
      fileKey,
      originalSize,
      optimizedSize,
      sizeReduction: Math.max(0, sizeReduction),
      isLinearized: checkResult.isLinearized,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Linearization error:", errorMessage);

    return {
      success: false,
      error: `Linearization failed: ${errorMessage}`,
    };
  } finally {
    // Cleanup temp files
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Check if a PDF is linearized
 */
export async function checkLinearization(pdfBuffer: Buffer): Promise<LinearizationCheckResult> {
  const tempDir = `/tmp/check-linear-${nanoid()}`;
  const inputPath = path.join(tempDir, "input.pdf");

  try {
    await fs.mkdir(tempDir, { recursive: true });
    await fs.writeFile(inputPath, pdfBuffer);

    // Use qpdf to check linearization
    const { stdout } = await execAsync(`qpdf --check-linearization ${inputPath} 2>&1 || true`);

    const isLinearized = stdout.includes("linearization data:") || 
                         stdout.includes("File is linearized");

    // Parse additional details if linearized
    let details: LinearizationCheckResult["details"] = undefined;
    if (isLinearized) {
      details = {};
      
      // Extract linearization version
      const versionMatch = stdout.match(/linearization version:\s*(\d+\.?\d*)/i);
      if (versionMatch) {
        details.linearizationVersion = versionMatch[1];
      }

      // Check for hint stream
      details.hasHintStream = stdout.includes("hint stream");
    }

    return {
      isLinearized,
      details,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return {
      isLinearized: false,
      error: `Check failed: ${errorMessage}`,
    };
  } finally {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Get detailed PDF optimization information
 */
export async function getPdfOptimizationInfo(pdfBuffer: Buffer): Promise<PDFOptimizationInfo> {
  const tempDir = `/tmp/pdf-info-${nanoid()}`;
  const inputPath = path.join(tempDir, "input.pdf");

  try {
    await fs.mkdir(tempDir, { recursive: true });
    await fs.writeFile(inputPath, pdfBuffer);

    // Get PDF info using qpdf
    const { stdout } = await execAsync(`qpdf --show-npages ${inputPath} 2>&1 || echo "0"`);
    const pageCount = parseInt(stdout.trim()) || 0;

    // Check linearization
    const linearCheck = await checkLinearization(pdfBuffer);

    // Get more details with qpdf --check
    const { stdout: checkOutput } = await execAsync(`qpdf --check ${inputPath} 2>&1 || true`);

    // Parse PDF version
    const versionMatch = checkOutput.match(/PDF Version:\s*(\d+\.\d+)/i);
    const pdfVersion = versionMatch ? versionMatch[1] : "unknown";

    // Check encryption
    const isEncrypted = checkOutput.includes("encrypted") || 
                        checkOutput.includes("password");

    // Check for object streams
    const hasObjectStreams = checkOutput.includes("object stream");
    const hasXrefStreams = checkOutput.includes("xref stream");

    return {
      isLinearized: linearCheck.isLinearized,
      fileSize: pdfBuffer.length,
      pageCount,
      pdfVersion,
      isEncrypted,
      hasObjectStreams,
      hasXrefStreams,
    };
  } catch (error) {
    console.error("Error getting PDF info:", error);
    return {
      isLinearized: false,
      fileSize: pdfBuffer.length,
      pageCount: 0,
      pdfVersion: "unknown",
      isEncrypted: false,
      hasObjectStreams: false,
      hasXrefStreams: false,
    };
  } finally {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Optimize PDF for web with multiple optimization passes
 */
export async function optimizeForWeb(
  pdfBuffer: Buffer,
  options?: {
    aggressive?: boolean;
    preserveQuality?: boolean;
  }
): Promise<LinearizationResult> {
  const { aggressive = false, preserveQuality = true } = options || {};

  // First, linearize with appropriate settings
  const linearizationOptions: LinearizationOptions = {
    pdfBuffer,
    compressStreams: true,
    objectStreams: aggressive ? "generate" : "preserve",
    minStreamLength: aggressive ? 128 : 256,
    removeUnreferencedResources: true,
  };

  return linearizePdf(linearizationOptions);
}

/**
 * Batch linearize multiple PDFs
 */
export async function batchLinearize(
  pdfBuffers: Buffer[],
  options?: Omit<LinearizationOptions, "pdfBuffer">
): Promise<LinearizationResult[]> {
  const results: LinearizationResult[] = [];

  // Process in parallel with concurrency limit
  const concurrency = 5;
  for (let i = 0; i < pdfBuffers.length; i += concurrency) {
    const batch = pdfBuffers.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((buffer) =>
        linearizePdf({
          pdfBuffer: buffer,
          ...options,
        })
      )
    );
    results.push(...batchResults);
  }

  return results;
}

/**
 * Get linearization statistics for a set of PDFs
 */
export function getLinearizationStats(results: LinearizationResult[]): {
  totalProcessed: number;
  successful: number;
  failed: number;
  totalOriginalSize: number;
  totalOptimizedSize: number;
  averageSizeReduction: number;
  linearizedCount: number;
} {
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  const totalOriginalSize = successful.reduce((sum, r) => sum + (r.originalSize || 0), 0);
  const totalOptimizedSize = successful.reduce((sum, r) => sum + (r.optimizedSize || 0), 0);
  const linearizedCount = successful.filter((r) => r.isLinearized).length;

  const averageSizeReduction =
    successful.length > 0
      ? successful.reduce((sum, r) => sum + (r.sizeReduction || 0), 0) / successful.length
      : 0;

  return {
    totalProcessed: results.length,
    successful: successful.length,
    failed: failed.length,
    totalOriginalSize,
    totalOptimizedSize,
    averageSizeReduction,
    linearizedCount,
  };
}
