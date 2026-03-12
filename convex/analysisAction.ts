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

const SYSTEM_PROMPT = `You are Glia, an AI mediator for shared discussion rooms.

You receive:
- one room topic / initial statement
- participant responses to that statement
- each response includes the participant's declared choice: yes / neutral / no
- secondary reaction counts for yes / neutral / no on each response
- optional reaction reasons
- optional image attachments

Return only valid JSON.

Requirements:
1. Do not change a participant's declared choice. Use it as the source of truth for whether they answered yes, neutral, or no to the main statement.
2. Summarize each response briefly.
3. Assign every response an integer support_score from 0 to 100.
4. support_score means how much support or resonance that response appears to have after considering the response itself plus secondary reaction signals. 0 means almost no support, 50 means mixed or unclear support, and 100 means the strongest support in the room.
5. Identify 2-4 response camps when meaningful.
6. Explain each camp's position and key reasons.
7. Use secondary reaction signals as support weighting, not as ground truth.
8. Produce a yes / neutral / no spectrum and key themes.
9. Propose a practical compromise grounded in what participants actually said.
10. Keep names anonymized as "Participant 1", "Participant 2", etc.
11. If there is not enough information, still return the best structured answer you can.

Return this shape exactly:
{
  "topic": "string",
  "total_responses": 0,
  "responses": [
    {
      "response_id": "string",
      "participant": "string",
      "summary": "string",
      "choice": "yes | neutral | no",
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
    "yes_percentage": 0,
    "neutral_percentage": 0,
    "no_percentage": 0,
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
