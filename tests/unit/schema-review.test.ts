import { describe, expect, it } from "vitest";

import { normalizeSchemaReviewResponse } from "../../convex/schemaReview";

describe("normalizeSchemaReviewResponse", () => {
  it("normalizes a valid Gemini review payload", () => {
    expect(
      normalizeSchemaReviewResponse({
        summary: "Looks good.",
        risks: ["Missing examples"],
        suggestions: ["Add sample payloads"]
      })
    ).toEqual({
      summary: "Looks good.",
      risks: ["Missing examples"],
      suggestions: ["Add sample payloads"]
    });
  });

  it("throws when Gemini returns a malformed review payload", () => {
    expect(() =>
      normalizeSchemaReviewResponse({
        summary: 42,
        risks: "Missing examples",
        suggestions: null
      })
    ).toThrow("Gemini returned an invalid schema review payload.");
  });
});
