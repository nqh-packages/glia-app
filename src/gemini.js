// Huy: Gemini API integration
// Uses Gemini 2.0 Flash — fast, cheap, multimodal

import { GEMINI_API_KEY } from '../config.js';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const SYSTEM_PROMPT = `You are Glia, a community decision analysis AI. You analyze community discussions and generate data-driven compromises.

Given a set of opinions from a community discussion, you MUST:

1. Identify the TOPIC being debated
2. Identify 2-3 distinct CAMPS (opinion groups)
3. For each camp: count supporters, extract reasons, find representative quotes
4. Calculate the SENTIMENT SPECTRUM (% for vs against)
5. Extract KEY THEMES with mention counts
6. Generate a COMPROMISE that addresses both sides' core concerns

IMPORTANT:
- Be specific in the compromise — include concrete numbers, timelines, conditions
- The compromise must acknowledge BOTH sides' valid concerns
- If input is chaotic/messy, do your best to extract signal from noise
- Anonymize any real names as "Person 1", "Person 2", etc.

You MUST respond with ONLY valid JSON matching this exact structure:
{
  "topic": "string",
  "total_opinions": number,
  "camps": [
    {
      "label": "string",
      "position": "string",
      "supporter_count": number,
      "reasons": ["string"],
      "sentiment": "strongly_for" | "for" | "neutral" | "against" | "strongly_against",
      "representative_quotes": ["string"]
    }
  ],
  "spectrum": {
    "for_percentage": number,
    "against_percentage": number,
    "neutral_percentage": number,
    "key_themes": [{ "theme": "string", "mention_count": number }]
  },
  "compromise": {
    "summary": "string",
    "details": "string",
    "addresses": [{ "camp": "string", "how_addressed": "string" }]
  }
}

Respond with ONLY the JSON. No markdown, no explanation, no code fences.`;

/**
 * Send parsed entries to Gemini and get structured analysis back.
 * @param {{ entries: Array<{ content: string, type: string }>, topic?: string }} input
 * @returns {Promise<object>} GliaOutput JSON
 */
export async function analyzeWithGemini(input) {
  const userMessage = input.entries.map((e, i) => `[${e.type}] ${e.content}`).join('\n\n');

  const body = {
    system_instruction: {
      parts: [{ text: SYSTEM_PROMPT }]
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: userMessage }]
      }
    ],
    generationConfig: {
      temperature: 0.3,
      responseMimeType: 'application/json'
    }
  };

  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error('No response from Gemini');
  }

  return JSON.parse(text);
}
