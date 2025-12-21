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
});

export type AppRouter = typeof appRouter;
