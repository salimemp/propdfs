import { getDb } from "./db";
import { ocrResults, files } from "../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";

/**
 * Document type classification patterns
 */
const DOCUMENT_PATTERNS = {
  invoice: [
    /invoice\s*(number|#|no\.?)/i,
    /bill\s*to/i,
    /total\s*(amount|due)/i,
    /payment\s*terms/i,
    /due\s*date/i,
  ],
  receipt: [
    /receipt/i,
    /thank\s*you\s*for\s*(your\s*)?purchase/i,
    /subtotal/i,
    /tax/i,
    /change\s*due/i,
  ],
  form: [
    /please\s*(fill|complete)/i,
    /signature\s*required/i,
    /date\s*of\s*birth/i,
    /applicant\s*information/i,
    /\[\s*\]/,
  ],
  contract: [
    /agreement/i,
    /terms\s*and\s*conditions/i,
    /party\s*(of\s*the\s*)?(first|second)/i,
    /hereby\s*agree/i,
    /witness/i,
  ],
  letter: [
    /dear\s+(sir|madam|mr|ms|mrs)/i,
    /sincerely/i,
    /yours\s*(truly|faithfully)/i,
    /regards/i,
  ],
  report: [
    /executive\s*summary/i,
    /table\s*of\s*contents/i,
    /conclusion/i,
    /recommendations/i,
    /findings/i,
  ],
  table: [
    /\|\s*\w+\s*\|/,
    /\t.*\t.*\t/,
    /^\s*\d+\s+\w+\s+\d+/m,
  ],
};

/**
 * Field extraction patterns for different document types
 */
const FIELD_PATTERNS: Record<string, Record<string, RegExp>> = {
  invoice: {
    invoiceNumber: /invoice\s*(?:number|#|no\.?)\s*:?\s*([A-Z0-9-]+)/i,
    date: /(?:invoice\s*)?date\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
    dueDate: /due\s*date\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
    total: /total\s*(?:amount|due)?\s*:?\s*\$?([\d,]+\.?\d*)/i,
    subtotal: /subtotal\s*:?\s*\$?([\d,]+\.?\d*)/i,
    tax: /tax\s*:?\s*\$?([\d,]+\.?\d*)/i,
  },
  receipt: {
    store: /^([A-Z][A-Za-z\s&]+)$/m,
    date: /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/,
    total: /total\s*:?\s*\$?([\d,]+\.?\d*)/i,
    subtotal: /subtotal\s*:?\s*\$?([\d,]+\.?\d*)/i,
    tax: /tax\s*:?\s*\$?([\d,]+\.?\d*)/i,
    paymentMethod: /(cash|credit|debit|visa|mastercard|amex)/i,
  },
  form: {
    name: /(?:full\s*)?name\s*:?\s*([A-Za-z\s]+)/i,
    email: /email\s*:?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
    phone: /(?:phone|tel)\s*:?\s*([\d\s\-\(\)]+)/i,
    address: /address\s*:?\s*(.+)/i,
    date: /date\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
  },
  contract: {
    parties: /between\s+(.+?)\s+and\s+(.+?)(?:\.|,)/i,
    effectiveDate: /effective\s*(?:as\s*of|date)\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
    term: /term\s*(?:of)?\s*:?\s*(\d+\s*(?:years?|months?|days?))/i,
  },
};

/**
 * Classify document type based on content
 */
export function classifyDocument(text: string): {
  type: string;
  confidence: number;
} {
  const scores: Record<string, number> = {
    invoice: 0,
    receipt: 0,
    form: 0,
    contract: 0,
    letter: 0,
    report: 0,
    table: 0,
    handwritten: 0,
    other: 0,
  };

  // Check each pattern
  for (const [docType, patterns] of Object.entries(DOCUMENT_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        scores[docType] += 1;
      }
    }
  }

  // Check for handwritten indicators (low character consistency, unusual spacing)
  const handwrittenIndicators = [
    text.length > 0 && text.split(/\s+/).length / text.length < 0.05,
    /[^\x00-\x7F]/.test(text) && text.length < 500,
  ];
  if (handwrittenIndicators.filter(Boolean).length >= 1) {
    scores.handwritten += 1;
  }

  // Find the type with highest score
  let maxScore = 0;
  let maxType = "other";
  for (const [docType, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      maxType = docType;
    }
  }

  // Calculate confidence (0-1)
  const totalPatterns = Object.values(DOCUMENT_PATTERNS).flat().length;
  const confidence = maxScore > 0 ? Math.min(maxScore / 5, 1) : 0.1;

  return { type: maxType, confidence };
}

/**
 * Extract structured fields from document
 */
export function extractFields(
  text: string,
  documentType: string
): Record<string, { value: string; confidence: number }> {
  const fields: Record<string, { value: string; confidence: number }> = {};
  const patterns = FIELD_PATTERNS[documentType];

  if (!patterns) return fields;

  for (const [fieldName, pattern] of Object.entries(patterns)) {
    const match = text.match(pattern);
    if (match && match[1]) {
      fields[fieldName] = {
        value: match[1].trim(),
        confidence: 0.8, // Base confidence for regex match
      };
    }
  }

  return fields;
}

/**
 * Detect language from text
 */
export function detectLanguage(text: string): {
  primary: string;
  detected: { language: string; confidence: number }[];
} {
  // Simple language detection based on character patterns
  const languagePatterns: Record<string, RegExp> = {
    en: /\b(the|and|is|are|was|were|have|has|been|will|would|could|should)\b/gi,
    es: /\b(el|la|los|las|es|son|está|están|tiene|tienen|ser|estar)\b/gi,
    fr: /\b(le|la|les|est|sont|avoir|être|dans|pour|avec|que)\b/gi,
    de: /\b(der|die|das|ist|sind|haben|sein|werden|nicht|auch)\b/gi,
    zh: /[\u4e00-\u9fff]/g,
    ja: /[\u3040-\u309f\u30a0-\u30ff]/g,
    ko: /[\uac00-\ud7af]/g,
    ar: /[\u0600-\u06ff]/g,
  };

  const scores: { language: string; confidence: number }[] = [];

  for (const [lang, pattern] of Object.entries(languagePatterns)) {
    const matches = text.match(pattern);
    if (matches) {
      const score = matches.length / text.split(/\s+/).length;
      scores.push({ language: lang, confidence: Math.min(score * 2, 1) });
    }
  }

  // Sort by confidence
  scores.sort((a, b) => b.confidence - a.confidence);

  return {
    primary: scores.length > 0 ? scores[0].language : "en",
    detected: scores.slice(0, 3),
  };
}

/**
 * Extract tables from text
 */
export function extractTables(text: string): any[] {
  const tables: any[] = [];
  
  // Look for pipe-delimited tables
  const pipeTableRegex = /(\|[^\n]+\|[\n\r]+)+/g;
  const pipeMatches = text.match(pipeTableRegex);
  
  if (pipeMatches) {
    for (const match of pipeMatches) {
      const rows = match.trim().split(/[\n\r]+/);
      const tableData = rows.map(row => 
        row.split('|')
          .filter(cell => cell.trim())
          .map(cell => cell.trim())
      );
      
      if (tableData.length > 1 && tableData[0].length > 1) {
        tables.push({
          type: 'pipe',
          headers: tableData[0],
          rows: tableData.slice(1),
        });
      }
    }
  }

  // Look for tab-delimited data
  const tabLines = text.split(/[\n\r]+/).filter(line => line.includes('\t'));
  if (tabLines.length > 2) {
    const tableData = tabLines.map(line => line.split('\t').map(cell => cell.trim()));
    if (tableData[0].length > 1) {
      tables.push({
        type: 'tab',
        headers: tableData[0],
        rows: tableData.slice(1),
      });
    }
  }

  return tables;
}

/**
 * Perform context-aware OCR analysis
 */
export async function analyzeDocument(
  fileId: number,
  userId: number,
  text: string,
  options?: {
    useAI?: boolean;
    extractTables?: boolean;
  }
): Promise<{
  documentType: string;
  confidence: number;
  extractedFields: Record<string, { value: string; confidence: number }>;
  tables: any[];
  language: { primary: string; detected: { language: string; confidence: number }[] };
  fullText: string;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const startTime = Date.now();

  // Classify document
  const classification = classifyDocument(text);

  // Extract fields based on document type
  const extractedFields = extractFields(text, classification.type);

  // Detect language
  const language = detectLanguage(text);

  // Extract tables if requested
  const tables = options?.extractTables !== false ? extractTables(text) : [];

  // Use AI for enhanced extraction if enabled
  if (options?.useAI) {
    try {
      const aiResponse = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are a document analysis assistant. Analyze the following document and extract key information. Return a JSON object with:
- documentType: the type of document (invoice, receipt, form, contract, letter, report, other)
- keyFields: an object with field names and their values
- summary: a brief summary of the document content`,
          },
          {
            role: "user",
            content: text.substring(0, 4000), // Limit text length
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "document_analysis",
            strict: true,
            schema: {
              type: "object",
              properties: {
                documentType: { type: "string" },
                keyFields: { type: "object", additionalProperties: { type: "string" } },
                summary: { type: "string" },
              },
              required: ["documentType", "keyFields", "summary"],
              additionalProperties: false,
            },
          },
        },
      });

      const messageContent = aiResponse.choices?.[0]?.message?.content;
      if (messageContent && typeof messageContent === 'string') {
        const aiResult = JSON.parse(messageContent);
        
        // Merge AI results with regex results
        for (const [key, value] of Object.entries(aiResult.keyFields || {})) {
          if (!extractedFields[key]) {
            extractedFields[key] = { value: value as string, confidence: 0.9 };
          }
        }
      }
    } catch (error) {
      console.error("AI analysis error:", error);
      // Continue with regex-only results
    }
  }

  const processingTime = Date.now() - startTime;

  // Save OCR results to database
  await db.insert(ocrResults).values({
    fileId,
    userId,
    documentType: classification.type as any,
    confidence: String(classification.confidence),
    fullText: text,
    pageCount: 1,
    extractedFields,
    tables,
    primaryLanguage: language.primary,
    detectedLanguages: language.detected,
    processingTimeMs: processingTime,
    ocrEngine: options?.useAI ? "ai_enhanced" : "pattern_matching",
  });

  return {
    documentType: classification.type,
    confidence: classification.confidence,
    extractedFields,
    tables,
    language,
    fullText: text,
  };
}

/**
 * Get OCR results for a file
 */
export async function getOcrResults(fileId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const results = await db
    .select()
    .from(ocrResults)
    .where(and(eq(ocrResults.fileId, fileId), eq(ocrResults.userId, userId)))
    .orderBy(desc(ocrResults.createdAt))
    .limit(1);

  return results.length > 0 ? results[0] : null;
}

/**
 * Search within OCR results
 */
export async function searchOcrResults(
  userId: number,
  query: string,
  options?: {
    documentType?: string;
    limit?: number;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let results = await db
    .select()
    .from(ocrResults)
    .where(eq(ocrResults.userId, userId))
    .orderBy(desc(ocrResults.createdAt));

  // Filter by document type if specified
  if (options?.documentType) {
    results = results.filter((r) => r.documentType === options.documentType);
  }

  // Search in full text
  const queryLower = query.toLowerCase();
  const matches = results.filter((r) => 
    r.fullText?.toLowerCase().includes(queryLower)
  );

  // Apply limit
  const limit = options?.limit || 20;
  return matches.slice(0, limit).map((r) => ({
    fileId: r.fileId,
    documentType: r.documentType,
    confidence: r.confidence,
    snippet: extractSnippet(r.fullText || "", query),
    createdAt: r.createdAt,
  }));
}

/**
 * Extract a text snippet around the search query
 */
function extractSnippet(text: string, query: string, contextLength: number = 100): string {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);

  if (index === -1) return text.substring(0, contextLength * 2) + "...";

  const start = Math.max(0, index - contextLength);
  const end = Math.min(text.length, index + query.length + contextLength);

  let snippet = text.substring(start, end);
  if (start > 0) snippet = "..." + snippet;
  if (end < text.length) snippet = snippet + "...";

  return snippet;
}
