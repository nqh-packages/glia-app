"use node";

import { GoogleGenAI } from "@google/genai";
import { actionGeneric } from "convex/server";
import { v } from "convex/values";

import {
  ANALYSIS_MODEL,
  clampPercentage,
  getAnalysisSnapshotRef,
  saveAnalysisResultRef,
  toBase64
} from "./lib";

const SYSTEM_PROMPT = `You are Glia, an AI mediator for shared discussion rooms.

You receive:
- one room topic / initial statement
- participant opinions
- reaction counts for yes / neutral / no
- optional reaction reasons
- optional image attachments

Return only valid JSON.

Requirements:
1. Classify each opinion as one of: positive, negative, neutral, mixed.
2. Identify 2-4 opinion camps when meaningful.
3. Explain each camp's position and key reasons.
4. Use reaction signals as support weighting, not as ground truth.
5. Produce a sentiment spectrum and key themes.
6. Propose a practical compromise grounded in what participants actually said.
7. Keep names anonymized as "Participant 1", "Participant 2", etc.
8. If there is not enough information, still return the best structured answer you can.

Return this shape exactly:
{
  "topic": "string",
  "total_opinions": 0,
  "opinions": [
    {
      "opinion_id": "string",
      "participant": "string",
      "summary": "string",
      "sentiment": "positive | negative | neutral | mixed",
      "support_score": 0,
      "yes_count": 0,
      "neutral_count": 0,
      "no_count": 0
    }
  ],
  "camps": [
    {
      "label": "string",
      "position": "string",
      "supporter_count": 0,
      "reasons": ["string"],
      "sentiment": "strongly_for | for | neutral | against | strongly_against",
      "representative_quotes": ["string"]
    }
  ],
  "spectrum": {
    "positive_percentage": 0,
    "negative_percentage": 0,
    "neutral_percentage": 0,
    "mixed_percentage": 0,
    "for_percentage": 0,
    "against_percentage": 0,
    "key_themes": [
      { "theme": "string", "mention_count": 0 }
    ]
  },
  "compromise": {
    "summary": "string",
    "details": "string",
    "addresses": [
      { "camp": "string", "how_addressed": "string" }
    ]
  }
}`;

function buildPrompt(snapshot: any) {
  const anonymizedParticipants = new Map<string, string>();
  let participantNumber = 1;

  return JSON.stringify(
    {
      room: {
        code: snapshot.room.code,
        topic: snapshot.room.topic,
        description: snapshot.room.description,
        language: snapshot.room.language,
        participantCount: snapshot.participantCount
      },
      opinions: snapshot.opinions.map((opinion: any) => {
        if (!anonymizedParticipants.has(opinion.participantId)) {
          anonymizedParticipants.set(opinion.participantId, `Participant ${participantNumber}`);
          participantNumber += 1;
        }

        return {
          opinion_id: String(opinion.opinionId),
          participant: anonymizedParticipants.get(opinion.participantId),
          text: opinion.text,
          yes_count: opinion.yesCount,
          neutral_count: opinion.neutralCount,
          no_count: opinion.noCount,
          reaction_reasons: opinion.reactionReasons,
          attachment_count: opinion.attachments.length
        };
      })
    },
    null,
    2
  );
}

function normalizeOpinionSentiment(sentiment: unknown) {
  if (
    sentiment === "positive" ||
    sentiment === "negative" ||
    sentiment === "neutral" ||
    sentiment === "mixed"
  ) {
    return sentiment;
  }
  return "neutral";
}

function normalizeCampSentiment(sentiment: unknown) {
  if (
    sentiment === "strongly_for" ||
    sentiment === "for" ||
    sentiment === "neutral" ||
    sentiment === "against" ||
    sentiment === "strongly_against"
  ) {
    return sentiment;
  }
  return "neutral";
}

function validateAnalysisOutput(payload: any) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Gemini returned an invalid payload.");
  }

  const opinions = Array.isArray(payload.opinions) ? payload.opinions : [];
  const camps = Array.isArray(payload.camps) ? payload.camps : [];
  const keyThemes = Array.isArray(payload?.spectrum?.key_themes)
    ? payload.spectrum.key_themes
    : [];
  const addresses = Array.isArray(payload?.compromise?.addresses)
    ? payload.compromise.addresses
    : [];

  const positiveCount = opinions.filter((opinion) => opinion.sentiment === "positive").length;
  const negativeCount = opinions.filter((opinion) => opinion.sentiment === "negative").length;
  const neutralCount = opinions.filter((opinion) => opinion.sentiment === "neutral").length;
  const mixedCount = opinions.filter((opinion) => opinion.sentiment === "mixed").length;
  const denominator = opinions.length || 1;

  return {
    topic: String(payload.topic ?? ""),
    total_opinions: Number(payload.total_opinions ?? opinions.length),
    opinions: opinions.map((opinion: any) => ({
      opinion_id: String(opinion.opinion_id ?? ""),
      participant: String(opinion.participant ?? ""),
      summary: String(opinion.summary ?? ""),
      sentiment: normalizeOpinionSentiment(opinion.sentiment),
      support_score: Number(opinion.support_score ?? 0),
      yes_count: Number(opinion.yes_count ?? 0),
      neutral_count: Number(opinion.neutral_count ?? 0),
      no_count: Number(opinion.no_count ?? 0)
    })),
    camps: camps.map((camp: any) => ({
      label: String(camp.label ?? ""),
      position: String(camp.position ?? ""),
      supporter_count: Number(camp.supporter_count ?? 0),
      reasons: Array.isArray(camp.reasons) ? camp.reasons.map(String) : [],
      sentiment: normalizeCampSentiment(camp.sentiment),
      representative_quotes: Array.isArray(camp.representative_quotes)
        ? camp.representative_quotes.map(String)
        : []
    })),
    spectrum: {
      positive_percentage: clampPercentage(
        Number(payload?.spectrum?.positive_percentage ?? (positiveCount / denominator) * 100)
      ),
      negative_percentage: clampPercentage(
        Number(payload?.spectrum?.negative_percentage ?? (negativeCount / denominator) * 100)
      ),
      neutral_percentage: clampPercentage(
        Number(payload?.spectrum?.neutral_percentage ?? (neutralCount / denominator) * 100)
      ),
      mixed_percentage: clampPercentage(
        Number(payload?.spectrum?.mixed_percentage ?? (mixedCount / denominator) * 100)
      ),
      for_percentage: clampPercentage(Number(payload?.spectrum?.for_percentage ?? 0)),
      against_percentage: clampPercentage(Number(payload?.spectrum?.against_percentage ?? 0)),
      key_themes: keyThemes.map((theme: any) => ({
        theme: String(theme.theme ?? ""),
        mention_count: Number(theme.mention_count ?? 0)
      }))
    },
    compromise: {
      summary: String(payload?.compromise?.summary ?? ""),
      details: String(payload?.compromise?.details ?? ""),
      addresses: addresses.map((address: any) => ({
        camp: String(address.camp ?? ""),
        how_addressed: String(address.how_addressed ?? "")
      }))
    }
  };
}

export const runAnalysis = actionGeneric({
  args: {
    roomId: v.id("rooms"),
    trigger: v.union(v.literal("manual"), v.literal("autoCount"), v.literal("autoTimer")),
    requestVersion: v.number(),
    analysisId: v.id("analyses")
  },
  handler: async (ctx, args) => {
    const snapshot = await ctx.runQuery(getAnalysisSnapshotRef as any, { roomId: args.roomId });

    if (!snapshot) {
      await ctx.runMutation(saveAnalysisResultRef as any, {
        roomId: args.roomId,
        analysisId: args.analysisId,
        status: "failed",
        error: "Room snapshot could not be loaded."
      });
      return { ok: false };
    }

    if (snapshot.room.analysisRequestVersion !== args.requestVersion) {
      return { skipped: true };
    }

    if (!snapshot.opinions.length) {
      await ctx.runMutation(saveAnalysisResultRef as any, {
        roomId: args.roomId,
        analysisId: args.analysisId,
        status: "failed",
        error: "At least one opinion is required before analysis."
      });
      return { ok: false };
    }

    try {
      const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("Missing GOOGLE_API_KEY or GEMINI_API_KEY.");
      }

      const ai = new GoogleGenAI({ apiKey });
      const parts: any[] = [{ text: buildPrompt(snapshot) }];

      for (const opinion of snapshot.opinions) {
        for (const attachment of opinion.attachments) {
          const blob = await ctx.storage.get(attachment.storageId);
          if (!blob || !attachment.contentType?.startsWith("image/")) {
            continue;
          }

          const bytes = new Uint8Array(await blob.arrayBuffer());
          parts.push({
            text: `Attachment for opinion ${String(opinion.opinionId)} by ${opinion.participantName}.`
          });
          parts.push({
            inlineData: {
              mimeType: attachment.contentType,
              data: toBase64(bytes)
            }
          });
        }
      }

      const response = await ai.models.generateContent({
        model: ANALYSIS_MODEL,
        contents: [{ role: "user", parts }],
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: "application/json",
          temperature: 0.2
        }
      });

      const parsed = JSON.parse(response.text ?? "{}");
      const output = validateAnalysisOutput(parsed);

      await ctx.runMutation(saveAnalysisResultRef as any, {
        roomId: args.roomId,
        analysisId: args.analysisId,
        status: "success",
        inputSnapshot: snapshot,
        output
      });

      return { ok: true };
    } catch (error: any) {
      await ctx.runMutation(saveAnalysisResultRef as any, {
        roomId: args.roomId,
        analysisId: args.analysisId,
        status: "failed",
        inputSnapshot: snapshot,
        error: error?.message ?? "Analysis failed."
      });
      return { ok: false, error: error?.message ?? "Analysis failed." };
    }
  }
});
