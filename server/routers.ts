import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import * as db from "./db";
import { storagePut } from "./storage";
import { invokeLLM } from "./_core/llm";
import { transcribeAudio } from "./_core/voiceTranscription";
import * as pdfService from "./pdfService";
import * as cloudStorage from "./cloudStorageService";
import * as oauthService from "./oauthService";
import * as ebookService from "./ebookService";
import * as cadService from "./cadService";
import * as batchService from "./batchService";
import * as emailService from "./emailService";
import * as pdfaService from "./pdfaService";
import * as linearizationService from "./linearizationService";
import * as formService from "./formService";
import * as authService from "./authService";
import * as totpService from "../app/services/totp-service";
import * as crypto from 'crypto';
import * as voiceCommandService from "../app/services/voice-command-service";
import * as readAloudService from "../app/services/read-aloud-service";

// Subscription tier limits
const TIER_LIMITS = {
  free: { conversionsPerMonth: 10, maxFileSizeMB: 25, storageGB: 1 },
  pro: { conversionsPerMonth: Infinity, maxFileSizeMB: 500, storageGB: 50 },
  enterprise: { conversionsPerMonth: Infinity, maxFileSizeMB: 2000, storageGB: 1000 },
};

// Helper to check subscription limits
async function checkConversionLimit(userId: number, tier: "free" | "pro" | "enterprise") {
  const user = await db.getUserById(userId);
  if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
  
  const limits = TIER_LIMITS[tier];
  if (user.monthlyConversions >= limits.conversionsPerMonth) {
    throw new TRPCError({ 
      code: "FORBIDDEN", 
      message: "Monthly conversion limit reached. Upgrade to Pro for unlimited conversions." 
    });
  }
  return user;
}

export const appRouter = router({
  system: systemRouter,
  
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // User preferences and settings
  user: router({
    getProfile: protectedProcedure.query(async ({ ctx }) => {
      return await db.getUserById(ctx.user.id);
    }),
    
    updatePreferences: protectedProcedure
      .input(z.object({
        language: z.string().optional(),
        timezone: z.string().optional(),
        dateFormat: z.string().optional(),
        measurementUnit: z.enum(["metric", "imperial"]).optional(),
        currency: z.string().optional(),
        highContrastMode: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.updateUserPreferences(ctx.user.id, input);
        return { success: true };
      }),
      
    getUsageStats: protectedProcedure.query(async ({ ctx }) => {
      const user = await db.getUserById(ctx.user.id);
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });
      
      const limits = TIER_LIMITS[user.subscriptionTier];
      return {
        tier: user.subscriptionTier,
        conversionsUsed: user.monthlyConversions,
        conversionsLimit: limits.conversionsPerMonth,
        storageUsed: user.storageUsedBytes,
        storageLimit: limits.storageGB * 1024 * 1024 * 1024,
      };
    }),
  }),

  // File management
  files: router({
    upload: protectedProcedure
      .input(z.object({
        filename: z.string(),
        mimeType: z.string(),
        fileSize: z.number(),
        base64Data: z.string(),
        folderId: z.number().optional(),
        teamId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = await db.getUserById(ctx.user.id);
        if (!user) throw new TRPCError({ code: "NOT_FOUND" });
        
        const limits = TIER_LIMITS[user.subscriptionTier];
        const maxBytes = limits.maxFileSizeMB * 1024 * 1024;
        
        if (input.fileSize > maxBytes) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `File size exceeds ${limits.maxFileSizeMB}MB limit for ${user.subscriptionTier} tier`,
          });
        }
        
        // Upload to S3
        const fileKey = `${ctx.user.id}/files/${nanoid()}-${input.filename}`;
        const buffer = Buffer.from(input.base64Data, "base64");
        const { url } = await storagePut(fileKey, buffer, input.mimeType);
        
        // Save to database
        const fileId = await db.createFile({
          userId: ctx.user.id,
          teamId: input.teamId,
          folderId: input.folderId,
          filename: input.filename,
          originalFilename: input.filename,
          mimeType: input.mimeType,
          fileSize: input.fileSize,
          fileKey,
          url,
        });
        
        // Log audit
        await db.createAuditLog({
          userId: ctx.user.id,
          action: "file_upload",
          resourceType: "file",
          resourceId: fileId!,
          details: { filename: input.filename, size: input.fileSize },
        });
        
        return { id: fileId, url, fileKey };
      }),
      
    list: protectedProcedure
      .input(z.object({
        folderId: z.number().nullable().optional(),
        search: z.string().optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      }))
      .query(async ({ ctx, input }) => {
        return await db.getUserFiles(ctx.user.id, input);
      }),
      
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const file = await db.getFileById(input.id);
        if (!file || file.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const tags = await db.getFileTags(input.id);
        return { ...file, tags };
      }),
      
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const file = await db.getFileById(input.id);
        if (!file || file.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        await db.softDeleteFile(input.id);
        await db.createAuditLog({
          userId: ctx.user.id,
          action: "file_delete",
          resourceType: "file",
          resourceId: input.id,
        });
        return { success: true };
      }),
      
    getVersions: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const file = await db.getFileById(input.id);
        if (!file || file.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        return await db.getFileVersions(input.id);
      }),
  }),

  // Folder management
  folders: router({
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(255),
        parentId: z.number().optional(),
        teamId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const folderId = await db.createFolder({
          name: input.name,
          parentId: input.parentId,
          userId: ctx.user.id,
          teamId: input.teamId,
        });
        return { id: folderId };
      }),
      
    list: protectedProcedure
      .input(z.object({
        parentId: z.number().nullable().optional(),
      }))
      .query(async ({ ctx, input }) => {
        return await db.getUserFolders(ctx.user.id, input.parentId);
      }),
      
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(255),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.updateFolder(input.id, { name: input.name });
        return { success: true };
      }),
      
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.deleteFolder(input.id);
        return { success: true };
      }),
  }),

  // Tag management
  tags: router({
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(64),
        color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const tagId = await db.createTag({
          name: input.name,
          color: input.color,
          userId: ctx.user.id,
        });
        return { id: tagId };
      }),
      
    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getUserTags(ctx.user.id);
    }),
    
    addToFile: protectedProcedure
      .input(z.object({ fileId: z.number(), tagId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.addTagToFile(input.fileId, input.tagId);
        return { success: true };
      }),
      
    removeFromFile: protectedProcedure
      .input(z.object({ fileId: z.number(), tagId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.removeTagFromFile(input.fileId, input.tagId);
        return { success: true };
      }),
  }),

  // Conversions
  conversions: router({
    create: protectedProcedure
      .input(z.object({
        sourceFileId: z.number().optional(),
        sourceFilename: z.string(),
        sourceFormat: z.string(),
        sourceSize: z.number(),
        outputFormat: z.string(),
        conversionType: z.enum([
          "pdf_to_word", "pdf_to_excel", "pdf_to_ppt",
          "word_to_pdf", "excel_to_pdf", "ppt_to_pdf",
          "image_to_pdf", "pdf_to_image",
          "epub_to_pdf", "pdf_to_epub", "mobi_to_pdf",
          "cad_to_pdf", "text_to_pdf", "pdf_to_text",
          "html_to_pdf", "pdf_to_html", "markdown_to_pdf",
          "merge", "split", "compress", "rotate", "watermark",
          "encrypt", "decrypt", "ocr", "transcription"
        ]),
        options: z.record(z.string(), z.any()).optional(),
        teamId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = await db.getUserById(ctx.user.id);
        if (!user) throw new TRPCError({ code: "NOT_FOUND" });
        
        await checkConversionLimit(ctx.user.id, user.subscriptionTier);
        
        const conversionId = await db.createConversion({
          userId: ctx.user.id,
          teamId: input.teamId,
          sourceFileId: input.sourceFileId,
          sourceFilename: input.sourceFilename,
          sourceFormat: input.sourceFormat,
          sourceSize: input.sourceSize,
          outputFormat: input.outputFormat,
          conversionType: input.conversionType,
          options: input.options,
          status: "queued",
        });
        
        await db.incrementUserConversions(ctx.user.id);
        
        await db.createAuditLog({
          userId: ctx.user.id,
          action: "conversion_started",
          resourceType: "conversion",
          resourceId: conversionId!,
          details: { type: input.conversionType },
        });
        
        return { id: conversionId };
      }),
      
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const conversion = await db.getConversionById(input.id);
        if (!conversion || conversion.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        return conversion;
      }),
      
    list: protectedProcedure
      .input(z.object({
        status: z.enum(["queued", "processing", "completed", "failed"]).optional(),
        limit: z.number().default(50),
      }))
      .query(async ({ ctx, input }) => {
        return await db.getUserConversions(ctx.user.id, input);
      }),
      
    getStats: protectedProcedure
      .input(z.object({
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      }))
      .query(async ({ ctx, input }) => {
        return await db.getConversionStats(ctx.user.id, input.startDate, input.endDate);
      }),
      
    // Process conversion (simulated - would connect to actual conversion service)
    process: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const conversion = await db.getConversionById(input.id);
        if (!conversion || conversion.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        
        await db.updateConversion(input.id, { status: "processing", progress: 0 });
        
        // Simulate processing (in production, this would call actual conversion services)
        const startTime = Date.now();
        
        // Update progress
        await db.updateConversion(input.id, { progress: 50 });
        
        // Complete
        const processingTime = Date.now() - startTime;
        await db.updateConversion(input.id, {
          status: "completed",
          progress: 100,
          processingTimeMs: processingTime,
          completedAt: new Date(),
        });
        
        return { success: true, processingTimeMs: processingTime };
      }),
  }),

  // Batch processing
  batch: router({
    create: protectedProcedure
      .input(z.object({
        files: z.array(z.object({
          sourceFilename: z.string(),
          sourceFormat: z.string(),
          sourceSize: z.number(),
          outputFormat: z.string(),
          conversionType: z.string(),
        })),
        teamId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = await db.getUserById(ctx.user.id);
        if (!user) throw new TRPCError({ code: "NOT_FOUND" });
        
        // Check batch size limits
        const maxBatchSize = user.subscriptionTier === "enterprise" ? 500 : 
                            user.subscriptionTier === "pro" ? 100 : 10;
        
        if (input.files.length > maxBatchSize) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Batch size exceeds ${maxBatchSize} files limit for ${user.subscriptionTier} tier`,
          });
        }
        
        const batchId = nanoid();
        await db.createBatchJob({
          batchId,
          userId: ctx.user.id,
          teamId: input.teamId,
          totalFiles: input.files.length,
          status: "queued",
        });
        
        // Create individual conversions
        for (let i = 0; i < input.files.length; i++) {
          const file = input.files[i];
          await db.createConversion({
            userId: ctx.user.id,
            teamId: input.teamId,
            sourceFilename: file.sourceFilename,
            sourceFormat: file.sourceFormat,
            sourceSize: file.sourceSize,
            outputFormat: file.outputFormat,
            conversionType: file.conversionType as any,
            batchId,
            batchIndex: i,
            status: "queued",
          });
        }
        
        return { batchId };
      }),
      
    get: protectedProcedure
      .input(z.object({ batchId: z.string() }))
      .query(async ({ ctx, input }) => {
        const batch = await db.getBatchJobById(input.batchId);
        if (!batch || batch.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        return batch;
      }),

    getProgress: protectedProcedure
      .input(z.object({ batchId: z.string() }))
      .query(async ({ input }) => {
        return await batchService.getBatchProgress(input.batchId);
      }),

    cancel: protectedProcedure
      .input(z.object({ batchId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        return await batchService.cancelBatchJob(input.batchId, ctx.user.id);
      }),

    retryFailed: protectedProcedure
      .input(z.object({ batchId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        return await batchService.retryFailedItems(input.batchId, ctx.user.id);
      }),

    list: protectedProcedure
      .input(z.object({
        limit: z.number().min(1).max(100).optional(),
        offset: z.number().min(0).optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        return await batchService.getUserBatchJobs(
          ctx.user.id,
          input?.limit || 20,
          input?.offset || 0
        );
      }),

    delete: protectedProcedure
      .input(z.object({ batchId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        return await batchService.deleteBatchJob(input.batchId, ctx.user.id);
      }),

    stats: protectedProcedure
      .input(z.object({
        startDate: z.date(),
        endDate: z.date(),
      }))
      .query(async ({ ctx, input }) => {
        return await batchService.getBatchJobStats(ctx.user.id, input.startDate, input.endDate);
      }),
  }),

  // Teams
  teams: router({
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(255),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = await db.getUserById(ctx.user.id);
        if (!user || user.subscriptionTier === "free") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Team features require Pro or Enterprise subscription",
          });
        }
        
        const teamId = await db.createTeam({
          name: input.name,
          description: input.description,
          ownerId: ctx.user.id,
          subscriptionTier: user.subscriptionTier === "enterprise" ? "enterprise" : "pro",
        });
        
        // Add owner as admin
        await db.addTeamMember({
          teamId: teamId!,
          userId: ctx.user.id,
          role: "admin",
          status: "active",
          joinedAt: new Date(),
        });
        
        return { id: teamId };
      }),
      
    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getUserTeams(ctx.user.id);
    }),
    
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const team = await db.getTeamById(input.id);
        if (!team) throw new TRPCError({ code: "NOT_FOUND" });
        
        const members = await db.getTeamMembers(input.id);
        const isMember = members.some(m => m.member.userId === ctx.user.id);
        if (!isMember) throw new TRPCError({ code: "FORBIDDEN" });
        
        return { ...team, members };
      }),
      
    addMember: protectedProcedure
      .input(z.object({
        teamId: z.number(),
        email: z.string().email(),
        role: z.enum(["admin", "editor", "viewer"]),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check if user has permission
        const members = await db.getTeamMembers(input.teamId);
        const currentMember = members.find(m => m.member.userId === ctx.user.id);
        if (!currentMember || currentMember.member.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        
        // In production, would send invitation email
        return { success: true, message: "Invitation sent" };
      }),
      
    updateMemberRole: protectedProcedure
      .input(z.object({
        teamId: z.number(),
        userId: z.number(),
        role: z.enum(["admin", "editor", "viewer"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const members = await db.getTeamMembers(input.teamId);
        const currentMember = members.find(m => m.member.userId === ctx.user.id);
        if (!currentMember || currentMember.member.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        
        await db.updateTeamMemberRole(input.teamId, input.userId, input.role);
        return { success: true };
      }),
      
    removeMember: protectedProcedure
      .input(z.object({
        teamId: z.number(),
        userId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const members = await db.getTeamMembers(input.teamId);
        const currentMember = members.find(m => m.member.userId === ctx.user.id);
        if (!currentMember || currentMember.member.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        
        await db.removeTeamMember(input.teamId, input.userId);
        return { success: true };
      }),
  }),

  // Comments and annotations
  comments: router({
    create: protectedProcedure
      .input(z.object({
        fileId: z.number(),
        content: z.string().min(1),
        parentId: z.number().optional(),
        pageNumber: z.number().optional(),
        positionX: z.number().optional(),
        positionY: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const commentId = await db.createComment({
          fileId: input.fileId,
          userId: ctx.user.id,
          content: input.content,
          parentId: input.parentId,
          pageNumber: input.pageNumber,
          positionX: input.positionX,
          positionY: input.positionY,
        });
        return { id: commentId };
      }),
      
    list: protectedProcedure
      .input(z.object({ fileId: z.number() }))
      .query(async ({ ctx, input }) => {
        return await db.getFileComments(input.fileId);
      }),
      
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        content: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.updateComment(input.id, input.content);
        return { success: true };
      }),
      
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.deleteComment(input.id);
        return { success: true };
      }),
  }),

  // Conversion presets
  presets: router({
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(255),
        description: z.string().optional(),
        conversionType: z.string(),
        options: z.record(z.string(), z.any()),
      }))
      .mutation(async ({ ctx, input }) => {
        const presetId = await db.createConversionPreset({
          userId: ctx.user.id,
          name: input.name,
          description: input.description,
          conversionType: input.conversionType,
          options: input.options,
        });
        return { id: presetId };
      }),
      
    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getUserPresets(ctx.user.id);
    }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.deletePreset(input.id);
        return { success: true };
      }),
  }),

  // AI Assistant
  ai: router({
    chat: protectedProcedure
      .input(z.object({
        sessionId: z.string(),
        message: z.string(),
        fileId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Save user message
        await db.saveChatMessage({
          userId: ctx.user.id,
          sessionId: input.sessionId,
          role: "user",
          content: input.message,
          fileId: input.fileId,
        });
        
        // Get chat history for context
        const history = await db.getChatHistory(ctx.user.id, input.sessionId, 10);
        
        // Build messages for LLM
        const messages = [
          {
            role: "system" as const,
            content: `You are ProPDF, an intelligent AI assistant for the ProPDFs document conversion platform. You help users with:
- Converting documents between formats (PDF, Word, Excel, PowerPoint, images, etc.)
- PDF operations (merge, split, compress, rotate, watermark, encrypt)
- Document organization and management
- OCR and text extraction
- Answering questions about document formats and best practices

Be helpful, concise, and professional. If a user asks about a specific file operation, suggest the appropriate tool or action.`,
          },
          ...history.map(h => ({
            role: h.role as "user" | "assistant",
            content: h.content,
          })),
          { role: "user" as const, content: input.message },
        ];
        
        const response = await invokeLLM({ messages });
        const assistantMessage = (response.choices[0]?.message?.content as string) || "I apologize, I couldn't process your request.";
        
        // Save assistant response
        await db.saveChatMessage({
          userId: ctx.user.id,
          sessionId: input.sessionId,
          role: "assistant",
          content: assistantMessage,
          fileId: input.fileId,
        });
        
        return { message: assistantMessage };
      }),
      
    getHistory: protectedProcedure
      .input(z.object({ sessionId: z.string() }))
      .query(async ({ ctx, input }) => {
        return await db.getChatHistory(ctx.user.id, input.sessionId);
      }),
      
    classifyDocument: protectedProcedure
      .input(z.object({
        filename: z.string(),
        mimeType: z.string(),
        textContent: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: "You are a document classification AI. Analyze the document and return a JSON object with: category (invoice, contract, report, letter, form, presentation, spreadsheet, image, other), confidence (0-1), suggestedTags (array of strings), and summary (brief description).",
            },
            {
              role: "user",
              content: `Classify this document:\nFilename: ${input.filename}\nMIME Type: ${input.mimeType}\n${input.textContent ? `Content preview: ${input.textContent.substring(0, 1000)}` : ""}`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "document_classification",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  category: { type: "string" },
                  confidence: { type: "number" },
                  suggestedTags: { type: "array", items: { type: "string" } },
                  summary: { type: "string" },
                },
                required: ["category", "confidence", "suggestedTags", "summary"],
                additionalProperties: false,
              },
            },
          },
        });
        
        return JSON.parse((response.choices[0]?.message?.content as string) || "{}");
      }),
  }),

  // Audio transcription
  transcription: router({
    transcribe: protectedProcedure
      .input(z.object({
        audioUrl: z.string().url(),
        language: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = await db.getUserById(ctx.user.id);
        if (!user) throw new TRPCError({ code: "NOT_FOUND" });
        
        await checkConversionLimit(ctx.user.id, user.subscriptionTier);
        
        const result = await transcribeAudio({
          audioUrl: input.audioUrl,
          language: input.language,
        });
        
        // Check if it's an error response
        if ('error' in result) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: result.error,
            cause: result,
          });
        }
        
        await db.incrementUserConversions(ctx.user.id);
        
        // Create conversion record
        await db.createConversion({
          userId: ctx.user.id,
          sourceFilename: "audio_recording",
          sourceFormat: "audio",
          sourceSize: 0,
          outputFormat: "text",
          conversionType: "transcription",
          status: "completed",
          completedAt: new Date(),
        });
        
        return {
          text: result.text,
          language: result.language,
          segments: result.segments,
        };
      }),
  }),

  // Analytics
  analytics: router({
    getDashboard: protectedProcedure.query(async ({ ctx }) => {
      const stats = await db.getConversionStats(ctx.user.id);
      const recentConversions = await db.getUserConversions(ctx.user.id, { limit: 10 });
      const user = await db.getUserById(ctx.user.id);
      
      return {
        stats,
        recentConversions,
        usage: {
          conversionsUsed: user?.monthlyConversions || 0,
          storageUsed: user?.storageUsedBytes || 0,
        },
      };
    }),
    
    getUsageHistory: protectedProcedure
      .input(z.object({
        startDate: z.date(),
        endDate: z.date(),
      }))
      .query(async ({ ctx, input }) => {
        return await db.getUserUsageStats(ctx.user.id, input.startDate, input.endDate);
      }),
  }),

  // Real PDF Processing
  pdf: router({
    merge: protectedProcedure
      .input(z.object({
        fileUrls: z.array(z.string().url()),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = await db.getUserById(ctx.user.id);
        if (!user) throw new TRPCError({ code: "NOT_FOUND" });
        await checkConversionLimit(ctx.user.id, user.subscriptionTier);
        
        // Download all PDFs
        const pdfBuffers: Buffer[] = [];
        for (const url of input.fileUrls) {
          const response = await fetch(url);
          const arrayBuffer = await response.arrayBuffer();
          pdfBuffers.push(Buffer.from(arrayBuffer));
        }
        
        // Merge PDFs
        const mergedPdf = await pdfService.mergePdfs({ pdfBuffers });
        
        // Upload result to S3
        const fileKey = `${ctx.user.id}/merged/${nanoid()}.pdf`;
        const { url } = await storagePut(fileKey, mergedPdf, "application/pdf");
        
        // Create conversion record
        await db.createConversion({
          userId: ctx.user.id,
          sourceFilename: `merged_${input.fileUrls.length}_files.pdf`,
          sourceFormat: "pdf",
          sourceSize: pdfBuffers.reduce((sum, b) => sum + b.length, 0),
          outputFormat: "pdf",
          conversionType: "merge",
          status: "completed",
          
          completedAt: new Date(),
        });
        
        await db.incrementUserConversions(ctx.user.id);
        
        return { url, size: mergedPdf.length };
      }),
      
    split: protectedProcedure
      .input(z.object({
        fileUrl: z.string().url(),
        ranges: z.array(z.object({
          start: z.number().min(1),
          end: z.number().min(1),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = await db.getUserById(ctx.user.id);
        if (!user) throw new TRPCError({ code: "NOT_FOUND" });
        await checkConversionLimit(ctx.user.id, user.subscriptionTier);
        
        // Download PDF
        const response = await fetch(input.fileUrl);
        const arrayBuffer = await response.arrayBuffer();
        const pdfBuffer = Buffer.from(arrayBuffer);
        
        // Split PDF
        const splitPdfs = await pdfService.splitPdf({
          pdfBuffer,
          ranges: input.ranges,
        });
        
        // Upload results to S3
        const results: { url: string; pages: string; size: number }[] = [];
        for (let i = 0; i < splitPdfs.length; i++) {
          const fileKey = `${ctx.user.id}/split/${nanoid()}_part${i + 1}.pdf`;
          const { url } = await storagePut(fileKey, splitPdfs[i], "application/pdf");
          results.push({
            url,
            pages: `${input.ranges[i].start}-${input.ranges[i].end}`,
            size: splitPdfs[i].length,
          });
        }
        
        await db.incrementUserConversions(ctx.user.id);
        
        return { files: results };
      }),
      
    compress: protectedProcedure
      .input(z.object({
        fileUrl: z.string().url(),
        quality: z.enum(["low", "medium", "high"]).default("medium"),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = await db.getUserById(ctx.user.id);
        if (!user) throw new TRPCError({ code: "NOT_FOUND" });
        await checkConversionLimit(ctx.user.id, user.subscriptionTier);
        
        // Download PDF
        const response = await fetch(input.fileUrl);
        const arrayBuffer = await response.arrayBuffer();
        const pdfBuffer = Buffer.from(arrayBuffer);
        const originalSize = pdfBuffer.length;
        
        // Compress PDF
        const compressedPdf = await pdfService.compressPdf({
          pdfBuffer,
          quality: input.quality,
        });
        
        // Upload result to S3
        const fileKey = `${ctx.user.id}/compressed/${nanoid()}.pdf`;
        const { url } = await storagePut(fileKey, compressedPdf, "application/pdf");
        
        await db.incrementUserConversions(ctx.user.id);
        
        const compressionRatio = ((originalSize - compressedPdf.length) / originalSize * 100).toFixed(1);
        
        return {
          url,
          originalSize,
          compressedSize: compressedPdf.length,
          compressionRatio: `${compressionRatio}%`,
        };
      }),
      
    rotate: protectedProcedure
      .input(z.object({
        fileUrl: z.string().url(),
        rotation: z.enum(["90", "180", "270"]),
        pageIndices: z.array(z.number()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = await db.getUserById(ctx.user.id);
        if (!user) throw new TRPCError({ code: "NOT_FOUND" });
        await checkConversionLimit(ctx.user.id, user.subscriptionTier);
        
        // Download PDF
        const response = await fetch(input.fileUrl);
        const arrayBuffer = await response.arrayBuffer();
        const pdfBuffer = Buffer.from(arrayBuffer);
        
        // Rotate PDF
        const rotatedPdf = await pdfService.rotatePdf({
          pdfBuffer,
          rotation: parseInt(input.rotation) as 90 | 180 | 270,
          pageIndices: input.pageIndices,
        });
        
        // Upload result to S3
        const fileKey = `${ctx.user.id}/rotated/${nanoid()}.pdf`;
        const { url } = await storagePut(fileKey, rotatedPdf, "application/pdf");
        
        await db.incrementUserConversions(ctx.user.id);
        
        return { url, size: rotatedPdf.length };
      }),
      
    watermark: protectedProcedure
      .input(z.object({
        fileUrl: z.string().url(),
        text: z.string().min(1).max(100),
        opacity: z.number().min(0).max(1).default(0.3),
        fontSize: z.number().min(10).max(200).default(50),
        position: z.enum(["center", "diagonal", "top", "bottom"]).default("diagonal"),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = await db.getUserById(ctx.user.id);
        if (!user) throw new TRPCError({ code: "NOT_FOUND" });
        
        if (user.subscriptionTier === "free") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Custom watermarks require Pro or Enterprise subscription",
          });
        }
        
        await checkConversionLimit(ctx.user.id, user.subscriptionTier);
        
        // Download PDF
        const response = await fetch(input.fileUrl);
        const arrayBuffer = await response.arrayBuffer();
        const pdfBuffer = Buffer.from(arrayBuffer);
        
        // Add watermark
        const watermarkedPdf = await pdfService.addWatermark({
          pdfBuffer,
          text: input.text,
          opacity: input.opacity,
          fontSize: input.fontSize,
          position: input.position,
        });
        
        // Upload result to S3
        const fileKey = `${ctx.user.id}/watermarked/${nanoid()}.pdf`;
        const { url } = await storagePut(fileKey, watermarkedPdf, "application/pdf");
        
        await db.incrementUserConversions(ctx.user.id);
        
        return { url, size: watermarkedPdf.length };
      }),
      
    encrypt: protectedProcedure
      .input(z.object({
        fileUrl: z.string().url(),
        password: z.string().min(4).max(128),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = await db.getUserById(ctx.user.id);
        if (!user) throw new TRPCError({ code: "NOT_FOUND" });
        await checkConversionLimit(ctx.user.id, user.subscriptionTier);
        
        // Download PDF
        const response = await fetch(input.fileUrl);
        const arrayBuffer = await response.arrayBuffer();
        const pdfBuffer = Buffer.from(arrayBuffer);
        
        // Encrypt PDF
        const encryptedPdf = await pdfService.encryptPdf({
          pdfBuffer,
          userPassword: input.password,
        });
        
        // Upload result to S3
        const fileKey = `${ctx.user.id}/encrypted/${nanoid()}.pdf`;
        const { url } = await storagePut(fileKey, encryptedPdf, "application/pdf");
        
        await db.incrementUserConversions(ctx.user.id);
        
        return { url, size: encryptedPdf.length };
      }),
      
    // PDF to Images conversion using poppler-utils
    pdfToImages: protectedProcedure
      .input(z.object({
        fileUrl: z.string().url(),
        format: z.enum(["png", "jpeg", "webp"]).default("png"),
        quality: z.number().min(1).max(100).default(90),
        dpi: z.number().min(72).max(600).default(150),
        pageNumbers: z.array(z.number().min(1)).optional(), // Specific pages to convert
      }))
      .mutation(async ({ ctx, input }) => {
        const user = await db.getUserById(ctx.user.id);
        if (!user) throw new TRPCError({ code: "NOT_FOUND" });
        await checkConversionLimit(ctx.user.id, user.subscriptionTier);
        
        // Download PDF
        const response = await fetch(input.fileUrl);
        const arrayBuffer = await response.arrayBuffer();
        const pdfBuffer = Buffer.from(arrayBuffer);
        
        // Convert PDF to images
        let images = await pdfService.pdfToImages({
          pdfBuffer,
          format: input.format,
          quality: input.quality,
          dpi: input.dpi,
        });
        
        // Filter to specific pages if requested
        if (input.pageNumbers && input.pageNumbers.length > 0) {
          images = input.pageNumbers
            .filter(p => p <= images.length)
            .map(p => images[p - 1]);
        }
        
        // Upload images to S3
        const results: { url: string; page: number; size: number }[] = [];
        const mimeType = input.format === "jpeg" ? "image/jpeg" : 
                         input.format === "webp" ? "image/webp" : "image/png";
        const extension = input.format === "jpeg" ? "jpg" : input.format;
        
        for (let i = 0; i < images.length; i++) {
          const pageNum = input.pageNumbers ? input.pageNumbers[i] : i + 1;
          const fileKey = `${ctx.user.id}/pdf-images/${nanoid()}_page${pageNum}.${extension}`;
          const { url } = await storagePut(fileKey, images[i], mimeType);
          results.push({
            url,
            page: pageNum,
            size: images[i].length,
          });
        }
        
        await db.incrementUserConversions(ctx.user.id);
        
        // Create conversion record
        await db.createConversion({
          userId: ctx.user.id,
          sourceFilename: "document.pdf",
          sourceFormat: "pdf",
          sourceSize: pdfBuffer.length,
          outputFormat: input.format,
          conversionType: "pdf_to_image",
          status: "completed",
          completedAt: new Date(),
        });
        
        return {
          images: results,
          totalPages: images.length,
          format: input.format,
          dpi: input.dpi,
        };
      }),
      
    imagesToPdf: protectedProcedure
      .input(z.object({
        imageUrls: z.array(z.string().url()),
        pageSize: z.enum(["A4", "Letter", "Legal"]).default("A4"),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = await db.getUserById(ctx.user.id);
        if (!user) throw new TRPCError({ code: "NOT_FOUND" });
        await checkConversionLimit(ctx.user.id, user.subscriptionTier);
        
        // Download all images
        const imageBuffers: Buffer[] = [];
        for (const url of input.imageUrls) {
          const response = await fetch(url);
          const arrayBuffer = await response.arrayBuffer();
          imageBuffers.push(Buffer.from(arrayBuffer));
        }
        
        // Convert to PDF
        const pdfBuffer = await pdfService.imagesToPdf({
          imageBuffers,
          pageSize: input.pageSize,
        });
        
        // Upload result to S3
        const fileKey = `${ctx.user.id}/converted/${nanoid()}.pdf`;
        const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");
        
        await db.incrementUserConversions(ctx.user.id);
        
        return { url, size: pdfBuffer.length };
      }),
      
    htmlToPdf: protectedProcedure
      .input(z.object({
        html: z.string(),
        pageSize: z.enum(["A4", "Letter", "Legal"]).default("A4"),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = await db.getUserById(ctx.user.id);
        if (!user) throw new TRPCError({ code: "NOT_FOUND" });
        await checkConversionLimit(ctx.user.id, user.subscriptionTier);
        
        // Convert HTML to PDF
        const pdfBuffer = await pdfService.htmlToPdf({
          html: input.html,
          pageSize: input.pageSize,
        });
        
        // Upload result to S3
        const fileKey = `${ctx.user.id}/converted/${nanoid()}.pdf`;
        const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");
        
        await db.incrementUserConversions(ctx.user.id);
        
        return { url, size: pdfBuffer.length };
      }),
      
    markdownToPdf: protectedProcedure
      .input(z.object({
        markdown: z.string(),
        pageSize: z.enum(["A4", "Letter", "Legal"]).default("A4"),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = await db.getUserById(ctx.user.id);
        if (!user) throw new TRPCError({ code: "NOT_FOUND" });
        await checkConversionLimit(ctx.user.id, user.subscriptionTier);
        
        // Convert Markdown to PDF
        const pdfBuffer = await pdfService.markdownToPdf({
          markdown: input.markdown,
          pageSize: input.pageSize,
        });
        
        // Upload result to S3
        const fileKey = `${ctx.user.id}/converted/${nanoid()}.pdf`;
        const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");
        
        await db.incrementUserConversions(ctx.user.id);
        
        return { url, size: pdfBuffer.length };
      }),
      
    getInfo: protectedProcedure
      .input(z.object({
        fileUrl: z.string().url(),
      }))
      .query(async ({ ctx, input }) => {
        // Download PDF
        const response = await fetch(input.fileUrl);
        const arrayBuffer = await response.arrayBuffer();
        const pdfBuffer = Buffer.from(arrayBuffer);
        
        // Get PDF info
        return await pdfService.getPdfInfo(pdfBuffer);
      }),
  }),

  // Cloud Storage Integrations
  cloudStorage: router({
    // Get OAuth authorization URL
    getAuthUrl: protectedProcedure
      .input(z.object({
        provider: z.enum(["google_drive", "dropbox", "onedrive"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const envPrefix = input.provider === "google_drive" ? "GOOGLE" : 
                          input.provider === "dropbox" ? "DROPBOX" : "MICROSOFT";
        const clientId = process.env[`${envPrefix}_CLIENT_ID`];
        const clientSecret = process.env[`${envPrefix}_CLIENT_SECRET`];
        
        if (!clientId || !clientSecret) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `${input.provider} integration not configured. Please add OAuth credentials in Settings.`,
          });
        }
        
        // Generate state for CSRF protection
        const state = oauthService.generateOAuthState(ctx.user.id, input.provider);
        
        // Create OAuth service and get auth URL
        const oauth = oauthService.createOAuthService(input.provider, clientId, clientSecret);
        const authUrl = oauth.getAuthorizationUrl(state);
        
        return { authUrl, state };
      }),
      
    // Handle OAuth callback and exchange code for tokens
    handleCallback: protectedProcedure
      .input(z.object({
        code: z.string(),
        state: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Validate state
        const stateData = oauthService.validateOAuthState(input.state);
        if (!stateData) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid or expired OAuth state",
          });
        }
        
        // Verify user matches
        if (stateData.userId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "OAuth state user mismatch",
          });
        }
        
        const provider = stateData.provider;
        const envPrefix = provider === "google_drive" ? "GOOGLE" : 
                          provider === "dropbox" ? "DROPBOX" : "MICROSOFT";
        const clientId = process.env[`${envPrefix}_CLIENT_ID`];
        const clientSecret = process.env[`${envPrefix}_CLIENT_SECRET`];
        
        if (!clientId || !clientSecret) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `${provider} integration not configured`,
          });
        }
        
        // Exchange code for tokens
        const oauth = oauthService.createOAuthService(provider, clientId, clientSecret);
        const tokens = await oauth.exchangeCodeForTokens(input.code);
        
        // Get user info from provider
        const userInfo = await oauth.getUserInfo(tokens.accessToken);
        
        // Store tokens in database
        await db.saveCloudStorageConnection({
          userId: ctx.user.id,
          provider: provider,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
          accountEmail: userInfo.email,
        });
        
        return { 
          success: true, 
          provider,
          email: userInfo.email,
          name: userInfo.name,
        };
      }),
      
    // Refresh access token
    refreshToken: protectedProcedure
      .input(z.object({
        provider: z.enum(["google_drive", "dropbox", "onedrive"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const connection = await db.getCloudStorageConnection(ctx.user.id, input.provider);
        if (!connection || !connection.refreshToken) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `${input.provider} not connected or refresh token missing`,
          });
        }
        
        const envPrefix = input.provider === "google_drive" ? "GOOGLE" : 
                          input.provider === "dropbox" ? "DROPBOX" : "MICROSOFT";
        const clientId = process.env[`${envPrefix}_CLIENT_ID`];
        const clientSecret = process.env[`${envPrefix}_CLIENT_SECRET`];
        
        if (!clientId || !clientSecret) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `${input.provider} integration not configured`,
          });
        }
        
        const oauth = oauthService.createOAuthService(input.provider, clientId, clientSecret);
        const tokens = await oauth.refreshAccessToken(connection.refreshToken);
        
        // Update tokens in database
        await db.saveCloudStorageConnection({
          userId: ctx.user.id,
          provider: input.provider,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken || connection.refreshToken,
          expiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
        });
        
        return { success: true };
      }),
      
    listConnections: protectedProcedure.query(async ({ ctx }) => {
      return await db.getCloudStorageConnections(ctx.user.id);
    }),
    
    disconnect: protectedProcedure
      .input(z.object({
        provider: z.enum(["google_drive", "dropbox", "onedrive"]),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.deleteCloudStorageConnection(ctx.user.id, input.provider);
        return { success: true };
      }),
      
    listFiles: protectedProcedure
      .input(z.object({
        provider: z.enum(["google_drive", "dropbox", "onedrive"]),
        folderId: z.string().optional(),
        pageToken: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const connection = await db.getCloudStorageConnection(ctx.user.id, input.provider);
        if (!connection) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `${input.provider} not connected`,
          });
        }
        
        const service = cloudStorage.createCloudStorageService(input.provider, connection.accessToken);
        return await service.listFiles({
          folderId: input.folderId,
          pageToken: input.pageToken,
        });
      }),
      
    importFile: protectedProcedure
      .input(z.object({
        provider: z.enum(["google_drive", "dropbox", "onedrive"]),
        fileId: z.string(),
        filename: z.string(),
        mimeType: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const connection = await db.getCloudStorageConnection(ctx.user.id, input.provider);
        if (!connection) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `${input.provider} not connected`,
          });
        }
        
        const service = cloudStorage.createCloudStorageService(input.provider, connection.accessToken);
        
        // Download file from cloud storage
        let fileBuffer: Buffer;
        if (input.provider === "google_drive") {
          fileBuffer = await (service as cloudStorage.GoogleDriveService).downloadFile(input.fileId);
        } else if (input.provider === "dropbox") {
          fileBuffer = await (service as cloudStorage.DropboxService).downloadFile(input.fileId);
        } else {
          fileBuffer = await (service as cloudStorage.OneDriveService).downloadFile(input.fileId);
        }
        
        // Upload to our S3 storage
        const fileKey = `${ctx.user.id}/imported/${nanoid()}_${input.filename}`;
        const { url } = await storagePut(fileKey, fileBuffer, input.mimeType);
        
        // Create file record
        const fileId = await db.createFile({
          userId: ctx.user.id,
          filename: input.filename,
          mimeType: input.mimeType,
          fileSize: fileBuffer.length,
          url: url,
          fileKey: fileKey,
          originalFilename: input.filename,
        });
        
        return { fileId, url, size: fileBuffer.length };
      }),
      
    exportFile: protectedProcedure
      .input(z.object({
        provider: z.enum(["google_drive", "dropbox", "onedrive"]),
        fileId: z.number(),
        folderId: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const connection = await db.getCloudStorageConnection(ctx.user.id, input.provider);
        if (!connection) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `${input.provider} not connected`,
          });
        }
        
        // Get file from our storage
        const file = await db.getFileById(input.fileId);
        if (!file || file.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        
        // Download from our S3
        const response = await fetch(file.url);
        const arrayBuffer = await response.arrayBuffer();
        const fileBuffer = Buffer.from(arrayBuffer);
        
        const service = cloudStorage.createCloudStorageService(input.provider, connection.accessToken);
        
        // Upload to cloud storage
        let cloudFile: cloudStorage.CloudFile;
        if (input.provider === "google_drive") {
          cloudFile = await (service as cloudStorage.GoogleDriveService).uploadFile(
            file.filename,
            fileBuffer,
            file.mimeType,
            input.folderId
          );
        } else if (input.provider === "dropbox") {
          const path = input.folderId ? `${input.folderId}/${file.filename}` : `/${file.filename}`;
          cloudFile = await (service as cloudStorage.DropboxService).uploadFile(path, fileBuffer);
        } else {
          cloudFile = await (service as cloudStorage.OneDriveService).uploadFile(
            file.filename,
            fileBuffer,
            input.folderId
          );
        }
        
        return { cloudFileId: cloudFile.id, cloudFileName: cloudFile.name };
      }),
  }),

  // Audit logs
  audit: router({
    list: protectedProcedure
      .input(z.object({
        resourceType: z.string().optional(),
        limit: z.number().default(50),
      }))
      .query(async ({ ctx, input }) => {
        return await db.getAuditLogs({
          userId: ctx.user.id,
          resourceType: input.resourceType,
          limit: input.limit,
        });
      }),
  }),

  // Annotations for PDF editor
  annotations: router({
    list: protectedProcedure
      .input(z.object({
        fileId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        return await db.getAnnotations(input.fileId, ctx.user.id);
      }),
      
    create: protectedProcedure
      .input(z.object({
        fileId: z.number(),
        type: z.enum(["highlight", "underline", "strikethrough", "text", "shape", "stamp", "signature", "comment", "drawing"]),
        pageNumber: z.number(),
        positionX: z.number(),
        positionY: z.number(),
        width: z.number().optional(),
        height: z.number().optional(),
        content: z.string().optional(),
        color: z.string().optional(),
        shapeType: z.string().optional(),
        strokeWidth: z.number().optional(),
        pathData: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const annotation = await db.createAnnotation({
          ...input,
          userId: ctx.user.id,
        });
        return annotation;
      }),
      
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        content: z.string().optional(),
        positionX: z.number().optional(),
        positionY: z.number().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
        color: z.string().optional(),
        isResolved: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        return await db.updateAnnotation(id, ctx.user.id, data);
      }),
      
    delete: protectedProcedure
      .input(z.object({
        id: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.deleteAnnotation(input.id, ctx.user.id);
        return { success: true };
      }),
      
    resolve: protectedProcedure
      .input(z.object({
        id: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await db.resolveAnnotation(input.id, ctx.user.id);
      }),
  }),



  // PDF Comparison
  pdfComparison: router({
    compare: protectedProcedure
      .input(z.object({
        file1Url: z.string().url(),
        file2Url: z.string().url(),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = await db.getUserById(ctx.user.id);
        if (!user) throw new TRPCError({ code: "NOT_FOUND" });
        await checkConversionLimit(ctx.user.id, user.subscriptionTier);
        
        // Download both PDFs
        const [response1, response2] = await Promise.all([
          fetch(input.file1Url),
          fetch(input.file2Url),
        ]);
        
        const [buffer1, buffer2] = await Promise.all([
          response1.arrayBuffer().then(ab => Buffer.from(ab)),
          response2.arrayBuffer().then(ab => Buffer.from(ab)),
        ]);
        
        // Compare PDFs using our service
        const comparison = await pdfService.comparePdfs(buffer1, buffer2);
        
        await db.incrementUserConversions(ctx.user.id);
        
        return comparison;
      }),
      
    getHistory: protectedProcedure
      .input(z.object({
        limit: z.number().default(20),
      }))
      .query(async ({ ctx, input }) => {
        return await db.getPdfComparisons(ctx.user.id, input.limit);
      }),
  }),

  // Cost tracking and ROI reporting
  costs: router({
    getDashboard: protectedProcedure
      .input(z.object({
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const startDate = input.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const endDate = input.endDate || new Date();
        
        const costs = await db.getCostTracking(ctx.user.id, startDate, endDate);
        const user = await db.getUserById(ctx.user.id);
        
        // Calculate totals
        const totalCost = costs.reduce((sum, c) => sum + parseFloat(c.totalCost), 0);
        const totalRevenue = costs.reduce((sum, c) => sum + parseFloat(c.totalRevenue), 0);
        const roi = totalCost > 0 ? ((totalRevenue - totalCost) / totalCost * 100).toFixed(2) : "0";
        
        return {
          costs,
          summary: {
            totalCost: totalCost.toFixed(2),
            totalRevenue: totalRevenue.toFixed(2),
            roi: `${roi}%`,
            period: { startDate, endDate },
          },
          breakdown: {
            compute: costs.reduce((sum, c) => sum + parseFloat(c.computeCost), 0).toFixed(2),
            storage: costs.reduce((sum, c) => sum + parseFloat(c.storageCost), 0).toFixed(2),
            bandwidth: costs.reduce((sum, c) => sum + parseFloat(c.bandwidthCost), 0).toFixed(2),
            aiProcessing: costs.reduce((sum, c) => sum + parseFloat(c.aiProcessingCost), 0).toFixed(2),
          },
        };
      }),
      
    getUsageMetrics: protectedProcedure
      .input(z.object({
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const startDate = input.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const endDate = input.endDate || new Date();
        
        const costs = await db.getCostTracking(ctx.user.id, startDate, endDate);
        
        return {
          conversions: costs.reduce((sum, c) => sum + c.conversionsCount, 0),
          ocrPages: costs.reduce((sum, c) => sum + c.ocrPagesProcessed, 0),
          transcriptionMinutes: costs.reduce((sum, c) => sum + c.transcriptionMinutes, 0),
          aiTokens: costs.reduce((sum, c) => sum + c.aiChatTokens, 0),
          storageGbHours: costs.reduce((sum, c) => sum + parseFloat(c.storageGbHours), 0).toFixed(2),
          bandwidthGb: costs.reduce((sum, c) => sum + parseFloat(c.bandwidthGb), 0).toFixed(2),
        };
      }),
  }),

  // E-book conversion (EPUB, MOBI)
  ebook: router({
    // Convert EPUB to PDF
    epubToPdf: protectedProcedure
      .input(z.object({
        fileUrl: z.string().url(),
        title: z.string().optional(),
        author: z.string().optional(),
        fontSize: z.number().min(8).max(24).optional(),
        pageSize: z.enum(["a4", "letter", "a5", "b5"]).optional(),
        margins: z.object({
          top: z.number().optional(),
          bottom: z.number().optional(),
          left: z.number().optional(),
          right: z.number().optional(),
        }).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = await db.getUserById(ctx.user.id);
        if (!user) throw new TRPCError({ code: "NOT_FOUND" });
        await checkConversionLimit(ctx.user.id, user.subscriptionTier);
        
        const response = await fetch(input.fileUrl);
        const arrayBuffer = await response.arrayBuffer();
        const inputBuffer = Buffer.from(arrayBuffer);
        
        const result = await ebookService.epubToPdf(inputBuffer, {
          title: input.title,
          author: input.author,
          fontSize: input.fontSize,
          pageSize: input.pageSize,
          margins: input.margins,
        });
        
        await db.incrementUserConversions(ctx.user.id);
        
        return result;
      }),
      
    // Convert MOBI to PDF
    mobiToPdf: protectedProcedure
      .input(z.object({
        fileUrl: z.string().url(),
        title: z.string().optional(),
        author: z.string().optional(),
        fontSize: z.number().min(8).max(24).optional(),
        pageSize: z.enum(["a4", "letter", "a5", "b5"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = await db.getUserById(ctx.user.id);
        if (!user) throw new TRPCError({ code: "NOT_FOUND" });
        await checkConversionLimit(ctx.user.id, user.subscriptionTier);
        
        const response = await fetch(input.fileUrl);
        const arrayBuffer = await response.arrayBuffer();
        const inputBuffer = Buffer.from(arrayBuffer);
        
        const result = await ebookService.mobiToPdf(inputBuffer, {
          title: input.title,
          author: input.author,
          fontSize: input.fontSize,
          pageSize: input.pageSize,
        });
        
        await db.incrementUserConversions(ctx.user.id);
        
        return result;
      }),
      
    // Convert PDF to EPUB
    pdfToEpub: protectedProcedure
      .input(z.object({
        fileUrl: z.string().url(),
        title: z.string().optional(),
        author: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = await db.getUserById(ctx.user.id);
        if (!user) throw new TRPCError({ code: "NOT_FOUND" });
        await checkConversionLimit(ctx.user.id, user.subscriptionTier);
        
        const response = await fetch(input.fileUrl);
        const arrayBuffer = await response.arrayBuffer();
        const inputBuffer = Buffer.from(arrayBuffer);
        
        const result = await ebookService.pdfToEpub(inputBuffer, {
          title: input.title,
          author: input.author,
        });
        
        await db.incrementUserConversions(ctx.user.id);
        
        return result;
      }),
      
    // Convert PDF to MOBI
    pdfToMobi: protectedProcedure
      .input(z.object({
        fileUrl: z.string().url(),
        title: z.string().optional(),
        author: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = await db.getUserById(ctx.user.id);
        if (!user) throw new TRPCError({ code: "NOT_FOUND" });
        await checkConversionLimit(ctx.user.id, user.subscriptionTier);
        
        const response = await fetch(input.fileUrl);
        const arrayBuffer = await response.arrayBuffer();
        const inputBuffer = Buffer.from(arrayBuffer);
        
        const result = await ebookService.pdfToMobi(inputBuffer, {
          title: input.title,
          author: input.author,
        });
        
        await db.incrementUserConversions(ctx.user.id);
        
        return result;
      }),
      
    // Extract e-book metadata
    extractMetadata: protectedProcedure
      .input(z.object({
        fileUrl: z.string().url(),
        format: z.enum(["epub", "mobi", "azw", "azw3", "fb2", "pdf"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const response = await fetch(input.fileUrl);
        const arrayBuffer = await response.arrayBuffer();
        const inputBuffer = Buffer.from(arrayBuffer);
        
        const metadata = await ebookService.extractEbookMetadata(inputBuffer, input.format);
        
        return metadata;
      }),
      
    // Extract e-book cover
    extractCover: protectedProcedure
      .input(z.object({
        fileUrl: z.string().url(),
        format: z.enum(["epub", "mobi", "azw", "azw3", "fb2"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const response = await fetch(input.fileUrl);
        const arrayBuffer = await response.arrayBuffer();
        const inputBuffer = Buffer.from(arrayBuffer);
        
        const cover = await ebookService.extractEbookCover(inputBuffer, input.format);
        
        return cover;
      }),
      
    // Get supported formats
    getSupportedFormats: publicProcedure.query(() => {
      return {
        input: ebookService.getSupportedInputFormats(),
        output: ebookService.getSupportedOutputFormats(),
      };
    }),
  }),
  
  // CAD file conversion (DWG, DXF)
  cad: router({
    // Convert DWG to PDF
    dwgToPdf: protectedProcedure
      .input(z.object({
        fileUrl: z.string().url(),
        scale: z.number().min(0.1).max(10).optional(),
        paperSize: z.enum(["a4", "a3", "a2", "a1", "a0", "letter", "legal", "tabloid"]).optional(),
        orientation: z.enum(["portrait", "landscape"]).optional(),
        layers: z.array(z.string()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = await db.getUserById(ctx.user.id);
        if (!user) throw new TRPCError({ code: "NOT_FOUND" });
        await checkConversionLimit(ctx.user.id, user.subscriptionTier);
        
        const response = await fetch(input.fileUrl);
        const arrayBuffer = await response.arrayBuffer();
        const inputBuffer = Buffer.from(arrayBuffer);
        
        const result = await cadService.dwgToPdf(inputBuffer, {
          scale: input.scale,
          paperSize: input.paperSize,
          orientation: input.orientation,
          layers: input.layers,
        });
        
        await db.incrementUserConversions(ctx.user.id);
        
        return result;
      }),
      
    // Convert DXF to PDF
    dxfToPdf: protectedProcedure
      .input(z.object({
        fileUrl: z.string().url(),
        scale: z.number().min(0.1).max(10).optional(),
        paperSize: z.enum(["a4", "a3", "a2", "a1", "a0", "letter", "legal", "tabloid"]).optional(),
        orientation: z.enum(["portrait", "landscape"]).optional(),
        layers: z.array(z.string()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = await db.getUserById(ctx.user.id);
        if (!user) throw new TRPCError({ code: "NOT_FOUND" });
        await checkConversionLimit(ctx.user.id, user.subscriptionTier);
        
        const response = await fetch(input.fileUrl);
        const arrayBuffer = await response.arrayBuffer();
        const inputBuffer = Buffer.from(arrayBuffer);
        
        const result = await cadService.dxfToPdf(inputBuffer, {
          scale: input.scale,
          paperSize: input.paperSize,
          orientation: input.orientation,
          layers: input.layers,
        });
        
        await db.incrementUserConversions(ctx.user.id);
        
        return result;
      }),
      
    // Convert DWG to SVG
    dwgToSvg: protectedProcedure
      .input(z.object({
        fileUrl: z.string().url(),
        scale: z.number().min(0.1).max(10).optional(),
        backgroundColor: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = await db.getUserById(ctx.user.id);
        if (!user) throw new TRPCError({ code: "NOT_FOUND" });
        await checkConversionLimit(ctx.user.id, user.subscriptionTier);
        
        const response = await fetch(input.fileUrl);
        const arrayBuffer = await response.arrayBuffer();
        const inputBuffer = Buffer.from(arrayBuffer);
        
        const result = await cadService.dwgToSvg(inputBuffer, {
          scale: input.scale,
          backgroundColor: input.backgroundColor,
        });
        
        await db.incrementUserConversions(ctx.user.id);
        
        return result;
      }),
      
    // Convert DXF to SVG
    dxfToSvg: protectedProcedure
      .input(z.object({
        fileUrl: z.string().url(),
        scale: z.number().min(0.1).max(10).optional(),
        backgroundColor: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = await db.getUserById(ctx.user.id);
        if (!user) throw new TRPCError({ code: "NOT_FOUND" });
        await checkConversionLimit(ctx.user.id, user.subscriptionTier);
        
        const response = await fetch(input.fileUrl);
        const arrayBuffer = await response.arrayBuffer();
        const inputBuffer = Buffer.from(arrayBuffer);
        
        const result = await cadService.dxfToSvg(inputBuffer, {
          scale: input.scale,
          backgroundColor: input.backgroundColor,
        });
        
        await db.incrementUserConversions(ctx.user.id);
        
        return result;
      }),
      
    // Convert DWG to PNG
    dwgToPng: protectedProcedure
      .input(z.object({
        fileUrl: z.string().url(),
        dpi: z.number().min(72).max(600).optional(),
        backgroundColor: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = await db.getUserById(ctx.user.id);
        if (!user) throw new TRPCError({ code: "NOT_FOUND" });
        await checkConversionLimit(ctx.user.id, user.subscriptionTier);
        
        const response = await fetch(input.fileUrl);
        const arrayBuffer = await response.arrayBuffer();
        const inputBuffer = Buffer.from(arrayBuffer);
        
        const result = await cadService.dwgToPng(inputBuffer, {
          dpi: input.dpi,
          backgroundColor: input.backgroundColor,
        });
        
        await db.incrementUserConversions(ctx.user.id);
        
        return result;
      }),
      
    // Convert DXF to PNG
    dxfToPng: protectedProcedure
      .input(z.object({
        fileUrl: z.string().url(),
        dpi: z.number().min(72).max(600).optional(),
        backgroundColor: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = await db.getUserById(ctx.user.id);
        if (!user) throw new TRPCError({ code: "NOT_FOUND" });
        await checkConversionLimit(ctx.user.id, user.subscriptionTier);
        
        const response = await fetch(input.fileUrl);
        const arrayBuffer = await response.arrayBuffer();
        const inputBuffer = Buffer.from(arrayBuffer);
        
        const result = await cadService.dxfToPng(inputBuffer, {
          dpi: input.dpi,
          backgroundColor: input.backgroundColor,
        });
        
        await db.incrementUserConversions(ctx.user.id);
        
        return result;
      }),
      
    // Extract CAD metadata
    extractMetadata: protectedProcedure
      .input(z.object({
        fileUrl: z.string().url(),
        format: z.enum(["dwg", "dxf"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const response = await fetch(input.fileUrl);
        const arrayBuffer = await response.arrayBuffer();
        const inputBuffer = Buffer.from(arrayBuffer);
        
        const metadata = await cadService.extractCadMetadata(inputBuffer, input.format);
        
        return metadata;
      }),
      
    // Get supported formats
    getSupportedFormats: publicProcedure.query(() => {
      return {
        input: cadService.getSupportedCadInputFormats(),
        output: cadService.getSupportedCadOutputFormats(),
      };
    }),
  }),

  // Text-to-speech for accessibility
  tts: router({
    synthesize: protectedProcedure
      .input(z.object({
        text: z.string().max(5000),
        language: z.string().default("en"),
        voice: z.enum(["male", "female"]).default("female"),
        speed: z.number().min(0.5).max(2).default(1),
      }))
      .mutation(async ({ ctx, input }) => {
        // Use LLM to generate speech-optimized text
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: "You are a text-to-speech preparation assistant. Clean and format the text for natural speech synthesis. Remove special characters, expand abbreviations, and add appropriate pauses.",
            },
            {
              role: "user",
              content: input.text,
            },
          ],
        });
        
        const cleanedText = (response.choices[0]?.message?.content as string) || input.text;
        
        // In production, this would call a TTS API like Google Cloud TTS or AWS Polly
        // For now, return the cleaned text that can be used with browser's SpeechSynthesis API
        return {
          text: cleanedText,
          language: input.language,
          voice: input.voice,
          speed: input.speed,
          // audioUrl would be populated by actual TTS service
          audioUrl: null,
        };
      }),
   }),

  // Email preferences routes
  email: router({
    getPreferences: protectedProcedure
      .query(async ({ ctx }) => {
        let prefs = await emailService.getEmailPreferences(ctx.user.id);
        if (!prefs) {
          await emailService.createEmailPreferences(ctx.user.id);
          prefs = await emailService.getEmailPreferences(ctx.user.id);
        }
        return prefs;
      }),

    updatePreferences: protectedProcedure
      .input(z.object({
        conversionComplete: z.boolean().optional(),
        batchComplete: z.boolean().optional(),
        weeklyDigest: z.boolean().optional(),
        teamInvitations: z.boolean().optional(),
        securityAlerts: z.boolean().optional(),
        productUpdates: z.boolean().optional(),
        usageLimitWarnings: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await emailService.updateEmailPreferences(ctx.user.id, input);
      }),

    sendTestEmail: protectedProcedure
      .mutation(async ({ ctx }) => {
        if (!ctx.user.email) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "No email address on file" });
        }
        const template = emailService.getWelcomeEmailTemplate(ctx.user.name || "there");
        const result = await emailService.sendEmail({
          to: ctx.user.email,
          toName: ctx.user.name || undefined,
          subject: "[Test] " + template.subject,
          html: template.html,
          text: template.text,
        });
        return result;
      }),

    processQueue: protectedProcedure
      .mutation(async ({ ctx }) => {
        // Only allow admins to process queue manually
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        }
        return await emailService.processEmailQueue(10);
      }),
  }),

  // PDF/A Compliance Conversion
  pdfa: router({
    convert: protectedProcedure
      .input(z.object({
        fileUrl: z.string().url(),
        conformanceLevel: z.enum(["1b", "2b", "3b"]),
        embedFonts: z.boolean().optional().default(true),
        title: z.string().optional(),
        author: z.string().optional(),
        subject: z.string().optional(),
        keywords: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Fetch the PDF file
        const response = await fetch(input.fileUrl);
        if (!response.ok) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Failed to fetch PDF file" });
        }
        const pdfBuffer = Buffer.from(await response.arrayBuffer());

        // Convert to PDF/A
        const result = await pdfaService.convertToPDFA({
          pdfBuffer,
          conformanceLevel: input.conformanceLevel,
          embedFonts: input.embedFonts,
          title: input.title,
          author: input.author || ctx.user.name || undefined,
          subject: input.subject,
          keywords: input.keywords,
        });

        if (!result.success) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error || "PDF/A conversion failed" });
        }

        // Record conversion
        await db.createConversion({
          userId: ctx.user.id,
          sourceFilename: "document.pdf",
          sourceFormat: "pdf",
          sourceSize: pdfBuffer.length,
          outputFormat: `pdfa-${input.conformanceLevel}`,
          outputFilename: `document-pdfa-${input.conformanceLevel}.pdf`,
          conversionType: "pdf_to_pdfa",
          status: "completed",
          outputSize: result.fileSize,
        });

        return result;
      }),

    validate: protectedProcedure
      .input(z.object({
        fileUrl: z.string().url(),
      }))
      .mutation(async ({ input }) => {
        const response = await fetch(input.fileUrl);
        if (!response.ok) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Failed to fetch PDF file" });
        }
        const pdfBuffer = Buffer.from(await response.arrayBuffer());
        return await pdfaService.validatePDFA(pdfBuffer);
      }),

    getInfo: protectedProcedure
      .input(z.object({
        fileUrl: z.string().url(),
      }))
      .mutation(async ({ input }) => {
        const response = await fetch(input.fileUrl);
        if (!response.ok) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Failed to fetch PDF file" });
        }
        const pdfBuffer = Buffer.from(await response.arrayBuffer());
        return await pdfaService.getPDFAInfo(pdfBuffer);
      }),

    getConformanceLevels: publicProcedure
      .query(() => {
        return {
          levels: [
            pdfaService.getConformanceLevelDescription("1b"),
            pdfaService.getConformanceLevelDescription("2b"),
            pdfaService.getConformanceLevelDescription("3b"),
          ],
        };
      }),
  }),

  // PDF Linearization / Web Optimization
  linearization: router({
    optimize: protectedProcedure
      .input(z.object({
        fileUrl: z.string().url(),
        compressStreams: z.boolean().optional().default(true),
        objectStreams: z.enum(["disable", "preserve", "generate"]).optional().default("preserve"),
        aggressive: z.boolean().optional().default(false),
      }))
      .mutation(async ({ input, ctx }) => {
        // Fetch the PDF file
        const response = await fetch(input.fileUrl);
        if (!response.ok) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Failed to fetch PDF file" });
        }
        const pdfBuffer = Buffer.from(await response.arrayBuffer());

        // Linearize the PDF
        const result = await linearizationService.linearizePdf({
          pdfBuffer,
          compressStreams: input.compressStreams,
          objectStreams: input.objectStreams,
        });

        if (!result.success) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error || "Linearization failed" });
        }

        // Record the conversion
        await db.createConversion({
          userId: ctx.user.id,
          conversionType: "web_optimize",
          sourceFilename: "document.pdf",
          sourceFormat: "pdf",
          sourceSize: result.originalSize || 0,
          outputFormat: "pdf",
          outputSize: result.optimizedSize || 0,
          outputFilename: "document-optimized.pdf",
          status: "completed",
        });

        return result;
      }),
    check: protectedProcedure
      .input(z.object({
        fileUrl: z.string().url(),
      }))
      .mutation(async ({ input }) => {
        const response = await fetch(input.fileUrl);
        if (!response.ok) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Failed to fetch PDF file" });
        }
        const pdfBuffer = Buffer.from(await response.arrayBuffer());
        return await linearizationService.checkLinearization(pdfBuffer);
      }),
    getInfo: protectedProcedure
      .input(z.object({
        fileUrl: z.string().url(),
      }))
      .mutation(async ({ input }) => {
        const response = await fetch(input.fileUrl);
        if (!response.ok) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Failed to fetch PDF file" });
        }
        const pdfBuffer = Buffer.from(await response.arrayBuffer());
        return await linearizationService.getPdfOptimizationInfo(pdfBuffer);
      }),
    optimizeForWeb: protectedProcedure
      .input(z.object({
        fileUrl: z.string().url(),
        aggressive: z.boolean().optional().default(false),
        preserveQuality: z.boolean().optional().default(true),
      }))
      .mutation(async ({ input, ctx }) => {
        const response = await fetch(input.fileUrl);
        if (!response.ok) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Failed to fetch PDF file" });
        }
        const pdfBuffer = Buffer.from(await response.arrayBuffer());

        const result = await linearizationService.optimizeForWeb(pdfBuffer, {
          aggressive: input.aggressive,
          preserveQuality: input.preserveQuality,
        });

        if (!result.success) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error || "Web optimization failed" });
        }

        // Record the conversion
        await db.createConversion({
          userId: ctx.user.id,
          conversionType: "web_optimize",
          sourceFilename: "document.pdf",
          sourceFormat: "pdf",
          sourceSize: result.originalSize || 0,
          outputFormat: "pdf",
          outputSize: result.optimizedSize || 0,
          outputFilename: "document-optimized.pdf",
          status: "completed",
        });

        return result;
      }),
  }),

  // PDF Form Filling routes
  forms: router({
    // Detect form fields in a PDF
    detectFields: protectedProcedure
      .input(z.object({
        fileUrl: z.string().url(),
      }))
      .mutation(async ({ ctx, input }) => {
        const response = await fetch(input.fileUrl);
        if (!response.ok) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Failed to fetch PDF file" });
        }
        const pdfBuffer = Buffer.from(await response.arrayBuffer());
        const schema = await formService.detectFormFields(pdfBuffer);
        return schema;
      }),

    // Fill form fields in a PDF
    fillFields: protectedProcedure
      .input(z.object({
        fileUrl: z.string().url(),
        formData: z.record(z.string(), z.union([z.string(), z.boolean()])),
        flatten: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const response = await fetch(input.fileUrl);
        if (!response.ok) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Failed to fetch PDF file" });
        }
        const pdfBuffer = Buffer.from(await response.arrayBuffer());
        const result = await formService.fillFormFields(pdfBuffer, input.formData, {
          flatten: input.flatten,
          userId: ctx.user.id,
        });
        return result;
      }),

    // Extract form data from a filled PDF
    extractData: protectedProcedure
      .input(z.object({
        fileUrl: z.string().url(),
      }))
      .mutation(async ({ ctx, input }) => {
        const response = await fetch(input.fileUrl);
        if (!response.ok) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Failed to fetch PDF file" });
        }
        const pdfBuffer = Buffer.from(await response.arrayBuffer());
        const formData = await formService.extractFormData(pdfBuffer);
        return formData;
      }),

    // Validate form data against schema
    validateData: protectedProcedure
      .input(z.object({
        fileUrl: z.string().url(),
        formData: z.record(z.string(), z.union([z.string(), z.boolean()])),
      }))
      .mutation(async ({ ctx, input }) => {
        const response = await fetch(input.fileUrl);
        if (!response.ok) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Failed to fetch PDF file" });
        }
        const pdfBuffer = Buffer.from(await response.arrayBuffer());
        const schema = await formService.detectFormFields(pdfBuffer);
        const validation = formService.validateFormData(schema, input.formData);
        return validation;
      }),

    // Clear all form fields
    clearFields: protectedProcedure
      .input(z.object({
        fileUrl: z.string().url(),
      }))
      .mutation(async ({ ctx, input }) => {
        const response = await fetch(input.fileUrl);
        if (!response.ok) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Failed to fetch PDF file" });
        }
        const pdfBuffer = Buffer.from(await response.arrayBuffer());
        const result = await formService.clearFormFields(pdfBuffer, {
          userId: ctx.user.id,
        });
        return result;
      }),

    // Create a new PDF with form fields
    createForm: protectedProcedure
      .input(z.object({
        fields: z.array(z.object({
          name: z.string(),
          type: z.enum(["text", "checkbox", "radio", "dropdown", "signature", "date", "unknown"]),
          page: z.number(),
          x: z.number(),
          y: z.number(),
          width: z.number(),
          height: z.number(),
          options: z.array(z.string()).optional(),
          defaultValue: z.union([z.string(), z.boolean()]).optional(),
        })),
        pageSize: z.object({
          width: z.number(),
          height: z.number(),
        }).optional(),
        pageCount: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const result = await formService.createFormPdf(input.fields, {
          pageSize: input.pageSize,
          pageCount: input.pageCount,
          userId: ctx.user.id,
        });
        return result;
      }),
  }),

  // Social Login Authentication
  socialAuth: router({
    // Get user's connected social accounts
    getConnections: protectedProcedure.query(async ({ ctx }) => {
      const connections = await authService.getUserSocialLogins(ctx.user.id);
      return connections.map(c => ({
        provider: c.provider,
        email: c.email,
        name: c.name,
        connectedAt: c.createdAt,
      }));
    }),

    // Get authorization URL for social login
    getAuthUrl: publicProcedure
      .input(z.object({
        provider: z.enum(["google", "github"]),
        returnUrl: z.string().optional(),
      }))
      .query(({ input }) => {
        const state = Buffer.from(JSON.stringify({
          provider: input.provider,
          returnUrl: input.returnUrl || "/dashboard",
          timestamp: Date.now(),
        })).toString("base64url");

        if (input.provider === "google") {
          const clientId = process.env.GOOGLE_SOCIAL_CLIENT_ID;
          if (!clientId) {
            return { url: null, error: "Google OAuth not configured" };
          }
          const params = new URLSearchParams({
            client_id: clientId,
            redirect_uri: `${process.env.VITE_FRONTEND_FORGE_API_URL || ""}/api/auth/google/callback`,
            response_type: "code",
            scope: "openid email profile",
            state,
            access_type: "offline",
            prompt: "consent",
          });
          return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` };
        }

        if (input.provider === "github") {
          const clientId = process.env.GITHUB_CLIENT_ID;
          if (!clientId) {
            return { url: null, error: "GitHub OAuth not configured" };
          }
          const params = new URLSearchParams({
            client_id: clientId,
            redirect_uri: `${process.env.VITE_FRONTEND_FORGE_API_URL || ""}/api/auth/github/callback`,
            scope: "read:user user:email",
            state,
          });
          return { url: `https://github.com/login/oauth/authorize?${params.toString()}` };
        }

        return { url: null, error: "Invalid provider" };
      }),

    // Disconnect social account
    disconnect: protectedProcedure
      .input(z.object({
        provider: z.enum(["google", "github"]),
      }))
      .mutation(async ({ ctx, input }) => {
        await authService.deleteSocialLogin(ctx.user.id, input.provider);
        return { success: true };
      }),
  }),

  // TOTP 2FA Authentication
  twoFactor: router({
    // Get 2FA status
    getStatus: protectedProcedure.query(async ({ ctx }) => {
      const enabled = await authService.isTwoFactorEnabled(ctx.user.id);
      const backupCodesRemaining = enabled ? await authService.countUnusedBackupCodes(ctx.user.id) : 0;
      return { enabled, backupCodesRemaining };
    }),

    // Setup 2FA - generate secret and QR code
    setup: protectedProcedure.mutation(async ({ ctx }) => {
      const user = await db.getUserById(ctx.user.id);
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });

      const email = user.email || user.name || `user-${ctx.user.id}`;
      const setup = totpService.setupTOTP(email);

      return {
        secret: setup.secret,
        otpauthUri: setup.otpauthUri,
        backupCodes: setup.backupCodes,
      };
    }),

    // Enable 2FA after verification
    enable: protectedProcedure
      .input(z.object({
        secret: z.string(),
        code: z.string().length(6),
        backupCodes: z.array(z.string()),
      }))
      .mutation(async ({ ctx, input }) => {
        // Verify the code first
        const isValid = totpService.verifyTOTP(input.secret, input.code);
        if (!isValid) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid verification code" });
        }

        // Enable 2FA
        await authService.enableTwoFactor(ctx.user.id, input.secret);
        await authService.createBackupCodes(ctx.user.id, input.backupCodes);

        return { success: true };
      }),

    // Disable 2FA
    disable: protectedProcedure
      .input(z.object({
        code: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const secret = await authService.getTwoFactorSecret(ctx.user.id);
        if (!secret) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "2FA not enabled" });
        }

        // Verify with TOTP or backup code
        const isValidTOTP = totpService.verifyTOTP(secret, input.code);
        const isValidBackup = !isValidTOTP && await authService.useBackupCode(ctx.user.id, input.code);

        if (!isValidTOTP && !isValidBackup) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid code" });
        }

        await authService.disableTwoFactor(ctx.user.id);
        return { success: true };
      }),

    // Verify 2FA code
    verify: protectedProcedure
      .input(z.object({
        code: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const secret = await authService.getTwoFactorSecret(ctx.user.id);
        if (!secret) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "2FA not enabled" });
        }

        // Try TOTP first, then backup code
        const isValidTOTP = totpService.verifyTOTP(secret, input.code);
        const isValidBackup = !isValidTOTP && await authService.useBackupCode(ctx.user.id, input.code);

        if (!isValidTOTP && !isValidBackup) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid code" });
        }

        return { success: true, usedBackupCode: isValidBackup };
      }),

    // Generate new backup codes
    regenerateBackupCodes: protectedProcedure
      .input(z.object({
        code: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const secret = await authService.getTwoFactorSecret(ctx.user.id);
        if (!secret) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "2FA not enabled" });
        }

        // Verify current code
        const isValid = totpService.verifyTOTP(secret, input.code);
        if (!isValid) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid verification code" });
        }

        const newCodes = totpService.generateBackupCodes();
        await authService.createBackupCodes(ctx.user.id, newCodes);

        return { backupCodes: newCodes };
      }),
  }),

  // Passkey/WebAuthn Authentication
  passkeys: router({
    // Get user's passkeys
    list: protectedProcedure.query(async ({ ctx }) => {
      const passkeys = await authService.getUserPasskeys(ctx.user.id);
      return passkeys.map(p => ({
        credentialId: p.credentialId,
        deviceName: p.deviceName,
        deviceType: p.deviceType,
        lastUsedAt: p.lastUsedAt,
        createdAt: p.createdAt,
      }));
    }),

    // Get passkey status
    getStatus: protectedProcedure.query(async ({ ctx }) => {
      const enabled = await authService.isPasskeyEnabled(ctx.user.id);
      const passkeys = await authService.getUserPasskeys(ctx.user.id);
      return { enabled, count: passkeys.length };
    }),

    // Register a new passkey (returns options for WebAuthn)
    getRegistrationOptions: protectedProcedure.query(async ({ ctx }) => {
      const user = await db.getUserById(ctx.user.id);
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });

      const existingPasskeys = await authService.getUserPasskeys(ctx.user.id);
      const challenge = Buffer.from(crypto.randomBytes(32)).toString("base64url");

      // Store challenge in session/cache for verification
      // In production, use a proper session store

      return {
        challenge,
        rp: {
          name: "ProPDFs",
          id: new URL(process.env.VITE_FRONTEND_FORGE_API_URL || "https://propdfs.manus.space").hostname,
        },
        user: {
          id: Buffer.from(String(ctx.user.id)).toString("base64url"),
          name: user.email || user.name || `user-${ctx.user.id}`,
          displayName: user.name || "ProPDFs User",
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        timeout: 60000,
        attestation: "none",
        authenticatorSelection: {
          residentKey: "preferred",
          userVerification: "preferred",
        },
        excludeCredentials: existingPasskeys.map(p => ({
          type: "public-key",
          id: p.credentialId,
        })),
      };
    }),

    // Complete passkey registration
    register: protectedProcedure
      .input(z.object({
        credentialId: z.string(),
        publicKey: z.string(),
        deviceName: z.string().optional(),
        deviceType: z.string().optional(),
        transports: z.array(z.string()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await authService.createPasskey({
          userId: ctx.user.id,
          credentialId: input.credentialId,
          publicKey: input.publicKey,
          deviceName: input.deviceName || "My Passkey",
          deviceType: input.deviceType,
          transports: input.transports,
        });

        // Enable passkey auth if first passkey
        await authService.enablePasskeyAuth(ctx.user.id);

        return { success: true };
      }),

    // Rename a passkey
    rename: protectedProcedure
      .input(z.object({
        credentialId: z.string(),
        deviceName: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        await authService.updatePasskeyName(ctx.user.id, input.credentialId, input.deviceName);
        return { success: true };
      }),

    // Delete a passkey
    delete: protectedProcedure
      .input(z.object({
        credentialId: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        await authService.deletePasskey(ctx.user.id, input.credentialId);

        // Disable passkey auth if no passkeys left
        const remaining = await authService.getUserPasskeys(ctx.user.id);
        if (remaining.length === 0) {
          await authService.disablePasskeyAuth(ctx.user.id);
        }

        return { success: true };
      }),
  }),

  // Voice Commands
  voice: router({
    // Parse and execute voice command
    execute: protectedProcedure
      .input(z.object({
        transcript: z.string(),
        language: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const parsed = voiceCommandService.parseVoiceCommand(input.transcript);
        const response = voiceCommandService.generateVoiceResponse(parsed);

        // Log the command
        await authService.logVoiceCommand({
          userId: ctx.user.id,
          transcript: input.transcript,
          command: parsed.action,
          parameters: parsed.parameters,
          confidence: String(parsed.confidence),
          language: input.language,
          wasSuccessful: parsed.type !== "unknown",
        });

        // Get navigation path if it's a navigation command
        let navigationPath: string | null = null;
        if (parsed.type === "navigation" && parsed.parameters.page) {
          navigationPath = voiceCommandService.getNavigationPath(parsed.parameters.page as string);
        }

        return {
          command: parsed,
          response,
          navigationPath,
        };
      }),

    // Get available commands
    getCommands: publicProcedure.query(() => {
      return voiceCommandService.getAvailableCommands();
    }),

    // Get supported languages
    getLanguages: publicProcedure.query(() => {
      return voiceCommandService.SUPPORTED_VOICE_LANGUAGES;
    }),

    // Get user's voice command history
    getHistory: protectedProcedure
      .input(z.object({
        limit: z.number().default(50),
      }))
      .query(async ({ ctx, input }) => {
        return await authService.getUserVoiceCommands(ctx.user.id, input.limit);
      }),

    // Get voice command statistics
    getStats: protectedProcedure.query(async ({ ctx }) => {
      return await authService.getVoiceCommandStats(ctx.user.id);
    }),
  }),

  // Read Aloud
  readAloud: router({
    // Get available voices
    getVoices: publicProcedure.query(() => {
      return readAloudService.getAvailableVoices();
    }),

    // Get supported languages
    getLanguages: publicProcedure.query(() => {
      return readAloudService.READ_ALOUD_LANGUAGES;
    }),

    // Get speed presets
    getSpeedPresets: publicProcedure.query(() => {
      return readAloudService.SPEED_PRESETS;
    }),

    // Get keyboard shortcuts
    getShortcuts: publicProcedure.query(() => {
      return readAloudService.READ_ALOUD_SHORTCUTS;
    }),

    // Extract text from PDF for reading
    extractText: protectedProcedure
      .input(z.object({
        fileUrl: z.string().url(),
      }))
      .mutation(async ({ ctx, input }) => {
        const response = await fetch(input.fileUrl);
        if (!response.ok) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Failed to fetch file" });
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        const text = await pdfService.extractText(buffer);

        const segments = readAloudService.splitIntoSentences(text);
        const estimatedTime = readAloudService.estimateReadingTime(text);
        const detectedLanguage = readAloudService.detectLanguage(text);

        return {
          text: readAloudService.cleanTextForSpeech(text),
          segments,
          estimatedTime,
          formattedTime: readAloudService.formatTime(estimatedTime),
          detectedLanguage,
        };
      }),

    // Get default settings
    getDefaultSettings: publicProcedure.query(() => {
      return readAloudService.DEFAULT_READ_ALOUD_SETTINGS;
    }),
  }),
});
export type AppRouter = typeof appRouter;
