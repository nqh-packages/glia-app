import { makeFunctionReference } from "convex/server";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TOKEN_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export const ANALYSIS_MODEL = "gemini-2.5-flash";
export const PROMPT_VERSION = "glia-shared-room-v1";

export const runAnalysisRef = makeFunctionReference<"action">("analysisAction:runAnalysis");
export const getAnalysisSnapshotRef = makeFunctionReference<"query">("rooms:getAnalysisSnapshot");
export const startAnalysisRunRef = makeFunctionReference<"mutation">("analyses:startAnalysisRun");
export const saveAnalysisResultRef = makeFunctionReference<"mutation">("analyses:saveAnalysisResult");

export function now() {
  return Date.now();
}

export function makeCode(length = 6) {
  return makeRandomString(CODE_ALPHABET, length);
}

export function makeToken(length = 24) {
  return makeRandomString(TOKEN_ALPHABET, length);
}

function makeRandomString(alphabet: string, length: number) {
  let result = "";
  for (let index = 0; index < length; index += 1) {
    result += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return result;
}

export function buildJoinUrl(origin: string, code: string) {
  return `${origin.replace(/\/$/, "")}/?code=${encodeURIComponent(code)}`;
}

export function toBase64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64");
}

export function clampPercentage(value: number) {
  return Math.max(0, Math.min(100, value));
}
