import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getValidSnapshot = query({
  args: {
    key: v.string(),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("snapshotCache")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();

    if (!row || row.expiresAt <= args.now) {
      return null;
    }

    return row.data;
  },
});

export const upsertSnapshot = mutation({
  args: {
    key: v.string(),
    data: v.any(),
    now: v.number(),
    cooldownMs: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("snapshotCache")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .collect();

    const expiresAt = args.now + args.cooldownMs;
    if (existing.length > 0) {
      const [first, ...rest] = existing;
      await ctx.db.patch(first._id, {
        data: args.data,
        updatedAt: args.now,
        expiresAt,
      });
      for (const duplicate of rest) {
        await ctx.db.delete(duplicate._id);
      }
      return first._id;
    }

    return await ctx.db.insert("snapshotCache", {
      key: args.key,
      data: args.data,
      updatedAt: args.now,
      expiresAt,
    });
  },
});
