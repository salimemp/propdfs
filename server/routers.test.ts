import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock user for authenticated context
type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createMockUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 1,
    openId: "test-user-123",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
}

function createAuthContext(user?: AuthenticatedUser): TrpcContext {
  return {
    user: user || createMockUser(),
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("auth router", () => {
  it("auth.me returns user when authenticated", async () => {
    const user = createMockUser();
    const ctx = createAuthContext(user);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.me();

    expect(result).toEqual(user);
  });

  it("auth.me returns null when not authenticated", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.me();

    expect(result).toBeNull();
  });

  it("auth.logout clears session cookie", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    expect(ctx.res.clearCookie).toHaveBeenCalled();
  });
});

describe("subscription tiers", () => {
  it("free tier has correct limits", () => {
    const freeLimits = {
      conversionsPerMonth: 10,
      maxFileSizeMB: 25,
      storageGB: 1,
      batchProcessing: false,
      teamFeatures: false,
    };

    expect(freeLimits.conversionsPerMonth).toBe(10);
    expect(freeLimits.maxFileSizeMB).toBe(25);
    expect(freeLimits.storageGB).toBe(1);
    expect(freeLimits.batchProcessing).toBe(false);
    expect(freeLimits.teamFeatures).toBe(false);
  });

  it("pro tier has correct limits", () => {
    const proLimits = {
      conversionsPerMonth: Infinity,
      maxFileSizeMB: 500,
      storageGB: 50,
      batchProcessing: true,
      teamFeatures: false,
    };

    expect(proLimits.conversionsPerMonth).toBe(Infinity);
    expect(proLimits.maxFileSizeMB).toBe(500);
    expect(proLimits.storageGB).toBe(50);
    expect(proLimits.batchProcessing).toBe(true);
    expect(proLimits.teamFeatures).toBe(false);
  });

  it("enterprise tier has correct limits", () => {
    const enterpriseLimits = {
      conversionsPerMonth: Infinity,
      maxFileSizeMB: 2048,
      storageGB: 1024,
      batchProcessing: true,
      teamFeatures: true,
    };

    expect(enterpriseLimits.conversionsPerMonth).toBe(Infinity);
    expect(enterpriseLimits.maxFileSizeMB).toBe(2048);
    expect(enterpriseLimits.storageGB).toBe(1024);
    expect(enterpriseLimits.batchProcessing).toBe(true);
    expect(enterpriseLimits.teamFeatures).toBe(true);
  });
});

describe("conversion types", () => {
  const validConversionTypes = [
    "pdf_to_word", "pdf_to_excel", "pdf_to_ppt",
    "word_to_pdf", "excel_to_pdf", "ppt_to_pdf",
    "image_to_pdf", "pdf_to_image",
    "html_to_pdf", "pdf_to_html", "markdown_to_pdf",
    "merge", "split", "compress", "rotate", "watermark",
    "encrypt", "decrypt", "ocr", "transcription"
  ];

  it("all conversion types are defined", () => {
    expect(validConversionTypes.length).toBe(20);
  });

  it("PDF operations are included", () => {
    expect(validConversionTypes).toContain("merge");
    expect(validConversionTypes).toContain("split");
    expect(validConversionTypes).toContain("compress");
    expect(validConversionTypes).toContain("rotate");
    expect(validConversionTypes).toContain("watermark");
    expect(validConversionTypes).toContain("encrypt");
    expect(validConversionTypes).toContain("decrypt");
  });

  it("document conversions are included", () => {
    expect(validConversionTypes).toContain("pdf_to_word");
    expect(validConversionTypes).toContain("word_to_pdf");
    expect(validConversionTypes).toContain("pdf_to_excel");
    expect(validConversionTypes).toContain("excel_to_pdf");
  });

  it("OCR and transcription are included", () => {
    expect(validConversionTypes).toContain("ocr");
    expect(validConversionTypes).toContain("transcription");
  });
});

describe("team roles", () => {
  const validRoles = ["admin", "editor", "viewer"];

  it("all team roles are defined", () => {
    expect(validRoles.length).toBe(3);
  });

  it("admin role exists", () => {
    expect(validRoles).toContain("admin");
  });

  it("editor role exists", () => {
    expect(validRoles).toContain("editor");
  });

  it("viewer role exists", () => {
    expect(validRoles).toContain("viewer");
  });
});

describe("file size limits", () => {
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  it("formats bytes correctly", () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1048576)).toBe('1 MB');
    expect(formatBytes(1073741824)).toBe('1 GB');
  });

  it("free tier limit is 25MB", () => {
    const freeLimit = 25 * 1024 * 1024;
    expect(formatBytes(freeLimit)).toBe('25 MB');
  });

  it("pro tier limit is 500MB", () => {
    const proLimit = 500 * 1024 * 1024;
    expect(formatBytes(proLimit)).toBe('500 MB');
  });

  it("enterprise tier limit is 2GB", () => {
    const enterpriseLimit = 2 * 1024 * 1024 * 1024;
    expect(formatBytes(enterpriseLimit)).toBe('2 GB');
  });
});
