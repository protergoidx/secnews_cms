import { describe, expect, it } from "vitest";
import { formatRecommendations } from "../src/common/recommendations.js";
import { mergeReferences } from "../src/common/references.js";

describe("SOC Recommendations", () => {
  it("adds bullets to plain recommendation lines", () => {
    const input = [
      "Review account access.",
      "Apply approved updates.",
      "Monitor unusual authentication events.",
    ].join("\n");

    expect(formatRecommendations(input)).toBe(
      [
        "- Review account access.",
        "- Apply approved updates.",
        "- Monitor unusual authentication events.",
      ].join("\n"),
    );
  });

  it("normalizes existing bullets and numbered lists", () => {
    const input = [
      "* Review account access.",
      "- Apply approved updates.",
      "• Monitor authentication events.",
      "1. Review exposed services.",
      "2) Check application logs.",
    ].join("\n");

    expect(formatRecommendations(input)).toBe(
      [
        "- Review account access.",
        "- Apply approved updates.",
        "- Monitor authentication events.",
        "- Review exposed services.",
        "- Check application logs.",
      ].join("\n"),
    );
  });

  it("does not duplicate bullets when formatted again", () => {
    const original = [
      "- Review account access.",
      "- Apply approved updates.",
    ].join("\n");

    expect(
      formatRecommendations(
        formatRecommendations(original),
      ),
    ).toBe(original);
  });

  it("ignores blank lines and empty bullets", () => {
    expect(
      formatRecommendations(
        "\r\n- \r\n* \r\nReview access.\r\n\r\n",
      ),
    ).toBe("- Review access.");
  });

  it("handles missing content", () => {
    expect(formatRecommendations(null)).toBe("");
    expect(formatRecommendations(undefined)).toBe("");
    expect(formatRecommendations("")).toBe("");
  });

  it("preserves multiple sentences on the same line", () => {
    expect(
      formatRecommendations(
        "Apply approved updates. Restart after approval.",
      ),
    ).toBe(
      "- Apply approved updates. Restart after approval.",
    );
  });
});

describe("SOC References", () => {
  it("keeps existing references and appends new ones", () => {
    const existing = [
      "https://example.com/original",
    ];

    const result = mergeReferences(
      existing,
      "https://example.com/additional",
    );

    expect(result).toEqual([
      "https://example.com/original",
      "https://example.com/additional",
    ]);

    // The helper must not mutate the original array.
    expect(existing).toEqual([
      "https://example.com/original",
    ]);
  });

  it("removes duplicate links", () => {
    expect(
      mergeReferences(
        ["https://example.com/original"],
        [
          "https://example.com/original",
          "https://example.com/additional",
          "https://example.com/additional",
        ].join("\n"),
      ),
    ).toEqual([
      "https://example.com/original",
      "https://example.com/additional",
    ]);
  });

  it("supports bullet and Markdown URL formats", () => {
    expect(
      mergeReferences(
        [],
        [
          "- https://example.com/a",
          "1. https://example.com/b",
          "[Vendor advisory](https://example.com/c)",
          "<https://example.com/d>",
        ].join("\n"),
      ),
    ).toEqual([
      "https://example.com/a",
      "https://example.com/b",
      "https://example.com/c",
      "https://example.com/d",
    ]);
  });

  it("treats fragments of the same page as duplicates", () => {
    expect(
      mergeReferences(
        ["https://example.com/advisory#overview"],
        "https://example.com/advisory#mitigation",
      ),
    ).toEqual([
      "https://example.com/advisory#overview",
    ]);
  });

  it("preserves different URL paths and query values", () => {
    expect(
      mergeReferences(
        ["https://example.com/Report?id=1"],
        [
          "https://example.com/report?id=1",
          "https://example.com/Report?id=2",
        ].join("\n"),
      ),
    ).toHaveLength(3);
  });

  it("rejects non-HTTP URLs", () => {
    expect(() =>
      mergeReferences(
        [],
        "javascript:alert(1)",
      ),
    ).toThrow();
  });

  it("rejects URLs containing credentials", () => {
    expect(() =>
      mergeReferences(
        [],
        "https://user:password@example.com/report",
      ),
    ).toThrow();
  });

  it("rejects explanatory text instead of saving it as a link", () => {
    expect(() =>
      mergeReferences(
        ["https://example.com/original"],
        [
          "References:",
          "https://example.com/additional",
        ].join("\n"),
      ),
    ).toThrow();
  });

  it("keeps existing references when suggestions are empty", () => {
    expect(
      mergeReferences(
        ["https://example.com/original"],
        "\n\n",
      ),
    ).toEqual([
      "https://example.com/original",
    ]);
  });
});