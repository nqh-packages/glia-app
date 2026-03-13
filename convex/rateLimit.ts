import { now } from "./lib";

const WINDOW_MS = 60 * 1000; // 1 minute
const CREATE_ROOM_LIMIT = 10;
const JOIN_ROOM_LIMIT_PER_ROOM = 30;

export async function checkCreateRoomRateLimit(ctx: { db: any }) {
  await checkRateLimit(ctx, "create:global", CREATE_ROOM_LIMIT, WINDOW_MS);
}

export async function checkJoinRoomRateLimit(ctx: { db: any }, roomId: string | { toString(): string }) {
  await checkRateLimit(ctx, `join:${roomId}`, JOIN_ROOM_LIMIT_PER_ROOM, WINDOW_MS);
}

async function checkRateLimit(
  ctx: { db: any },
  key: string,
  limit: number,
  windowMs: number
) {
  const t = now();
  const doc = await ctx.db
    .query("rateLimits")
    .withIndex("by_key", (q: any) => q.eq("key", key))
    .unique();

  const windowEnd = t + windowMs;
  if (!doc || doc.windowEnd < t) {
    if (doc) {
      await ctx.db.patch(doc._id, { count: 1, windowEnd });
    } else {
      await ctx.db.insert("rateLimits", { key, count: 1, windowEnd });
    }
    return;
  }

  const newCount = doc.count + 1;
  if (newCount > limit) {
    throw new Error("Too many requests. Please try again in a minute.");
  }
  await ctx.db.patch(doc._id, { count: newCount });
}
