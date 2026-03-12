import { mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";

import {
  ANALYSIS_MODEL,
  PROMPT_VERSION,
  now,
  runAnalysisRef,
  startAnalysisRunRef
} from "./lib";

export const requestAnalysis = mutationGeneric({
  args: {
    roomId: v.id("rooms"),
    hostToken: v.string()
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.hostToken !== args.hostToken) {
      throw new Error("Only the host can start analysis.");
    }

    const requestVersion = room.analysisRequestVersion + 1;
    await ctx.db.patch(room._id, {
      analysisRequestVersion: requestVersion,
      updatedAt: now()
    });

    await ctx.scheduler.runAfter(0, startAnalysisRunRef, {
      roomId: room._id,
      trigger: "manual",
      requestVersion
    });

    return { ok: true, requestVersion };
  }
});

export const startAnalysisRun = mutationGeneric({
  args: {
    roomId: v.id("rooms"),
    trigger: v.union(v.literal("manual"), v.literal("autoCount"), v.literal("autoTimer")),
    requestVersion: v.number()
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) {
      throw new Error("Room not found.");
    }

    if (args.requestVersion !== room.analysisRequestVersion) {
      return { skipped: true };
    }

    const analysisId = await ctx.db.insert("analyses", {
      roomId: room._id,
      status: "pending",
      inputSnapshot: {},
      model: ANALYSIS_MODEL,
      promptVersion: PROMPT_VERSION,
      trigger: args.trigger,
      createdAt: now()
    });

    await ctx.db.patch(room._id, {
      status: "analyzing",
      latestAnalysisId: analysisId,
      updatedAt: now()
    });

    await ctx.scheduler.runAfter(0, runAnalysisRef, {
      roomId: room._id,
      trigger: args.trigger,
      requestVersion: args.requestVersion,
      analysisId
    });

    return { analysisId };
  }
});

export const saveAnalysisResult = mutationGeneric({
  args: {
    roomId: v.id("rooms"),
    analysisId: v.id("analyses"),
    status: v.union(v.literal("success"), v.literal("failed")),
    inputSnapshot: v.optional(v.any()),
    output: v.optional(v.any()),
    error: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) {
      throw new Error("Room not found.");
    }

    await ctx.db.patch(args.analysisId, {
      status: args.status,
      inputSnapshot: args.inputSnapshot ?? {},
      output: args.output,
      error: args.error
    });

    await ctx.db.patch(room._id, {
      status: args.status === "success" ? "analyzed" : "collecting",
      latestAnalysisId: args.analysisId,
      updatedAt: now()
    });

    return { ok: true };
  }
});

export const getLatestAnalysis = queryGeneric({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const analyses = await ctx.db
      .query("analyses")
      .withIndex("by_roomId_createdAt", (query: any) => query.eq("roomId", args.roomId))
      .order("desc")
      .take(1);

    return analyses[0] ?? null;
  }
});
