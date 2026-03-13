import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  rooms: defineTable({
    code: v.string(),
    hostName: v.string(),
    hostToken: v.string(),
    topic: v.string(),
    description: v.optional(v.string()),
    status: v.union(
      v.literal("collecting"),
      v.literal("analyzing"),
      v.literal("analyzed"),
      v.literal("closed")
    ),
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
    latestAnalysisId: v.optional(v.id("analyses")),
    analysisRequestVersion: v.number(),
    lastAutoAnalysisAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_code", ["code"])
    .index("by_hostToken", ["hostToken"])
    .index("by_status", ["status"]),

  participants: defineTable({
    roomId: v.id("rooms"),
    name: v.string(),
    joinToken: v.string(),
    role: v.union(v.literal("host"), v.literal("participant")),
    hasSubmitted: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_roomId", ["roomId"])
    .index("by_roomId_joinToken", ["roomId", "joinToken"])
    .index("by_roomId_role", ["roomId", "role"]),

  opinions: defineTable({
    roomId: v.id("rooms"),
    participantId: v.id("participants"),
    choice: v.union(v.literal("yes"), v.literal("neutral"), v.literal("no")),
    reason: v.optional(v.string()),
    attachmentIds: v.array(v.id("_storage")),
    yesCount: v.number(),
    neutralCount: v.number(),
    noCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_roomId", ["roomId"])
    .index("by_roomId_participantId", ["roomId", "participantId"]),

  votes: defineTable({
    roomId: v.id("rooms"),
    opinionId: v.id("opinions"),
    participantId: v.id("participants"),
    kind: v.union(v.literal("yes"), v.literal("neutral"), v.literal("no")),
    reason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_roomId", ["roomId"])
    .index("by_opinionId", ["opinionId"])
    .index("by_participantId_opinionId", ["participantId", "opinionId"]),

  // requestVersion for debugging skipped runs. If inputSnapshot/output grow
  // large, consider a separate analysisBlobs table keyed by analysisId.
  analyses: defineTable({
    roomId: v.id("rooms"),
    status: v.union(v.literal("pending"), v.literal("success"), v.literal("failed")),
    inputSnapshot: v.any(),
    output: v.optional(v.any()),
    model: v.string(),
    promptVersion: v.string(),
    trigger: v.union(
      v.literal("manual"),
      v.literal("autoCount"),
      v.literal("autoTimer")
    ),
    error: v.optional(v.string()),
    requestVersion: v.optional(v.number()),
    createdAt: v.number()
  }).index("by_roomId_createdAt", ["roomId", "createdAt"]),

  rateLimits: defineTable({
    key: v.string(),
    count: v.number(),
    windowEnd: v.number()
  }).index("by_key", ["key"])
});
