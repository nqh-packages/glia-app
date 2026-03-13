import { mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";

import { now, startAnalysisRunRef } from "./lib";

async function getParticipantOrThrow(db: any, roomId: any, joinToken: string) {
  const participant = await db
    .query("participants")
    .withIndex("by_roomId_joinToken", (query: any) =>
      query.eq("roomId", roomId).eq("joinToken", joinToken)
    )
    .unique();

  if (!participant) {
    throw new Error("Participant session not found.");
  }

  return participant;
}

async function maybeScheduleAutoCountAnalysis(ctx: any, room: any) {
  if (room.analysisMode !== "autoCount" || !room.analysisThreshold) {
    return;
  }

  const submittedOpinions = await ctx.db
    .query("opinions")
    .withIndex("by_roomId", (query: any) => query.eq("roomId", room._id))
    .collect();

  if (submittedOpinions.length < room.analysisThreshold) {
    return;
  }

  const requestVersion = room.analysisRequestVersion + 1;
  await ctx.db.patch(room._id, {
    analysisRequestVersion: requestVersion,
    lastAutoAnalysisAt: now(),
    updatedAt: now()
  });

  await ctx.scheduler.runAfter(1500, startAnalysisRunRef, {
    roomId: room._id,
    trigger: "autoCount",
    requestVersion
  });
}

export const generateUploadUrl = mutationGeneric({
  args: {},
  handler: async (ctx) => {
    return ctx.storage.generateUploadUrl();
  }
});

export const submitOpinion = mutationGeneric({
  args: {
    roomId: v.id("rooms"),
    joinToken: v.string(),
    choice: v.union(v.literal("yes"), v.literal("neutral"), v.literal("no")),
    reason: v.optional(v.string()),
    attachmentIds: v.array(v.id("_storage"))
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) {
      throw new Error("Room not found.");
    }
    if (room.status === "closed") {
      throw new Error("This room is closed.");
    }

    const participant = await getParticipantOrThrow(ctx.db, room._id, args.joinToken);
    const existingOpinion = await ctx.db
      .query("opinions")
      .withIndex("by_roomId_participantId", (query: any) =>
        query.eq("roomId", room._id).eq("participantId", participant._id)
      )
      .unique();

    const timestamp = now();
    if (existingOpinion) {
      await ctx.db.patch(existingOpinion._id, {
        choice: args.choice,
        reason: args.reason?.trim() || undefined,
        attachmentIds: args.attachmentIds,
        updatedAt: timestamp
      });
      await maybeScheduleAutoCountAnalysis(ctx, room);
      return { opinionId: existingOpinion._id };
    }

    const opinionId = await ctx.db.insert("opinions", {
      roomId: room._id,
      participantId: participant._id,
      choice: args.choice,
      reason: args.reason?.trim() || undefined,
      attachmentIds: args.attachmentIds,
      yesCount: 0,
      neutralCount: 0,
      noCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp
    });

    await ctx.db.patch(participant._id, {
      hasSubmitted: true,
      updatedAt: timestamp
    });

    await maybeScheduleAutoCountAnalysis(ctx, room);

    return { opinionId };
  }
});

export const updateOpinion = mutationGeneric({
  args: {
    roomId: v.id("rooms"),
    joinToken: v.string(),
    choice: v.union(v.literal("yes"), v.literal("neutral"), v.literal("no")),
    reason: v.optional(v.string()),
    attachmentIds: v.array(v.id("_storage"))
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) {
      throw new Error("Room not found.");
    }
    if (room.status === "closed") {
      throw new Error("This room is closed.");
    }

    const participant = await getParticipantOrThrow(ctx.db, room._id, args.joinToken);
    const opinion = await ctx.db
      .query("opinions")
      .withIndex("by_roomId_participantId", (query: any) =>
        query.eq("roomId", room._id).eq("participantId", participant._id)
      )
      .unique();

    if (!opinion) {
      throw new Error("Opinion not found.");
    }

    await ctx.db.patch(opinion._id, {
      choice: args.choice,
      reason: args.reason?.trim() || undefined,
      attachmentIds: args.attachmentIds,
      updatedAt: now()
    });

    await maybeScheduleAutoCountAnalysis(ctx, room);

    return { opinionId: opinion._id };
  }
});

export const listOpinions = queryGeneric({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const opinions = await ctx.db
      .query("opinions")
      .withIndex("by_roomId", (query: any) => query.eq("roomId", args.roomId))
      .collect();
    const participants = await ctx.db
      .query("participants")
      .withIndex("by_roomId", (query: any) => query.eq("roomId", args.roomId))
      .collect();

    const participantMap = new Map(participants.map((participant: any) => [participant._id, participant]));

    return opinions.map((opinion: any) => ({
      ...opinion,
      participantName: participantMap.get(opinion.participantId)?.name ?? "Anonymous"
    }));
  }
});
