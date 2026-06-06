import { describe, it, expect } from "vitest";
import { sanitizeFileName, formatContentDisposition } from "./sanitize-filename";

describe("sanitize-filename", () => {
  describe("sanitizeFileName", () => {
    it("should remove unsafe filesystem characters", () => {
      const input = "test/file\\name:*.txt";
      const result = sanitizeFileName(input);
      expect(result).toBe("test_file_name_.txt");
    });

    it("should collapse multiple consecutive underscores", () => {
      const input = "my///file.png";
      const result = sanitizeFileName(input);
      expect(result).toBe("my_file.png");
    });

    it("should trim leading and trailing underscores", () => {
      const input = "/file/";
      const result = sanitizeFileName(input);
      expect(result).toBe("file");
    });

    it("should return a fallback filename if input becomes empty", () => {
      const input = "///";
      const result = sanitizeFileName(input);
      expect(result).toMatch(/^file_\d+$/);
    });

    it("should preserve valid Unicode characters", () => {
      const input = "mañana_cómplice.pdf";
      const result = sanitizeFileName(input);
      expect(result).toBe("mañana_cómplice.pdf");
    });

    it("should truncate long filenames to 200 characters", () => {
      const input = "a".repeat(250) + ".txt";
      const result = sanitizeFileName(input);
      expect(result.length).toBe(200);
    });
  });

  describe("formatContentDisposition", () => {
    it("should format inline disposition correctly", () => {
      const result = formatContentDisposition("inline", "mañana.pdf");
      expect(result).toBe("inline; filename=\"mañana.pdf\"; filename*=UTF-8''ma%C3%B1ana.pdf");
    });

    it("should format attachment disposition correctly", () => {
      const result = formatContentDisposition("attachment", "document/test.docx");
      expect(result).toBe("attachment; filename=\"document_test.docx\"; filename*=UTF-8''document_test.docx");
    });
  });
});
