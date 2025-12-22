import { describe, it, expect } from "vitest";
import * as ocrService from "./ocrService";

describe("OCR Service", () => {
  describe("classifyDocument", () => {
    it("should classify invoice documents", () => {
      const text = "Invoice Number: INV-12345\nBill To: John Doe\nTotal Amount: $500.00\nDue Date: 2024-01-15";
      const result = ocrService.classifyDocument(text);
      
      expect(result.type).toBe("invoice");
      expect(result.confidence).toBeGreaterThan(0);
    });

    it("should classify receipt documents", () => {
      const text = "Receipt\nThank you for your purchase\nSubtotal: $45.00\nTax: $3.60\nTotal: $48.60";
      const result = ocrService.classifyDocument(text);
      
      expect(result.type).toBe("receipt");
      expect(result.confidence).toBeGreaterThan(0);
    });

    it("should classify form documents", () => {
      const text = "Please fill out this form\nDate of Birth: [ ]\nSignature Required\nApplicant Information";
      const result = ocrService.classifyDocument(text);
      
      expect(result.type).toBe("form");
      expect(result.confidence).toBeGreaterThan(0);
    });

    it("should classify contract documents", () => {
      const text = "Agreement between Party of the First and Party of the Second\nTerms and Conditions\nHereby agree to the following";
      const result = ocrService.classifyDocument(text);
      
      expect(result.type).toBe("contract");
      expect(result.confidence).toBeGreaterThan(0);
    });

    it("should classify letter documents", () => {
      const text = "Dear Sir,\nI am writing to inform you about...\nSincerely,\nJohn Smith";
      const result = ocrService.classifyDocument(text);
      
      expect(result.type).toBe("letter");
      expect(result.confidence).toBeGreaterThan(0);
    });

    it("should return other for unrecognized documents", () => {
      const text = "Random text without any specific pattern";
      const result = ocrService.classifyDocument(text);
      
      expect(result.type).toBe("other");
    });
  });

  describe("extractFields", () => {
    it("should extract fields from invoice", () => {
      const text = "Invoice Number: INV-12345\nDate: 01/15/2024\nTotal Amount: $1,500.00";
      const fields = ocrService.extractFields(text, "invoice");
      
      expect(fields.invoiceNumber).toBeDefined();
      expect(fields.invoiceNumber.value).toBe("INV-12345");
      expect(fields.date).toBeDefined();
      expect(fields.total).toBeDefined();
    });

    it("should extract fields from receipt", () => {
      const text = "ACME Store\n01/15/2024\nSubtotal: $45.00\nTax: $3.60\nTotal: $48.60\nPaid by: VISA";
      const fields = ocrService.extractFields(text, "receipt");
      
      expect(fields.total).toBeDefined();
      expect(fields.subtotal).toBeDefined();
      expect(fields.tax).toBeDefined();
      expect(fields.paymentMethod).toBeDefined();
    });

    it("should extract fields from form", () => {
      const text = "Full Name: John Doe\nEmail: john@example.com\nPhone: (555) 123-4567\nDate: 01/15/2024";
      const fields = ocrService.extractFields(text, "form");
      
      expect(fields.name).toBeDefined();
      expect(fields.email).toBeDefined();
      expect(fields.email.value).toBe("john@example.com");
      expect(fields.phone).toBeDefined();
    });

    it("should return empty object for unknown document type", () => {
      const text = "Some random text";
      const fields = ocrService.extractFields(text, "unknown");
      
      expect(Object.keys(fields).length).toBe(0);
    });
  });

  describe("detectLanguage", () => {
    it("should detect English", () => {
      const text = "The quick brown fox jumps over the lazy dog. This is a sample text.";
      const result = ocrService.detectLanguage(text);
      
      expect(result.primary).toBe("en");
    });

    it("should detect Spanish", () => {
      const text = "El rápido zorro marrón salta sobre el perro perezoso. Esta es una muestra de texto.";
      const result = ocrService.detectLanguage(text);
      
      expect(result.primary).toBe("es");
    });

    it("should detect French", () => {
      const text = "Le renard brun rapide saute par-dessus le chien paresseux. Ceci est un exemple de texte.";
      const result = ocrService.detectLanguage(text);
      
      expect(result.primary).toBe("fr");
    });

    it("should return multiple detected languages", () => {
      const text = "Hello world. Hola mundo. Bonjour le monde.";
      const result = ocrService.detectLanguage(text);
      
      expect(result.detected.length).toBeGreaterThan(0);
    });
  });

  describe("extractTables", () => {
    it("should extract pipe-delimited tables", () => {
      const text = "Some text\n| Name | Age | City |\n| John | 30 | NYC |\n| Jane | 25 | LA |\nMore text";
      const tables = ocrService.extractTables(text);
      
      expect(tables.length).toBeGreaterThan(0);
      expect(tables[0].type).toBe("pipe");
      expect(tables[0].headers).toContain("Name");
    });

    it("should extract tab-delimited tables", () => {
      const text = "Name\tAge\tCity\nJohn\t30\tNYC\nJane\t25\tLA";
      const tables = ocrService.extractTables(text);
      
      expect(tables.length).toBeGreaterThan(0);
      expect(tables[0].type).toBe("tab");
    });

    it("should return empty array for text without tables", () => {
      const text = "This is just regular text without any tables.";
      const tables = ocrService.extractTables(text);
      
      expect(tables.length).toBe(0);
    });
  });
});
