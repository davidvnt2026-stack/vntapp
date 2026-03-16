import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getUserFromToken } from "./auth";

// ============================================
// QUERIES
// ============================================

// Get user settings (impersonation handled at session level)
export const get = query({
  args: { 
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new Error("Sesiune expirată. Te rugăm să te autentifici din nou.");

    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .first();

    if (!settings) {
      // Return defaults
      return {
        stockManagement: "shopify" as const, // "shopify" or "local"
        autoDeductStock: true,
        sharedStockEnabled: false,
        linkedStoreIds: [] as string[],
        courierPickupAddress: undefined as string | undefined,
      };
    }

    return {
      stockManagement: settings.stockManagement || "shopify",
      autoDeductStock: settings.autoDeductStock ?? true,
      sharedStockEnabled: settings.sharedStockEnabled ?? false,
      linkedStoreIds: settings.linkedStoreIds ?? [],
      courierPickupAddress: settings.courierPickupAddress,
    };
  },
});

// Get settings by userId (for internal use / webhooks)
export const getByUserId = query({
  args: { userId: v.id("profiles") },
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();

    if (!settings) {
      return {
        stockManagement: "shopify" as const,
        autoDeductStock: true,
        sharedStockEnabled: false,
        linkedStoreIds: [] as string[],
        courierPickupAddress: undefined as string | undefined,
      };
    }

    return {
      stockManagement: settings.stockManagement || "shopify",
      autoDeductStock: settings.autoDeductStock ?? true,
      sharedStockEnabled: settings.sharedStockEnabled ?? false,
      linkedStoreIds: settings.linkedStoreIds ?? [],
      courierPickupAddress: settings.courierPickupAddress,
    };
  },
});

// ============================================
// MUTATIONS
// ============================================

// Update stock management settings
export const updateStockSettings = mutation({
  args: {
    token: v.string(),
    stockManagement: v.optional(v.string()), // "shopify" or "local"
    autoDeductStock: v.optional(v.boolean()),
    sharedStockEnabled: v.optional(v.boolean()),
    linkedStoreIds: v.optional(v.array(v.string())), // shopDomains
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new Error("Sesiune expirată. Te rugăm să te autentifici din nou.");

    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...(args.stockManagement !== undefined && { stockManagement: args.stockManagement }),
        ...(args.autoDeductStock !== undefined && { autoDeductStock: args.autoDeductStock }),
        ...(args.sharedStockEnabled !== undefined && { sharedStockEnabled: args.sharedStockEnabled }),
        ...(args.linkedStoreIds !== undefined && { linkedStoreIds: args.linkedStoreIds }),
        updatedAt: now,
      });
      return existing._id;
    }

    // Create new settings record
    return await ctx.db.insert("userSettings", {
      userId: user._id,
      stockManagement: args.stockManagement || "shopify",
      autoDeductStock: args.autoDeductStock ?? true,
      sharedStockEnabled: args.sharedStockEnabled ?? false,
      linkedStoreIds: args.linkedStoreIds ?? [],
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Update courier pickup address
export const updateCourierSettings = mutation({
  args: {
    token: v.string(),
    courierPickupAddress: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new Error("Sesiune expirată. Te rugăm să te autentifici din nou.");

    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        courierPickupAddress: args.courierPickupAddress || undefined,
        updatedAt: now,
      });
      return existing._id;
    }

    // Create new settings record
    return await ctx.db.insert("userSettings", {
      userId: user._id,
      courierPickupAddress: args.courierPickupAddress,
      createdAt: now,
      updatedAt: now,
    });
  },
});
