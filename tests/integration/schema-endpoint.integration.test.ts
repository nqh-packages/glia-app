import { describe, expect, it, vi } from "vitest";

import { handleSchemaReviewRequest } from "../../convex/schemaReview";

describe("handleSchemaReviewRequest", () => {
  it("returns a structured Gemini review for a posted JSON schema", async () => {
    const schema = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      title: "SecurityGuardProposal",
      type: "object",
      properties: {
        wantsMoreSecurity: { type: "boolean" }
      },
      required: ["wantsMoreSecurity"]
    };

    const reviewSchema = vi.fn().mockResolvedValue({
      summary: "The schema is valid for a yes/no proposal input.",
      risks: ["Boolean-only input may miss reasoning unless paired with comments."],
      suggestions: ["Add an optional free-text rationale field."]
    });

    const response = await handleSchemaReviewRequest(
      new Request("http://localhost/api/schema/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schema })
      }),
      { reviewSchema }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      review: {
        summary: "The schema is valid for a yes/no proposal input.",
        risks: ["Boolean-only input may miss reasoning unless paired with comments."],
        suggestions: ["Add an optional free-text rationale field."]
      }
    });
    expect(reviewSchema).toHaveBeenCalledWith(schema);
  });

  it("rejects a request without a schema payload", async () => {
    const reviewSchema = vi.fn();

    const response = await handleSchemaReviewRequest(
      new Request("http://localhost/api/schema/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      }),
      { reviewSchema }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "A JSON schema payload is required."
    });
    expect(reviewSchema).not.toHaveBeenCalled();
  });

  it("returns a gateway-style error when Gemini review fails", async () => {
    const schema = {
      type: "object",
      properties: { vote: { type: "string" } }
    };

    const reviewSchema = vi.fn().mockRejectedValue(new Error("Gemini unavailable"));

    const response = await handleSchemaReviewRequest(
      new Request("http://localhost/api/schema/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schema })
      }),
      { reviewSchema }
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Gemini unavailable"
    });
  });
});
