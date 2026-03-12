type SchemaReview = {
  summary: string;
  risks: string[];
  suggestions: string[];
};

type SchemaReviewDeps = {
  reviewSchema: (schema: unknown) => Promise<SchemaReview>;
};

const SCHEMA_REVIEW_PROMPT = `You are reviewing a JSON Schema that will be sent to Gemini for structured discussion analysis.

Return only valid JSON with this exact shape:
{
  "summary": "string",
  "risks": ["string"],
  "suggestions": ["string"]
}

Focus on:
- schema clarity
- missing required fields
- ambiguous field naming
- whether the schema is suitable for AI structured output
- practical improvements for reliability`;

export function normalizeSchemaReviewResponse(payload: unknown): SchemaReview {
  const review = payload as Partial<SchemaReview> | null;

  if (
    !review ||
    typeof review.summary !== "string" ||
    !Array.isArray(review.risks) ||
    !Array.isArray(review.suggestions) ||
    !review.risks.every((item) => typeof item === "string") ||
    !review.suggestions.every((item) => typeof item === "string")
  ) {
    throw new Error("Gemini returned an invalid schema review payload.");
  }

  return {
    summary: review.summary,
    risks: review.risks,
    suggestions: review.suggestions
  };
}

export async function reviewSchemaWithGemini(schema: unknown): Promise<SchemaReview> {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing GOOGLE_API_KEY or GEMINI_API_KEY.");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: SCHEMA_REVIEW_PROMPT }]
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: JSON.stringify(
                  {
                    schema
                  },
                  null,
                  2
                )
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json"
        }
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini schema review failed with status ${response.status}.`);
  }

  const payload = await response.json();
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("Gemini did not return schema review content.");
  }

  return normalizeSchemaReviewResponse(JSON.parse(text));
}

export async function handleSchemaReviewRequest(
  request: Request,
  deps: SchemaReviewDeps
) {
  try {
    const body = await request.json();

    if (!body?.schema || typeof body.schema !== "object") {
      return Response.json(
        {
          ok: false,
          error: "A JSON schema payload is required."
        },
        { status: 400 }
      );
    }

    const review = normalizeSchemaReviewResponse(await deps.reviewSchema(body.schema));

    return Response.json({
      ok: true,
      review
    });
  } catch (error: any) {
    return Response.json(
      {
        ok: false,
        error: error?.message ?? "Schema review failed."
      },
      { status: 502 }
    );
  }
}
