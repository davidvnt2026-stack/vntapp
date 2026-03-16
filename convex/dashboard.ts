// @ts-nocheck
import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

export const getSnapshotData = action({
  args: {
    token: v.string(),
    period: v.union(
      v.literal("today"),
      v.literal("7d"),
      v.literal("30d"),
      v.literal("all")
    ),
    shopDomain: v.optional(v.string()),
    forceRefresh: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const apiAny = api as any;
    const cooldownMs = 60 * 60 * 1000;
    const now = Date.now();
    const impersonationStatus = await ctx.runQuery(apiAny.auth.getImpersonationStatus, {
      token: args.token,
    });
    const targetUserId =
      impersonationStatus?.isImpersonating && impersonationStatus?.impersonatedUser?._id
        ? impersonationStatus.impersonatedUser._id
        : impersonationStatus?.realUser?._id;
    if (!targetUserId) {
      throw new Error("Sesiune expirata. Te rugam sa te autentifici din nou.");
    }
    const cacheKey = `dashboard:${targetUserId}:${args.period}:${args.shopDomain || "all"}`;

    if (!args.forceRefresh) {
      const cached = await ctx.runQuery(apiAny.snapshotCache.getValidSnapshot, {
        key: cacheKey,
        now,
      });
      if (cached) {
        return cached;
      }
    }

    const isAllTime = args.period === "all";
    const rollingDays = args.period === "today" ? 1 : args.period === "7d" ? 7 : 30;
    const pickingPeriod = args.period === "7d" ? "7d" : "30d";

    const [
      stats,
      salesChartData,
      pickingListStats,
      topSellingProducts,
      topReturnedProducts,
      returnsAnalysis,
      courierRevenue,
    ] = await Promise.all([
      ctx.runAction(apiAny.orders.getStats, {
        token: args.token,
        shopDomain: args.shopDomain,
      }),
      ctx.runQuery(apiAny.analytics.getSalesChartData, {
        token: args.token,
        days: rollingDays,
        shopDomain: args.shopDomain,
      }),
      ctx.runQuery(apiAny.analytics.getPickingListStats, {
        token: args.token,
        period: pickingPeriod,
        shopDomain: args.shopDomain,
      }),
      ctx.runQuery(apiAny.analytics.getTopSellingProducts, {
        token: args.token,
        days: rollingDays,
        limit: 10,
        shopDomain: args.shopDomain,
      }),
      ctx.runQuery(apiAny.analytics.getTopReturnedProducts, {
        token: args.token,
        days: isAllTime ? undefined : rollingDays,
        allTime: isAllTime,
        limit: 10,
        shopDomain: args.shopDomain,
      }),
      ctx.runQuery(apiAny.analytics.getReturnsAnalysis, {
        token: args.token,
        days: isAllTime ? undefined : rollingDays,
        allTime: isAllTime,
        shopDomain: args.shopDomain,
      }),
      ctx.runQuery(apiAny.courierRevenue.getRecentForDashboard, {
        token: args.token,
        days: 30,
      }),
    ]);

    const snapshot = {
      updatedAt: Date.now(),
      stats,
      salesChartData,
      pickingListStats,
      topSellingProducts,
      topReturnedProducts,
      returnsAnalysis,
      courierRevenue,
    };

    await ctx.runMutation(apiAny.snapshotCache.upsertSnapshot, {
      key: cacheKey,
      data: snapshot,
      now,
      cooldownMs,
    });

    return snapshot;
  },
});

