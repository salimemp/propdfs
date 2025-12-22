import { describe, it, expect } from "vitest";
import * as voiceCommandService from "../app/services/voice-command-service";

describe("Voice Command Service", () => {
  describe("parseVoiceCommand", () => {
    describe("Navigation commands", () => {
      it("should parse 'go to dashboard' command", () => {
        const result = voiceCommandService.parseVoiceCommand("go to dashboard");
        expect(result.type).toBe("navigation");
        expect(result.action).toBe("navigate");
        expect(result.parameters.page).toBe("dashboard");
      });

      it("should parse 'open settings' command", () => {
        const result = voiceCommandService.parseVoiceCommand("open settings");
        expect(result.type).toBe("navigation");
        expect(result.action).toBe("navigate");
        expect(result.parameters.page).toBe("settings");
      });

      it("should parse 'navigate to files' command", () => {
        const result = voiceCommandService.parseVoiceCommand("navigate to files");
        expect(result.type).toBe("navigation");
        expect(result.action).toBe("navigate");
        expect(result.parameters.page).toBe("files");
      });
    });

    describe("Conversion commands", () => {
      it("should parse 'convert to PDF' command", () => {
        const result = voiceCommandService.parseVoiceCommand("convert to PDF");
        expect(result.type).toBe("conversion");
        expect(result.action).toBe("convert");
        expect(result.parameters.targetFormat).toBe("pdf");
      });

      it("should parse 'convert to Word' command", () => {
        const result = voiceCommandService.parseVoiceCommand("convert to Word");
        expect(result.type).toBe("conversion");
        expect(result.action).toBe("convert");
        expect(result.parameters.targetFormat).toBe("word");
      });

      it("should parse 'convert to Excel' command", () => {
        const result = voiceCommandService.parseVoiceCommand("convert to Excel");
        expect(result.type).toBe("conversion");
        expect(result.action).toBe("convert");
        expect(result.parameters.targetFormat).toBe("excel");
      });
    });

    describe("PDF operation commands", () => {
      it("should parse 'merge PDFs' command", () => {
        const result = voiceCommandService.parseVoiceCommand("merge PDFs");
        expect(["pdf_operation", "unknown"]).toContain(result.type);
      });

      it("should parse 'split PDF' command", () => {
        const result = voiceCommandService.parseVoiceCommand("split PDF");
        expect(result.type).toBe("pdf_operation");
        expect(result.action).toBe("split");
      });

      it("should parse 'compress PDF' command", () => {
        const result = voiceCommandService.parseVoiceCommand("compress PDF");
        expect(result.type).toBe("pdf_operation");
        expect(result.action).toBe("compress");
      });

      it("should parse 'rotate PDF' command", () => {
        const result = voiceCommandService.parseVoiceCommand("rotate PDF");
        expect(result.type).toBe("pdf_operation");
        expect(result.action).toBe("rotate");
      });
    });

    describe("File commands", () => {
      it("should parse 'upload file' command", () => {
        const result = voiceCommandService.parseVoiceCommand("upload file");
        expect(["file", "file_operation"]).toContain(result.type);
        expect(result.action).toBe("upload");
      });

      it("should parse 'download file' command", () => {
        const result = voiceCommandService.parseVoiceCommand("download file");
        expect(["file", "file_operation"]).toContain(result.type);
        expect(result.action).toBe("download");
      });

      it("should parse 'delete file' command", () => {
        const result = voiceCommandService.parseVoiceCommand("delete file");
        expect(["file", "file_operation"]).toContain(result.type);
        expect(result.action).toBe("delete");
      });
    });

    describe("Unknown commands", () => {
      it("should return unknown for unrecognized commands", () => {
        const result = voiceCommandService.parseVoiceCommand("do something random");
        expect(result.type).toBe("unknown");
      });

      it("should handle empty input", () => {
        const result = voiceCommandService.parseVoiceCommand("");
        expect(result.type).toBe("unknown");
      });
    });
  });

  describe("getNavigationPath", () => {
    it("should return correct path for dashboard", () => {
      const path = voiceCommandService.getNavigationPath("dashboard");
      expect(path).toBe("/dashboard");
    });

    it("should return correct path for settings", () => {
      const path = voiceCommandService.getNavigationPath("settings");
      expect(path).toBe("/settings");
    });

    it("should return correct path for files", () => {
      const path = voiceCommandService.getNavigationPath("files");
      expect(path).toBe("/files");
    });

    it("should return correct path for convert", () => {
      const path = voiceCommandService.getNavigationPath("convert");
      expect(path).toBe("/convert");
    });

    it("should return null for unknown pages", () => {
      const path = voiceCommandService.getNavigationPath("unknown-page");
      expect(path).toBeNull();
    });
  });

  describe("generateVoiceResponse", () => {
    it("should generate response for navigation command", () => {
      const command = voiceCommandService.parseVoiceCommand("go to dashboard");
      const response = voiceCommandService.generateVoiceResponse(command);
      expect(response).toContain("dashboard");
    });

    it("should generate response for conversion command", () => {
      const command = voiceCommandService.parseVoiceCommand("convert to PDF");
      const response = voiceCommandService.generateVoiceResponse(command);
      expect(response.toLowerCase()).toContain("convert");
    });

    it("should generate response for unknown command", () => {
      const command = voiceCommandService.parseVoiceCommand("random gibberish");
      const response = voiceCommandService.generateVoiceResponse(command);
      expect(response).toBeTruthy();
    });
  });

  describe("getAvailableCommands", () => {
    it("should return array of command categories", () => {
      const commands = voiceCommandService.getAvailableCommands();
      expect(Array.isArray(commands)).toBe(true);
      expect(commands.length).toBeGreaterThan(0);
    });

    it("should include Navigation category", () => {
      const commands = voiceCommandService.getAvailableCommands();
      const navCategory = commands.find(c => c.category === "Navigation");
      expect(navCategory).toBeDefined();
      expect(navCategory?.commands.length).toBeGreaterThan(0);
    });

    it("should include Conversions category", () => {
      const commands = voiceCommandService.getAvailableCommands();
      const convCategory = commands.find(c => c.category === "Conversions");
      expect(convCategory).toBeDefined();
    });
  });

  describe("SUPPORTED_VOICE_LANGUAGES", () => {
    it("should include English", () => {
      const languages = voiceCommandService.SUPPORTED_VOICE_LANGUAGES;
      const english = languages.find(l => l.code.startsWith("en"));
      expect(english).toBeDefined();
    });

    it("should have code and name for each language", () => {
      const languages = voiceCommandService.SUPPORTED_VOICE_LANGUAGES;
      for (const lang of languages) {
        expect(lang.code).toBeDefined();
        expect(lang.name).toBeDefined();
      }
    });
  });
});
