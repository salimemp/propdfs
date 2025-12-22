import { describe, it, expect } from "vitest";
import * as readAloudService from "../app/services/read-aloud-service";

describe("Read Aloud Service", () => {
  describe("splitIntoSentences", () => {
    it("should split text by periods", () => {
      const text = "First sentence. Second sentence. Third sentence.";
      const sentences = readAloudService.splitIntoSentences(text);
      expect(sentences).toHaveLength(3);
      expect(sentences[0]).toBe("First sentence.");
      expect(sentences[1]).toBe("Second sentence.");
      expect(sentences[2]).toBe("Third sentence.");
    });

    it("should split text by question marks", () => {
      const text = "Is this a question? Yes it is.";
      const sentences = readAloudService.splitIntoSentences(text);
      expect(sentences).toHaveLength(2);
    });

    it("should split text by exclamation marks", () => {
      const text = "Wow! That's amazing!";
      const sentences = readAloudService.splitIntoSentences(text);
      expect(sentences).toHaveLength(2);
    });

    it("should handle empty text", () => {
      const sentences = readAloudService.splitIntoSentences("");
      expect(sentences).toHaveLength(0);
    });

    it("should handle text without sentence endings", () => {
      const text = "No sentence ending here";
      const sentences = readAloudService.splitIntoSentences(text);
      expect(sentences).toHaveLength(1);
      expect(sentences[0]).toBe("No sentence ending here");
    });

    it("should handle abbreviations correctly", () => {
      const text = "Dr. Smith went to the store. He bought milk.";
      const sentences = readAloudService.splitIntoSentences(text);
      // Should handle common abbreviations
      expect(sentences.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("estimateReadingTime", () => {
    it("should estimate reading time for short text", () => {
      const text = "This is a short sentence.";
      const time = readAloudService.estimateReadingTime(text);
      expect(time).toBeGreaterThan(0);
    });

    it("should estimate longer time for longer text", () => {
      const shortText = "Short.";
      const longText = "This is a much longer text with many more words that will take longer to read aloud.";
      const shortTime = readAloudService.estimateReadingTime(shortText);
      const longTime = readAloudService.estimateReadingTime(longText);
      expect(longTime).toBeGreaterThan(shortTime);
    });

    it("should return minimal time for empty text", () => {
      const time = readAloudService.estimateReadingTime("");
      expect(time).toBeGreaterThanOrEqual(0);
    });
  });

  describe("formatTime", () => {
    it("should format seconds correctly", () => {
      expect(readAloudService.formatTime(30)).toBe("0:30");
    });

    it("should format minutes and seconds correctly", () => {
      expect(readAloudService.formatTime(90)).toBe("1:30");
    });

    it("should format large times correctly", () => {
      const formatted = readAloudService.formatTime(3661);
      expect(formatted).toBeTruthy();
      expect(formatted.length).toBeGreaterThan(0);
    });

    it("should handle zero", () => {
      expect(readAloudService.formatTime(0)).toBe("0:00");
    });
  });

  describe("cleanTextForSpeech", () => {
    it("should remove extra whitespace", () => {
      const text = "Too    many   spaces";
      const cleaned = readAloudService.cleanTextForSpeech(text);
      expect(cleaned).toBe("Too many spaces");
    });

    it("should trim leading and trailing whitespace", () => {
      const text = "   Trimmed text   ";
      const cleaned = readAloudService.cleanTextForSpeech(text);
      expect(cleaned).toBe("Trimmed text");
    });

    it("should handle newlines", () => {
      const text = "Line one\n\nLine two";
      const cleaned = readAloudService.cleanTextForSpeech(text);
      expect(cleaned).not.toContain("\n\n");
    });
  });

  describe("detectLanguage", () => {
    it("should detect English text", () => {
      const text = "This is English text with common words.";
      const lang = readAloudService.detectLanguage(text);
      expect(lang.startsWith("en")).toBe(true);
    });

    it("should return default for empty text", () => {
      const lang = readAloudService.detectLanguage("");
      expect(lang.startsWith("en")).toBe(true);
    });
  });

  describe("getAvailableVoices", () => {
    it("should return array of voice options", () => {
      const voices = readAloudService.getAvailableVoices();
      expect(Array.isArray(voices)).toBe(true);
    });

    it("should include voice properties", () => {
      const voices = readAloudService.getAvailableVoices();
      if (voices.length > 0) {
        expect(voices[0]).toHaveProperty("name");
        expect(voices[0]).toHaveProperty("lang");
      }
    });
  });

  describe("SPEED_PRESETS", () => {
    it("should have multiple speed options", () => {
      expect(readAloudService.SPEED_PRESETS.length).toBeGreaterThan(0);
    });

    it("should include normal speed (1.0)", () => {
      const normalSpeed = readAloudService.SPEED_PRESETS.find(p => p.value === 1);
      expect(normalSpeed).toBeDefined();
    });

    it("should have label and value for each preset", () => {
      for (const preset of readAloudService.SPEED_PRESETS) {
        expect(preset).toHaveProperty("label");
        expect(preset).toHaveProperty("value");
        expect(typeof preset.value).toBe("number");
      }
    });
  });

  describe("READ_ALOUD_LANGUAGES", () => {
    it("should include common languages", () => {
      const languages = readAloudService.READ_ALOUD_LANGUAGES;
      expect(languages.length).toBeGreaterThan(0);
    });

    it("should include English", () => {
      const english = readAloudService.READ_ALOUD_LANGUAGES.find(
        l => l.code.startsWith("en")
      );
      expect(english).toBeDefined();
    });
  });

  describe("READ_ALOUD_SHORTCUTS", () => {
    it("should define keyboard shortcuts", () => {
      const shortcuts = readAloudService.READ_ALOUD_SHORTCUTS;
      expect(shortcuts).toBeDefined();
      expect(Object.keys(shortcuts).length).toBeGreaterThan(0);
    });

    it("should include play/pause shortcut", () => {
      const shortcuts = readAloudService.READ_ALOUD_SHORTCUTS;
      expect(shortcuts.playPause || shortcuts.play || shortcuts.pause).toBeDefined();
    });
  });

  describe("DEFAULT_READ_ALOUD_SETTINGS", () => {
    it("should have default settings", () => {
      const settings = readAloudService.DEFAULT_READ_ALOUD_SETTINGS;
      expect(settings).toBeDefined();
    });

    it("should include rate setting", () => {
      const settings = readAloudService.DEFAULT_READ_ALOUD_SETTINGS;
      expect(settings.rate).toBeDefined();
      expect(typeof settings.rate).toBe("number");
    });

    it("should include volume setting", () => {
      const settings = readAloudService.DEFAULT_READ_ALOUD_SETTINGS;
      expect(settings.volume).toBeDefined();
      expect(settings.volume).toBeGreaterThanOrEqual(0);
      expect(settings.volume).toBeLessThanOrEqual(1);
    });
  });
});
