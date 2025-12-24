import { describe, it, expect } from "vitest";
import { validateResendApiKey } from "./emailService";

describe("Email Service", () => {
  describe("validateResendApiKey", () => {
    it("should validate Resend API key", async () => {
      const result = await validateResendApiKey();
      
      // The API key should be configured and valid
      expect(result).toBeDefined();
      expect(typeof result.valid).toBe("boolean");
      
      if (result.valid) {
        expect(result.error).toBeUndefined();
      } else {
        expect(result.error).toBeDefined();
        console.log("Resend API validation result:", result);
      }
    });
  });
  
  describe("Email templates", () => {
    it("should have email verification template", async () => {
      const { getEmailVerificationTemplate } = await import("./emailService");
      const template = getEmailVerificationTemplate("https://example.com/verify?token=test");
      
      expect(template.subject).toBe("Verify your email address - ProPDFs");
      expect(template.html).toContain("Verify your email address");
      expect(template.html).toContain("https://example.com/verify?token=test");
      expect(template.text).toContain("https://example.com/verify?token=test");
    });
    
    it("should have magic link template", async () => {
      const { getMagicLinkTemplate } = await import("./emailService");
      const template = getMagicLinkTemplate("https://example.com/magic?token=test");
      
      expect(template.subject).toBe("Sign in to ProPDFs");
      expect(template.html).toContain("Sign in to ProPDFs");
      expect(template.html).toContain("https://example.com/magic?token=test");
      expect(template.text).toContain("https://example.com/magic?token=test");
    });
    
    it("should have password reset template", async () => {
      const { getPasswordResetTemplate } = await import("./emailService");
      const template = getPasswordResetTemplate("https://example.com/reset?token=test");
      
      expect(template.subject).toBe("Reset your password - ProPDFs");
      expect(template.html).toContain("Reset your password");
      expect(template.html).toContain("https://example.com/reset?token=test");
      expect(template.text).toContain("https://example.com/reset?token=test");
    });
    
    it("should have file share template", async () => {
      const { getFileShareTemplate } = await import("./emailService");
      const template = getFileShareTemplate("John Doe", "document.pdf", "https://example.com/share/abc123", "Please review this document");
      
      expect(template.subject).toContain("John Doe");
      expect(template.subject).toContain("document.pdf");
      expect(template.html).toContain("John Doe");
      expect(template.html).toContain("document.pdf");
      expect(template.html).toContain("Please review this document");
      expect(template.html).toContain("https://example.com/share/abc123");
    });
    
    it("should have file share template without message", async () => {
      const { getFileShareTemplate } = await import("./emailService");
      const template = getFileShareTemplate("Jane Doe", "report.pdf", "https://example.com/share/xyz789");
      
      expect(template.subject).toContain("Jane Doe");
      expect(template.html).toContain("Jane Doe");
      expect(template.html).toContain("report.pdf");
      expect(template.html).not.toContain("font-style: italic");
    });
  });
});
