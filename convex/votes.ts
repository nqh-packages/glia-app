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

async function scheduleIfAutoMode(ctx: any, room: any) {
  if (room.analysisMode !== "autoCount" || !room.analysisThreshold) {
    return;
  }

  const opinionCount = await ctx.db
    .query("opinions")
    .withIndex("by_roomId", (query: any) => query.eq("roomId", room._id))
    .collect()
    .then((rows: any[]) => rows.length);

  if (opinionCount < room.analysisThreshold) {
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

async function updateOpinionCounts(ctx: any, opinionId: any) {
  const votes = await ctx.db
    .query("votes")
    .withIndex("by_opinionId", (query: any) => query.eq("opinionId", opinionId))
    .collect();

  let yesCount = 0;
  let neutralCount = 0;
  let noCount = 0;

  for (const vote of votes) {
    if (vote.kind === "yes") {
      yesCount += 1;
    } else if (vote.kind === "neutral") {
      neutralCount += 1;
    } else if (vote.kind === "no") {
      noCount += 1;
    }
  }

  await ctx.db.patch(opinionId, {
    yesCount,
    neutralCount,
    noCount,
    updatedAt: now()
  });
}

export const castReaction = mutationGeneric({
  args: {
    roomId: v.id("rooms"),
    joinToken: v.string(),
    opinionId: v.id("opinions"),
    kind: v.union(v.literal("yes"), v.literal("neutral"), v.literal("no")),
    reason: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) {
      throw new Error("Room not found.");
    }
    if (room.status !== "collecting" && room.status !== "analyzed") {
      throw new Error("Voting is not available right now.");
    }

    const participant = await getParticipantOrThrow(ctx.db, room._id, args.joinToken);
    const opinion = await ctx.db.get(args.opinionId);

    if (!opinion || opinion.roomId !== room._id) {
      throw new Error("Opinion not found.");
    }

    if (opinion.participantId === participant._id) {
      throw new Error("You cannot vote on your own opinion.");
    }

    const existingVote = await ctx.db
      .query("votes")
      .withIndex("by_participantId_opinionId", (query: any) =>
        query.eq("participantId", participant._id).eq("opinionId", opinion._id)
      )
      .unique();

    const timestamp = now();
    if (existingVote) {
      await ctx.db.patch(existingVote._id, {
        kind: args.kind,
        reason: args.reason?.trim(),
        updatedAt: timestamp
      });
    } else {
      await ctx.db.insert("votes", {
        roomId: room._id,
        opinionId: opinion._id,
        participantId: participant._id,
        kind: args.kind,
        reason: args.reason?.trim(),
        createdAt: timestamp,
        updatedAt: timestamp
      });
    }

    await updateOpinionCounts(ctx, opinion._id);
    await scheduleIfAutoMode(ctx, room);

    return { ok: true };
  }
});

export const removeReaction = mutationGeneric({
  args: {
    roomId: v.id("rooms"),
    joinToken: v.string(),
    opinionId: v.id("opinions")
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) {
      throw new Error("Room not found.");
    }

    const participant = await getParticipantOrThrow(ctx.db, room._id, args.joinToken);
    const vote = await ctx.db
      .query("votes")
      .withIndex("by_participantId_opinionId", (query: any) =>
        query.eq("participantId", participant._id).eq("opinionId", args.opinionId)
      )
      .unique();

    if (!vote) {
      return { ok: true };
    }

    await ctx.db.delete(vote._id);
    await updateOpinionCounts(ctx, args.opinionId);

    return { ok: true };
  }
});

export const listReactionsForRoom = queryGeneric({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("votes")
      .withIndex("by_roomId", (query: any) => query.eq("roomId", args.roomId))
      .collect();
  }
});
