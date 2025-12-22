import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";

const execAsync = promisify(exec);

export interface EbookConversionOptions {
  inputBuffer: Buffer;
  inputFormat: "epub" | "mobi" | "azw" | "azw3" | "fb2" | "lit" | "pdb" | "pdf";
  outputFormat: "epub" | "mobi" | "pdf" | "txt" | "html" | "docx";
  title?: string;
  author?: string;
  cover?: Buffer;
  fontSize?: number;
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;
  pageSize?: "a4" | "letter" | "a5" | "b5";
}

export interface EbookMetadata {
  title?: string;
  author?: string;
  publisher?: string;
  language?: string;
  description?: string;
  isbn?: string;
  publicationDate?: string;
  tags?: string[];
  coverPath?: string;
}

export interface ConversionResult {
  url: string;
  fileKey: string;
  filename: string;
  size: number;
  metadata?: EbookMetadata;
}

/**
 * Convert e-book files using Calibre's ebook-convert command
 */
export async function convertEbook(options: EbookConversionOptions): Promise<ConversionResult> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ebook-"));
  const inputFilename = `input.${options.inputFormat}`;
  const outputFilename = `output.${options.outputFormat}`;
  const inputPath = path.join(tempDir, inputFilename);
  const outputPath = path.join(tempDir, outputFilename);

  try {
    // Write input file to temp directory
    await fs.writeFile(inputPath, options.inputBuffer);

    // Build ebook-convert command with options
    const args: string[] = [inputPath, outputPath];

    // Add metadata options
    if (options.title) {
      args.push("--title", `"${options.title}"`);
    }
    if (options.author) {
      args.push("--authors", `"${options.author}"`);
    }

    // Add PDF-specific options
    if (options.outputFormat === "pdf") {
      if (options.fontSize) {
        args.push("--pdf-default-font-size", options.fontSize.toString());
      }
      if (options.marginTop !== undefined) {
        args.push("--pdf-page-margin-top", options.marginTop.toString());
      }
      if (options.marginBottom !== undefined) {
        args.push("--pdf-page-margin-bottom", options.marginBottom.toString());
      }
      if (options.marginLeft !== undefined) {
        args.push("--pdf-page-margin-left", options.marginLeft.toString());
      }
      if (options.marginRight !== undefined) {
        args.push("--pdf-page-margin-right", options.marginRight.toString());
      }
      if (options.pageSize) {
        const pageSizes: Record<string, string> = {
          a4: "a4",
          letter: "letter",
          a5: "a5",
          b5: "b5",
        };
        args.push("--pdf-page-size", pageSizes[options.pageSize] || "a4");
      }
    }

    // Add EPUB-specific options
    if (options.outputFormat === "epub") {
      args.push("--epub-version", "3");
    }

    // Handle cover image
    if (options.cover) {
      const coverPath = path.join(tempDir, "cover.jpg");
      await fs.writeFile(coverPath, options.cover);
      args.push("--cover", coverPath);
    }

    // Execute ebook-convert
    const command = `ebook-convert ${args.join(" ")}`;
    await execAsync(command, { timeout: 120000 }); // 2 minute timeout

    // Read the output file
    const outputBuffer = await fs.readFile(outputPath);

    // Upload to S3
    const fileKey = `ebook-conversions/${nanoid()}.${options.outputFormat}`;
    const mimeTypes: Record<string, string> = {
      pdf: "application/pdf",
      epub: "application/epub+zip",
      mobi: "application/x-mobipocket-ebook",
      txt: "text/plain",
      html: "text/html",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };

    const { url } = await storagePut(fileKey, outputBuffer, mimeTypes[options.outputFormat]);

    return {
      url,
      fileKey,
      filename: outputFilename,
      size: outputBuffer.length,
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
 * Extract metadata from an e-book file
 */
export async function extractEbookMetadata(
  inputBuffer: Buffer,
  inputFormat: string
): Promise<EbookMetadata> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ebook-meta-"));
  const inputPath = path.join(tempDir, `input.${inputFormat}`);

  try {
    await fs.writeFile(inputPath, inputBuffer);

    // Use ebook-meta to extract metadata
    const { stdout } = await execAsync(`ebook-meta "${inputPath}"`, { timeout: 30000 });

    const metadata: EbookMetadata = {};

    // Parse the output
    const lines = stdout.split("\n");
    for (const line of lines) {
      const [key, ...valueParts] = line.split(":");
      const value = valueParts.join(":").trim();

      if (!value) continue;

      switch (key.trim().toLowerCase()) {
        case "title":
          metadata.title = value;
          break;
        case "author(s)":
        case "authors":
          metadata.author = value;
          break;
        case "publisher":
          metadata.publisher = value;
          break;
        case "language":
        case "languages":
          metadata.language = value;
          break;
        case "comments":
        case "description":
          metadata.description = value;
          break;
        case "isbn":
          metadata.isbn = value;
          break;
        case "published":
        case "publication date":
          metadata.publicationDate = value;
          break;
        case "tags":
          metadata.tags = value.split(",").map((t) => t.trim());
          break;
      }
    }

    return metadata;
  } finally {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Extract cover image from an e-book file
 */
export async function extractEbookCover(
  inputBuffer: Buffer,
  inputFormat: string
): Promise<{ url: string; fileKey: string } | null> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ebook-cover-"));
  const inputPath = path.join(tempDir, `input.${inputFormat}`);
  const coverPath = path.join(tempDir, "cover.jpg");

  try {
    await fs.writeFile(inputPath, inputBuffer);

    // Use ebook-meta to extract cover
    await execAsync(`ebook-meta "${inputPath}" --get-cover="${coverPath}"`, { timeout: 30000 });

    // Check if cover was extracted
    try {
      const coverBuffer = await fs.readFile(coverPath);
      const fileKey = `ebook-covers/${nanoid()}.jpg`;
      const { url } = await storagePut(fileKey, coverBuffer, "image/jpeg");
      return { url, fileKey };
    } catch {
      return null; // No cover found
    }
  } finally {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Convert EPUB to PDF
 */
export async function epubToPdf(
  inputBuffer: Buffer,
  options?: {
    title?: string;
    author?: string;
    fontSize?: number;
    pageSize?: "a4" | "letter" | "a5" | "b5";
    margins?: { top?: number; bottom?: number; left?: number; right?: number };
  }
): Promise<ConversionResult> {
  return convertEbook({
    inputBuffer,
    inputFormat: "epub",
    outputFormat: "pdf",
    title: options?.title,
    author: options?.author,
    fontSize: options?.fontSize,
    pageSize: options?.pageSize,
    marginTop: options?.margins?.top,
    marginBottom: options?.margins?.bottom,
    marginLeft: options?.margins?.left,
    marginRight: options?.margins?.right,
  });
}

/**
 * Convert MOBI to PDF
 */
export async function mobiToPdf(
  inputBuffer: Buffer,
  options?: {
    title?: string;
    author?: string;
    fontSize?: number;
    pageSize?: "a4" | "letter" | "a5" | "b5";
    margins?: { top?: number; bottom?: number; left?: number; right?: number };
  }
): Promise<ConversionResult> {
  return convertEbook({
    inputBuffer,
    inputFormat: "mobi",
    outputFormat: "pdf",
    title: options?.title,
    author: options?.author,
    fontSize: options?.fontSize,
    pageSize: options?.pageSize,
    marginTop: options?.margins?.top,
    marginBottom: options?.margins?.bottom,
    marginLeft: options?.margins?.left,
    marginRight: options?.margins?.right,
  });
}

/**
 * Convert PDF to EPUB
 */
export async function pdfToEpub(
  inputBuffer: Buffer,
  options?: {
    title?: string;
    author?: string;
    cover?: Buffer;
  }
): Promise<ConversionResult> {
  return convertEbook({
    inputBuffer,
    inputFormat: "pdf",
    outputFormat: "epub",
    title: options?.title,
    author: options?.author,
    cover: options?.cover,
  });
}

/**
 * Convert PDF to MOBI
 */
export async function pdfToMobi(
  inputBuffer: Buffer,
  options?: {
    title?: string;
    author?: string;
    cover?: Buffer;
  }
): Promise<ConversionResult> {
  return convertEbook({
    inputBuffer,
    inputFormat: "pdf",
    outputFormat: "mobi",
    title: options?.title,
    author: options?.author,
    cover: options?.cover,
  });
}

/**
 * Get supported input formats for e-book conversion
 */
export function getSupportedInputFormats(): string[] {
  return ["epub", "mobi", "azw", "azw3", "fb2", "lit", "pdb", "pdf", "txt", "html", "docx", "rtf"];
}

/**
 * Get supported output formats for e-book conversion
 */
export function getSupportedOutputFormats(): string[] {
  return ["epub", "mobi", "pdf", "txt", "html", "docx"];
}

/**
 * Check if a format is supported for input
 */
export function isSupportedInputFormat(format: string): boolean {
  return getSupportedInputFormats().includes(format.toLowerCase());
}

/**
 * Check if a format is supported for output
 */
export function isSupportedOutputFormat(format: string): boolean {
  return getSupportedOutputFormats().includes(format.toLowerCase());
}
