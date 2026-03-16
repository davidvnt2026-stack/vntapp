// @ts-nocheck
import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

async function getTargetUserIdFromToken(ctx: any, token: string): Promise<string | null> {
  const apiAny = api as any;
  const status = await ctx.runQuery(apiAny.auth.getImpersonationStatus, { token });
  if (status?.isImpersonating && status?.impersonatedUser?._id) {
    return status.impersonatedUser._id;
  }
  return status?.realUser?._id ?? null;
}

export const getSkuMetricsSnapshot = action({
  args: {
    token: v.string(),
    period: v.optional(v.string()),
    forceRefresh: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const apiAny = api as any;
    const now = Date.now();
    const cooldownMs = 60 * 60 * 1000;
    const targetUserId = await getTargetUserIdFromToken(ctx, args.token);
    if (!targetUserId) {
      throw new Error("Sesiune expirata. Te rugam sa te autentifici din nou.");
    }

    const periodKey = args.period || "default";
    const cacheKey = `analytics:skuMetrics:${targetUserId}:${periodKey}`;
    if (!args.forceRefresh) {
      const cached = await ctx.runQuery(apiAny.snapshotCache.getValidSnapshot, {
        key: cacheKey,
        now,
      });
      if (cached) {
        return cached;
      }
    }

    const snapshot = await ctx.runQuery(apiAny.analytics.getSkuMetrics, {
      token: args.token,
      period: args.period,
    });
    await ctx.runMutation(apiAny.snapshotCache.upsertSnapshot, {
      key: cacheKey,
      data: snapshot,
      now,
      cooldownMs,
    });
    return snapshot;
  },
});

export const getStatusDistributionSnapshot = action({
  args: {
    token: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    forceRefresh: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const apiAny = api as any;
    const now = Date.now();
    const cooldownMs = 60 * 60 * 1000;
    const targetUserId = await getTargetUserIdFromToken(ctx, args.token);
    if (!targetUserId) {
      throw new Error("Sesiune expirata. Te rugam sa te autentifici din nou.");
    }

    const rangeKey = `${args.startDate}:${args.endDate}`;
    const cacheKey = `analytics:statusDistribution:${targetUserId}:${rangeKey}`;
    if (!args.forceRefresh) {
      const cached = await ctx.runQuery(apiAny.snapshotCache.getValidSnapshot, {
        key: cacheKey,
        now,
      });
      if (cached) {
        return cached;
      }
    }

    const snapshot = await ctx.runQuery(apiAny.analytics.getStatusDistribution, {
      token: args.token,
      startDate: args.startDate,
      endDate: args.endDate,
    });
    await ctx.runMutation(apiAny.snapshotCache.upsertSnapshot, {
      key: cacheKey,
      data: snapshot,
      now,
      cooldownMs,
    });
    return snapshot;
  },
});
