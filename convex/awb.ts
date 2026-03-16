import { internalMutation, mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { getUserFromToken } from "./auth";

export const createTracking = mutation({
  args: {
    userId: v.id("profiles"),
    orderId: v.id("shopifyOrders"),
    awbNumber: v.string(),
    orderNumber: v.optional(v.string()),
    customerName: v.optional(v.string()),
    customerEmail: v.optional(v.string()),
    shippingAddress: v.optional(v.any()),
    codAmount: v.optional(v.number()),
    samedayResponse: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("awbTracking", {
      userId: args.userId,
      orderId: args.orderId,
      awbNumber: args.awbNumber,
      orderNumber: args.orderNumber,
      customerName: args.customerName,
      customerEmail: args.customerEmail,
      shippingAddress: args.shippingAddress,
      codAmount: args.codAmount,
      samedayResponse: args.samedayResponse,
      currentStatus: "created",
      statusHistory: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return id;
  },
});

export const updateStatus = mutation({
  args: {
    token: v.string(),
    awbNumber: v.string(),
    currentStatus: v.string(),
    statusHistory: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    const tracking = await ctx.db
      .query("awbTracking")
      .withIndex("by_awbNumber", (q) => q.eq("awbNumber", args.awbNumber))
      .first();

    if (!tracking) {
      throw new ConvexError("AWB-ul nu a fost găsit.");
    }

    if (tracking.userId !== user._id) {
      throw new ConvexError("Nu ai acces la acest AWB.");
    }

    await ctx.db.patch(tracking._id, {
      currentStatus: args.currentStatus,
      statusHistory: args.statusHistory,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const updateStatusInternal = internalMutation({
  args: {
    awbNumber: v.string(),
    currentStatus: v.string(),
    statusHistory: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    const tracking = await ctx.db
      .query("awbTracking")
      .withIndex("by_awbNumber", (q) => q.eq("awbNumber", args.awbNumber))
      .first();

    if (!tracking) {
      throw new ConvexError("AWB-ul nu a fost găsit.");
    }

    await ctx.db.patch(tracking._id, {
      currentStatus: args.currentStatus,
      statusHistory: args.statusHistory,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const list = query({
  args: {
    token: v.string(),
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    let trackings = await ctx.db
      .query("awbTracking")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();

    if (args.status) {
      trackings = trackings.filter((t) => t.currentStatus === args.status);
    }

    const limit = args.limit || 100;
    return trackings.slice(0, limit);
  },
});

export const getByAwbNumber = query({
  args: {
    token: v.string(),
    awbNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    const tracking = await ctx.db
      .query("awbTracking")
      .withIndex("by_awbNumber", (q) => q.eq("awbNumber", args.awbNumber))
      .first();

    if (!tracking || tracking.userId !== user._id) {
      return null;
    }

    return tracking;
  },
});

export const getByOrderId = query({
  args: {
    token: v.string(),
    orderId: v.id("shopifyOrders"),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    const tracking = await ctx.db
      .query("awbTracking")
      .withIndex("by_orderId", (q) => q.eq("orderId", args.orderId))
      .first();

    if (!tracking || tracking.userId !== user._id) {
      return null;
    }

    return tracking;
  },
});
