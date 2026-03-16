// @ts-nocheck
import { action } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";

export const calculateInvoiceSnapshot = action({
  args: {
    token: v.string(),
    userId: v.id("profiles"),
    month: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    forceRefresh: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const apiAny = api as any;
    const cooldownMs = 60 * 60 * 1000;
    const now = Date.now();
    const currentUser = await ctx.runQuery(apiAny.auth.getCurrentUser, { token: args.token });
    if (!currentUser?._id) {
      throw new Error("Sesiune expirata. Te rugam sa te autentifici din nou.");
    }
    const periodKey =
      args.startDate && args.endDate
        ? `${args.startDate}:${args.endDate}`
        : args.month || "current";
    const cacheKey = `invoice:${args.userId}:${periodKey}`;

    if (!args.forceRefresh) {
      const cached = await ctx.runQuery(apiAny.snapshotCache.getValidSnapshot, {
        key: cacheKey,
        now,
      });
      if (cached) {
        return cached;
      }
    }

    const snapshot = await ctx.runQuery(internal.invoices.calculateInvoice, {
      token: args.token,
      userId: args.userId,
      month: args.month,
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

export const getInvoiceRatesSnapshot = action({
  args: {
    token: v.string(),
    userId: v.id("profiles"),
    forceRefresh: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const apiAny = api as any;
    const cooldownMs = 60 * 60 * 1000;
    const now = Date.now();
    const currentUser = await ctx.runQuery(apiAny.auth.getCurrentUser, { token: args.token });
    if (!currentUser?._id) {
      throw new Error("Sesiune expirata. Te rugam sa te autentifici din nou.");
    }

    const cacheKey = `invoice-rates:${args.userId}`;
    if (!args.forceRefresh) {
      const cached = await ctx.runQuery(apiAny.snapshotCache.getValidSnapshot, {
        key: cacheKey,
        now,
      });
      if (cached) {
        return cached;
      }
    }

    const [billingRate, packagingRates] = await Promise.all([
      ctx.runQuery(apiAny.invoices.getBillingRate, { token: args.token, userId: args.userId }),
      ctx.runQuery(apiAny.invoices.getPackagingRates, { token: args.token, userId: args.userId }),
    ]);

    const snapshot = {
      billingRate,
      packagingRates,
      updatedAt: now,
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
