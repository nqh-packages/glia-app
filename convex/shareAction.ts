"use node";

import QRCode from "qrcode";
import { actionGeneric } from "convex/server";
import { v } from "convex/values";

import { buildJoinUrl, getRoomByCodeRef } from "./lib";

export const generateJoinQrCode = actionGeneric({
  args: {
    code: v.string(),
    origin: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const room = await ctx.runQuery(getRoomByCodeRef as any, {
      code: args.code.trim().toUpperCase()
    });

    if (!room) {
      throw new Error("Room not found.");
    }

    const joinUrl = args.origin
      ? buildJoinUrl(args.origin, room.code)
      : `?code=${encodeURIComponent(room.code)}`;

    const dataUrl = await QRCode.toDataURL(joinUrl, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 320
    });

    return {
      code: room.code,
      joinUrl,
      dataUrl
    };
  }
});
