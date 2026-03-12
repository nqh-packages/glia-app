"use node";

import { GoogleGenAI } from "@google/genai";
import { actionGeneric } from "convex/server";
import { v } from "convex/values";

import {
  ANALYSIS_MODEL,
  clampPercentage,
  clampSupportScore,
  getAnalysisSnapshotRef,
  saveAnalysisResultRef,
  toBase64
} from "./lib";
import { ANALYSIS_SYSTEM_PROMPT } from "./prompts";

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
      responses: snapshot.opinions.map((opinion: any) => {
        if (!anonymizedParticipants.has(opinion.participantId)) {
          anonymizedParticipants.set(opinion.participantId, `Participant ${participantNumber}`);
          participantNumber += 1;
        }

        return {
          response_id: String(opinion.opinionId),
          participant: anonymizedParticipants.get(opinion.participantId),
          choice: opinion.choice,
          reason: opinion.reason,
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

function normalizeResponseChoice(choice: unknown) {
  if (choice === "yes" || choice === "neutral" || choice === "no") {
    return choice;
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

  const responses = Array.isArray(payload.responses) ? payload.responses : [];
  const camps = Array.isArray(payload.camps) ? payload.camps : [];
  const keyThemes = Array.isArray(payload?.spectrum?.key_themes)
    ? payload.spectrum.key_themes
    : [];
  const addresses = Array.isArray(payload?.compromise?.addresses)
    ? payload.compromise.addresses
    : [];

  const yesCount = responses.filter((response) => response.choice === "yes").length;
  const neutralCount = responses.filter((response) => response.choice === "neutral").length;
  const noCount = responses.filter((response) => response.choice === "no").length;
  const denominator = responses.length || 1;

  return {
    topic: String(payload.topic ?? ""),
    total_responses: Number(payload.total_responses ?? responses.length),
    responses: responses.map((response: any) => ({
      response_id: String(response.response_id ?? ""),
      participant: String(response.participant ?? ""),
      summary: String(response.summary ?? ""),
      choice: normalizeResponseChoice(response.choice),
      support_score: clampSupportScore(Number(response.support_score ?? 0)),
      yes_count: Number(response.yes_count ?? 0),
      neutral_count: Number(response.neutral_count ?? 0),
      no_count: Number(response.no_count ?? 0)
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
      yes_percentage: clampPercentage(
        Number(payload?.spectrum?.yes_percentage ?? (yesCount / denominator) * 100)
      ),
      neutral_percentage: clampPercentage(
        Number(payload?.spectrum?.neutral_percentage ?? (neutralCount / denominator) * 100)
      ),
      no_percentage: clampPercentage(
        Number(payload?.spectrum?.no_percentage ?? (noCount / denominator) * 100)
      ),
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
        error: "At least one participant response is required before analysis."
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
            text: `Attachment for response ${String(opinion.opinionId)} by ${opinion.participantName}.`
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
          systemInstruction: ANALYSIS_SYSTEM_PROMPT,
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
