import { mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";

import {
  ANALYSIS_MODEL,
  PROMPT_VERSION,
  buildJoinUrl,
  makeCode,
  makeToken,
  now,
  startAnalysisRunRef
} from "./lib";

async function getRoomByCodeOrThrow(db: any, code: string) {
  const room = await db
    .query("rooms")
    .withIndex("by_code", (query: any) => query.eq("code", code))
    .unique();

  if (!room) {
    throw new Error("Room not found.");
  }

  return room;
}

async function getParticipantByJoinToken(db: any, roomId: any, joinToken: string) {
  return db
    .query("participants")
    .withIndex("by_roomId_joinToken", (query: any) =>
      query.eq("roomId", roomId).eq("joinToken", joinToken)
    )
    .unique();
}

async function getLatestAnalysis(db: any, roomId: any) {
  const analyses = await db
    .query("analyses")
    .withIndex("by_roomId_createdAt", (query: any) => query.eq("roomId", roomId))
    .order("desc")
    .take(1);

  return analyses[0] ?? null;
}

export const createRoom = mutationGeneric({
  args: {
    hostName: v.string(),
    topic: v.string(),
    description: v.optional(v.string()),
    capacityMode: v.union(v.literal("limited"), v.literal("unlimited")),
    maxParticipants: v.optional(v.number()),
    analysisMode: v.union(
      v.literal("manual"),
      v.literal("autoCount"),
      v.literal("autoTimer")
    ),
    analysisThreshold: v.optional(v.number()),
    analysisDeadline: v.optional(v.number()),
    language: v.optional(v.string()),
    origin: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const timestamp = now();
    let code = makeCode();

    while (
      await ctx.db
        .query("rooms")
        .withIndex("by_code", (query: any) => query.eq("code", code))
        .unique()
    ) {
      code = makeCode();
    }

    const hostToken = makeToken(32);
    const joinToken = makeToken(32);

    const roomId = await ctx.db.insert("rooms", {
      code,
      hostName: args.hostName.trim(),
      hostToken,
      topic: args.topic.trim(),
      description: args.description?.trim(),
      status: "collecting",
      capacityMode: args.capacityMode,
      maxParticipants: args.capacityMode === "limited" ? args.maxParticipants : undefined,
      analysisMode: args.analysisMode,
      analysisThreshold:
        args.analysisMode === "autoCount" ? args.analysisThreshold : undefined,
      analysisDeadline:
        args.analysisMode === "autoTimer" ? args.analysisDeadline : undefined,
      language: args.language?.trim(),
      analysisRequestVersion: 0,
      createdAt: timestamp,
      updatedAt: timestamp
    });

    const participantId = await ctx.db.insert("participants", {
      roomId,
      name: args.hostName.trim(),
      joinToken,
      role: "host",
      hasSubmitted: false,
      createdAt: timestamp,
      updatedAt: timestamp
    });

    if (args.analysisMode === "autoTimer" && args.analysisDeadline) {
      const delay = Math.max(0, args.analysisDeadline - timestamp);
      await ctx.scheduler.runAfter(delay, startAnalysisRunRef, {
        roomId,
        trigger: "autoTimer",
        requestVersion: 0
      });
    }

    return {
      roomId,
      participantId,
      code,
      hostToken,
      joinToken,
      joinUrl: args.origin ? buildJoinUrl(args.origin, code) : `?code=${code}`,
      model: ANALYSIS_MODEL,
      promptVersion: PROMPT_VERSION
    };
  }
});

export const getRoomByCode = queryGeneric({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (query: any) => query.eq("code", args.code.trim().toUpperCase()))
      .unique();

    if (!room) {
      return null;
    }

    const participantCount = await ctx.db
      .query("participants")
      .withIndex("by_roomId", (query: any) => query.eq("roomId", room._id))
      .collect()
      .then((rows: any[]) => rows.length);

    return {
      _id: room._id,
      code: room.code,
      hostName: room.hostName,
      topic: room.topic,
      description: room.description ?? null,
      status: room.status,
      capacityMode: room.capacityMode,
      maxParticipants: room.maxParticipants ?? null,
      analysisMode: room.analysisMode,
      analysisThreshold: room.analysisThreshold ?? null,
      analysisDeadline: room.analysisDeadline ?? null,
      language: room.language ?? null,
      participantCount
    };
  }
});

export const getRoomState = queryGeneric({
  args: {
    roomId: v.id("rooms"),
    joinToken: v.optional(v.string()),
    hostToken: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) {
      return null;
    }

    const participants = await ctx.db
      .query("participants")
      .withIndex("by_roomId", (query: any) => query.eq("roomId", room._id))
      .collect();
    const opinions = await ctx.db
      .query("opinions")
      .withIndex("by_roomId", (query: any) => query.eq("roomId", room._id))
      .collect();
    const votes = await ctx.db
      .query("votes")
      .withIndex("by_roomId", (query: any) => query.eq("roomId", room._id))
      .collect();

    const participantMap = new Map(participants.map((participant: any) => [participant._id, participant]));
    const latestAnalysis = await getLatestAnalysis(ctx.db, room._id);
    const viewerParticipant = args.joinToken
      ? await getParticipantByJoinToken(ctx.db, room._id, args.joinToken)
      : null;
    const isHost = args.hostToken ? room.hostToken === args.hostToken : false;

    return {
      room: {
        _id: room._id,
        code: room.code,
        hostName: room.hostName,
        topic: room.topic,
        description: room.description ?? null,
        status: room.status,
        capacityMode: room.capacityMode,
        maxParticipants: room.maxParticipants ?? null,
        analysisMode: room.analysisMode,
        analysisThreshold: room.analysisThreshold ?? null,
        analysisDeadline: room.analysisDeadline ?? null,
        language: room.language ?? null,
        participantCount: participants.length
      },
      viewer: {
        isHost,
        participantId: viewerParticipant?._id ?? null,
        name: viewerParticipant?.name ?? null,
        hasSubmitted: viewerParticipant?.hasSubmitted ?? false
      },
      participants: participants.map((participant: any) => ({
        _id: participant._id,
        name: participant.name,
        role: participant.role,
        hasSubmitted: participant.hasSubmitted
      })),
      opinions: opinions.map((opinion: any) => {
        const participant = participantMap.get(opinion.participantId);
        return {
          _id: opinion._id,
          participantId: opinion.participantId,
          participantName: participant?.name ?? "Anonymous",
          choice: opinion.choice,
          reason: opinion.reason ?? null,
          attachmentIds: opinion.attachmentIds,
          yesCount: opinion.yesCount,
          neutralCount: opinion.neutralCount,
          noCount: opinion.noCount,
          createdAt: opinion.createdAt,
          updatedAt: opinion.updatedAt
        };
      }),
      reactions: votes.map((vote: any) => ({
        _id: vote._id,
        opinionId: vote.opinionId,
        participantId: vote.participantId,
        kind: vote.kind,
        reason: vote.reason ?? null
      })),
      latestAnalysis
    };
  }
});

export const getAnalysisSnapshot = queryGeneric({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) {
      throw new Error("Room not found.");
    }

    const participants = await ctx.db
      .query("participants")
      .withIndex("by_roomId", (query: any) => query.eq("roomId", room._id))
      .collect();
    const opinions = await ctx.db
      .query("opinions")
      .withIndex("by_roomId", (query: any) => query.eq("roomId", room._id))
      .collect();
    const votes = await ctx.db
      .query("votes")
      .withIndex("by_roomId", (query: any) => query.eq("roomId", room._id))
      .collect();

    const participantMap = new Map(participants.map((participant: any) => [participant._id, participant]));
    const voteMap = new Map<string, any[]>();

    for (const vote of votes) {
      const list = voteMap.get(vote.opinionId) ?? [];
      list.push(vote);
      voteMap.set(vote.opinionId, list);
    }

    const serializedOpinions = [];
    for (const opinion of opinions) {
      const participant = participantMap.get(opinion.participantId);
      const attachmentParts = [];

      for (const attachmentId of opinion.attachmentIds) {
        const metadata = await ctx.storage.getMetadata(attachmentId);
        attachmentParts.push({
          storageId: attachmentId,
          contentType: metadata?.contentType ?? null,
          size: metadata?.size ?? null
        });
      }

      serializedOpinions.push({
        opinionId: opinion._id,
        participantId: opinion.participantId,
        participantName: participant?.name ?? "Anonymous",
        choice: opinion.choice,
        reason: opinion.reason ?? null,
        yesCount: opinion.yesCount,
        neutralCount: opinion.neutralCount,
        noCount: opinion.noCount,
        reactionReasons: (voteMap.get(opinion._id) ?? [])
          .filter((vote: any) => !!vote.reason)
          .map((vote: any) => ({
            kind: vote.kind,
            reason: vote.reason,
            participantId: vote.participantId
          })),
        attachments: attachmentParts
      });
    }

    return {
      room: {
        _id: room._id,
        code: room.code,
        topic: room.topic,
        description: room.description ?? null,
        language: room.language ?? null,
        status: room.status,
        analysisMode: room.analysisMode,
        analysisThreshold: room.analysisThreshold ?? null,
        analysisDeadline: room.analysisDeadline ?? null,
        analysisRequestVersion: room.analysisRequestVersion
      },
      participantCount: participants.length,
      opinions: serializedOpinions
    };
  }
});

export const joinRoom = mutationGeneric({
  args: {
    code: v.string(),
    name: v.string()
  },
  handler: async (ctx, args) => {
    const room = await getRoomByCodeOrThrow(ctx.db, args.code.trim().toUpperCase());

    if (room.status === "closed") {
      throw new Error("This room is closed.");
    }

    const participants = await ctx.db
      .query("participants")
      .withIndex("by_roomId", (query: any) => query.eq("roomId", room._id))
      .collect();

    if (
      room.capacityMode === "limited" &&
      room.maxParticipants &&
      participants.length >= room.maxParticipants
    ) {
      throw new Error("This room is full.");
    }

    const timestamp = now();
    const joinToken = makeToken(32);
    const participantId = await ctx.db.insert("participants", {
      roomId: room._id,
      name: args.name.trim(),
      joinToken,
      role: "participant",
      hasSubmitted: false,
      createdAt: timestamp,
      updatedAt: timestamp
    });

    return {
      roomId: room._id,
      participantId,
      joinToken,
      role: "participant"
    };
  }
});

export const resumeParticipant = queryGeneric({
  args: {
    roomId: v.id("rooms"),
    joinToken: v.string()
  },
  handler: async (ctx, args) => {
    const participant = await getParticipantByJoinToken(ctx.db, args.roomId, args.joinToken);
    if (!participant) {
      return null;
    }

    return {
      participantId: participant._id,
      name: participant.name,
      role: participant.role,
      hasSubmitted: participant.hasSubmitted
    };
  }
});

export const resumeHost = queryGeneric({
  args: {
    roomId: v.id("rooms"),
    hostToken: v.string()
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.hostToken !== args.hostToken) {
      return null;
    }

    const hostParticipant = await ctx.db
      .query("participants")
      .withIndex("by_roomId_role", (query: any) =>
        query.eq("roomId", args.roomId).eq("role", "host")
      )
      .unique();

    return {
      participantId: hostParticipant?._id ?? null,
      name: hostParticipant?.name ?? room.hostName,
      role: "host",
      hasSubmitted: hostParticipant?.hasSubmitted ?? false
    };
  }
});

export const closeRoom = mutationGeneric({
  args: {
    roomId: v.id("rooms"),
    hostToken: v.string()
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.hostToken !== args.hostToken) {
      throw new Error("Only the host can close this room.");
    }

    await ctx.db.patch(room._id, {
      status: "closed",
      updatedAt: now()
    });

    return { ok: true };
  }
});
