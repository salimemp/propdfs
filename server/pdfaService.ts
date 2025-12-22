/**
 * PDF/A Compliance Conversion Service
 * 
 * Converts standard PDFs to PDF/A archival format for long-term preservation
 * and regulatory compliance using Ghostscript.
 * 
 * Supported conformance levels:
 * - PDF/A-1b: Basic conformance (ISO 19005-1)
 * - PDF/A-2b: ISO 19005-2 with JPEG2000, transparency support
 * - PDF/A-3b: ISO 19005-3 with embedded file attachments
 */

import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import { nanoid } from "nanoid";
import { storagePut } from "./storage";

const execAsync = promisify(exec);

// PDF/A conformance levels
export type PDFAConformanceLevel = "1b" | "2b" | "3b";

export interface PDFAConversionOptions {
  pdfBuffer: Buffer;
  conformanceLevel: PDFAConformanceLevel;
  embedFonts?: boolean;
  colorProfile?: "sRGB" | "AdobeRGB" | "CMYK";
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
}

export interface PDFAConversionResult {
  success: boolean;
  url?: string;
  fileKey?: string;
  conformanceLevel?: PDFAConformanceLevel;
  fileSize?: number;
  error?: string;
  validationPassed?: boolean;
  warnings?: string[];
}

export interface PDFAValidationResult {
  isValid: boolean;
  conformanceLevel?: PDFAConformanceLevel;
  errors: string[];
  warnings: string[];
}

/**
 * Get the Ghostscript PDF/A definition file path based on conformance level
 */
function getPDFADefPath(level: PDFAConformanceLevel): string {
  const defFiles: Record<PDFAConformanceLevel, string> = {
    "1b": "/usr/share/ghostscript/9.55.0/lib/PDFA_def.ps",
    "2b": "/usr/share/ghostscript/9.55.0/lib/PDFA_def.ps",
    "3b": "/usr/share/ghostscript/9.55.0/lib/PDFA_def.ps",
  };
  return defFiles[level];
}

/**
 * Get the PDF/A compatibility level for Ghostscript
 */
function getPDFACompatLevel(level: PDFAConformanceLevel): string {
  const compatLevels: Record<PDFAConformanceLevel, string> = {
    "1b": "1",
    "2b": "2",
    "3b": "3",
  };
  return compatLevels[level];
}

/**
 * Create a custom PDFA definition file with metadata
 */
async function createPDFADefFile(
  tempDir: string,
  options: PDFAConversionOptions
): Promise<string> {
  const defContent = `
%!PS
% Custom PDF/A definition file

% Set PDF/A conformance level
/ICCProfile (/usr/share/color/icc/ghostscript/srgb.icc) def

[ /Title (${options.title || "Untitled"})
  /Author (${options.author || "ProPDFs"})
  /Subject (${options.subject || "PDF/A Converted Document"})
  /Keywords (${options.keywords || "PDF/A, archival, compliance"})
  /Creator (ProPDFs PDF/A Converter)
  /Producer (Ghostscript with ProPDFs)
  /DOCINFO pdfmark

% PDF/A-${options.conformanceLevel} specific settings
`;

  const defPath = path.join(tempDir, "pdfa_custom_def.ps");
  await fs.writeFile(defPath, defContent);
  return defPath;
}

/**
 * Convert a PDF to PDF/A format using Ghostscript
 */
export async function convertToPDFA(
  options: PDFAConversionOptions
): Promise<PDFAConversionResult> {
  const tempDir = `/tmp/pdfa-${nanoid()}`;
  const inputPath = path.join(tempDir, "input.pdf");
  const outputPath = path.join(tempDir, "output.pdf");
  const warnings: string[] = [];

  try {
    // Create temp directory
    await fs.mkdir(tempDir, { recursive: true });

    // Write input PDF
    await fs.writeFile(inputPath, options.pdfBuffer);

    // Build Ghostscript command for PDF/A conversion
    const compatLevel = getPDFACompatLevel(options.conformanceLevel);
    
    // Ghostscript command for PDF/A conversion
    const gsCommand = [
      "gs",
      "-dPDFA=" + compatLevel,
      "-dBATCH",
      "-dNOPAUSE",
      "-dNOOUTERSAVE",
      "-dUseCIEColor",
      "-sProcessColorModel=DeviceRGB",
      "-sDEVICE=pdfwrite",
      "-dPDFACompatibilityPolicy=1",
      options.embedFonts !== false ? "-dEmbedAllFonts=true" : "",
      "-dSubsetFonts=true",
      "-dCompressFonts=true",
      "-dOptimize=true",
      `-sOutputFile="${outputPath}"`,
      `"${inputPath}"`,
    ]
      .filter(Boolean)
      .join(" ");

    // Execute conversion
    const { stdout, stderr } = await execAsync(gsCommand, {
      timeout: 120000, // 2 minute timeout
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer
    });

    // Check for warnings in stderr
    if (stderr) {
      const stderrLines = stderr.split("\n").filter((line) => line.trim());
      stderrLines.forEach((line) => {
        if (line.toLowerCase().includes("warning")) {
          warnings.push(line);
        }
      });
    }

    // Read output file
    const outputBuffer = await fs.readFile(outputPath);
    const fileSize = outputBuffer.length;

    // Upload to S3
    const fileKey = `pdfa/${nanoid()}-pdfa-${options.conformanceLevel}.pdf`;
    const { url } = await storagePut(fileKey, outputBuffer, "application/pdf");

    // Validate the output
    const validation = await validatePDFA(outputBuffer);

    return {
      success: true,
      url,
      fileKey,
      conformanceLevel: options.conformanceLevel,
      fileSize,
      validationPassed: validation.isValid,
      warnings: [...warnings, ...validation.warnings],
    };
  } catch (error) {
    console.error("[PDF/A] Conversion error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "PDF/A conversion failed",
      warnings,
    };
  } finally {
    // Cleanup temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Validate if a PDF is PDF/A compliant
 */
export async function validatePDFA(
  pdfBuffer: Buffer
): Promise<PDFAValidationResult> {
  const tempDir = `/tmp/pdfa-validate-${nanoid()}`;
  const inputPath = path.join(tempDir, "input.pdf");
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    await fs.mkdir(tempDir, { recursive: true });
    await fs.writeFile(inputPath, pdfBuffer);

    // Use Ghostscript to check PDF/A compliance
    // Note: Full validation would require a dedicated tool like veraPDF
    // This is a basic check using Ghostscript
    const gsCommand = [
      "gs",
      "-dPDFA",
      "-dBATCH",
      "-dNOPAUSE",
      "-dNODISPLAY",
      "-sColorConversionStrategy=UseDeviceIndependentColor",
      `"${inputPath}"`,
    ].join(" ");

    try {
      const { stderr } = await execAsync(gsCommand, {
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024,
      });

      if (stderr) {
        const stderrLines = stderr.split("\n").filter((line) => line.trim());
        stderrLines.forEach((line) => {
          if (line.toLowerCase().includes("error")) {
            errors.push(line);
          } else if (line.toLowerCase().includes("warning")) {
            warnings.push(line);
          }
        });
      }
    } catch (execError) {
      // Ghostscript may return non-zero for non-compliant PDFs
      if (execError instanceof Error) {
        errors.push(execError.message);
      }
    }

    // Check for PDF/A markers in the file
    const pdfContent = pdfBuffer.toString("latin1", 0, Math.min(pdfBuffer.length, 10000));
    const hasPDFAMarker = pdfContent.includes("pdfaid:part") || pdfContent.includes("PDF/A");
    
    if (!hasPDFAMarker && errors.length === 0) {
      warnings.push("PDF/A identification marker not found in document metadata");
    }

    // Detect conformance level from metadata
    let detectedLevel: PDFAConformanceLevel | undefined;
    if (pdfContent.includes("pdfaid:part>1") || pdfContent.includes("pdfaid:part=\"1\"")) {
      detectedLevel = "1b";
    } else if (pdfContent.includes("pdfaid:part>2") || pdfContent.includes("pdfaid:part=\"2\"")) {
      detectedLevel = "2b";
    } else if (pdfContent.includes("pdfaid:part>3") || pdfContent.includes("pdfaid:part=\"3\"")) {
      detectedLevel = "3b";
    }

    return {
      isValid: errors.length === 0,
      conformanceLevel: detectedLevel,
      errors,
      warnings,
    };
  } catch (error) {
    return {
      isValid: false,
      errors: [error instanceof Error ? error.message : "Validation failed"],
      warnings,
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
 * Get PDF/A compliance information for a document
 */
export async function getPDFAInfo(pdfBuffer: Buffer): Promise<{
  isPDFA: boolean;
  conformanceLevel?: PDFAConformanceLevel;
  metadata: {
    title?: string;
    author?: string;
    subject?: string;
    creator?: string;
    producer?: string;
    creationDate?: string;
    modificationDate?: string;
  };
  fonts: {
    name: string;
    embedded: boolean;
    type: string;
  }[];
  colorSpaces: string[];
  hasTransparency: boolean;
  hasJavaScript: boolean;
  hasEncryption: boolean;
}> {
  const tempDir = `/tmp/pdfa-info-${nanoid()}`;
  const inputPath = path.join(tempDir, "input.pdf");

  try {
    await fs.mkdir(tempDir, { recursive: true });
    await fs.writeFile(inputPath, pdfBuffer);

    // Get PDF info using Ghostscript
    const infoCommand = `gs -dNODISPLAY -dBATCH -dNOPAUSE -q -sFile="${inputPath}" -c "File (r) file runpdfbegin pdfpagecount = quit"`;
    
    // Basic metadata extraction from PDF header
    const pdfContent = pdfBuffer.toString("latin1", 0, Math.min(pdfBuffer.length, 50000));
    
    // Check for PDF/A markers
    const hasPDFAMarker = pdfContent.includes("pdfaid:part") || pdfContent.includes("PDF/A");
    
    // Detect conformance level
    let conformanceLevel: PDFAConformanceLevel | undefined;
    if (pdfContent.includes("pdfaid:part>1") || pdfContent.includes("pdfaid:part=\"1\"")) {
      conformanceLevel = "1b";
    } else if (pdfContent.includes("pdfaid:part>2") || pdfContent.includes("pdfaid:part=\"2\"")) {
      conformanceLevel = "2b";
    } else if (pdfContent.includes("pdfaid:part>3") || pdfContent.includes("pdfaid:part=\"3\"")) {
      conformanceLevel = "3b";
    }

    // Extract basic metadata using regex
    const extractMetadata = (key: string): string | undefined => {
      const regex = new RegExp(`/${key}\\s*\\(([^)]+)\\)`, "i");
      const match = pdfContent.match(regex);
      return match ? match[1] : undefined;
    };

    // Check for problematic elements
    const hasTransparency = pdfContent.includes("/SMask") || pdfContent.includes("/CA ") || pdfContent.includes("/ca ");
    const hasJavaScript = pdfContent.includes("/JavaScript") || pdfContent.includes("/JS ");
    const hasEncryption = pdfContent.includes("/Encrypt");

    // Extract color spaces
    const colorSpaces: string[] = [];
    if (pdfContent.includes("/DeviceRGB")) colorSpaces.push("DeviceRGB");
    if (pdfContent.includes("/DeviceCMYK")) colorSpaces.push("DeviceCMYK");
    if (pdfContent.includes("/DeviceGray")) colorSpaces.push("DeviceGray");
    if (pdfContent.includes("/ICCBased")) colorSpaces.push("ICCBased");
    if (pdfContent.includes("/CalRGB")) colorSpaces.push("CalRGB");
    if (pdfContent.includes("/CalGray")) colorSpaces.push("CalGray");

    return {
      isPDFA: hasPDFAMarker,
      conformanceLevel,
      metadata: {
        title: extractMetadata("Title"),
        author: extractMetadata("Author"),
        subject: extractMetadata("Subject"),
        creator: extractMetadata("Creator"),
        producer: extractMetadata("Producer"),
        creationDate: extractMetadata("CreationDate"),
        modificationDate: extractMetadata("ModDate"),
      },
      fonts: [], // Would require more complex parsing
      colorSpaces,
      hasTransparency,
      hasJavaScript,
      hasEncryption,
    };
  } catch (error) {
    console.error("[PDF/A] Info extraction error:", error);
    return {
      isPDFA: false,
      metadata: {},
      fonts: [],
      colorSpaces: [],
      hasTransparency: false,
      hasJavaScript: false,
      hasEncryption: false,
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
 * Batch convert multiple PDFs to PDF/A
 */
export async function batchConvertToPDFA(
  files: { buffer: Buffer; filename: string }[],
  conformanceLevel: PDFAConformanceLevel,
  options?: Partial<PDFAConversionOptions>
): Promise<{
  results: (PDFAConversionResult & { filename: string })[];
  totalProcessed: number;
  successCount: number;
  failureCount: number;
}> {
  const results: (PDFAConversionResult & { filename: string })[] = [];
  let successCount = 0;
  let failureCount = 0;

  for (const file of files) {
    const result = await convertToPDFA({
      pdfBuffer: file.buffer,
      conformanceLevel,
      ...options,
    });

    results.push({
      ...result,
      filename: file.filename,
    });

    if (result.success) {
      successCount++;
    } else {
      failureCount++;
    }
  }

  return {
    results,
    totalProcessed: files.length,
    successCount,
    failureCount,
  };
}

/**
 * Get conformance level description
 */
export function getConformanceLevelDescription(level: PDFAConformanceLevel): {
  name: string;
  standard: string;
  description: string;
  features: string[];
  useCases: string[];
} {
  const descriptions: Record<PDFAConformanceLevel, ReturnType<typeof getConformanceLevelDescription>> = {
    "1b": {
      name: "PDF/A-1b",
      standard: "ISO 19005-1:2005",
      description: "Basic conformance level ensuring visual appearance preservation",
      features: [
        "All fonts embedded",
        "Device-independent color",
        "No encryption",
        "No JavaScript",
        "No audio/video",
        "XMP metadata required",
      ],
      useCases: [
        "Long-term document archiving",
        "Legal document preservation",
        "Government records",
        "Historical archives",
      ],
    },
    "2b": {
      name: "PDF/A-2b",
      standard: "ISO 19005-2:2011",
      description: "Extended conformance with JPEG2000 and transparency support",
      features: [
        "All PDF/A-1b features",
        "JPEG2000 compression",
        "Transparency support",
        "Layers (optional content)",
        "PDF/A-1 embedding",
        "OpenType fonts",
      ],
      useCases: [
        "Engineering documents",
        "Architectural plans",
        "Complex graphics preservation",
        "Multi-layer documents",
      ],
    },
    "3b": {
      name: "PDF/A-3b",
      standard: "ISO 19005-3:2012",
      description: "Full conformance with embedded file attachments",
      features: [
        "All PDF/A-2b features",
        "Any file type attachments",
        "Source data embedding",
        "XML data embedding",
        "Spreadsheet embedding",
        "Original file preservation",
      ],
      useCases: [
        "Invoice archiving (ZUGFeRD)",
        "E-invoicing compliance",
        "Source data preservation",
        "Regulatory compliance",
      ],
    },
  };

  return descriptions[level];
}
