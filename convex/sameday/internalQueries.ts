import { internalQuery } from "../_generated/server";
import { v } from "convex/values";

export const getAnySamedayConnection = internalQuery({
  args: {},
  handler: async (ctx) => {
    const connections = await ctx.db
      .query("userConnections")
      .withIndex("by_connectionType_isActive", (q) => q.eq("connectionType", "sameday"))
      .take(1);
    return connections.length > 0 ? connections[0] : null;
  },
});

export const getAllSamedayConnections = internalQuery({
  args: {},
  handler: async (ctx) => {
    const connections = await ctx.db
      .query("userConnections")
      .withIndex("by_connectionType_isActive", (q) => q.eq("connectionType", "sameday").eq("isActive", true))
      .collect();

    return connections;
  },
});

// Single-page paginated query: returns one page of orders needing status updates.
// Convex only allows ONE .paginate() call per query, so the caller (action)
// must loop through pages by passing the continueCursor back.
export const getOrdersNeedingStatusUpdate = internalQuery({
  args: {
    userId: v.id("profiles"),
    cursor: v.optional(v.string()),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const lookbackDays = 11;
    const numItems = args.pageSize ?? 200;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - lookbackDays);
    const cutoffDateStr = cutoff.toISOString().split("T")[0];

    const FINAL_STATES = [
      "livrat cu succes",
      "delivered",
      "livrare reusita",
      "anulat",
      "cancelled",
      "canceled",
      "retur finalizat",
      "retur livrat",
      "returned to sender",
      "refuzat",
      "refused",
    ];

    const page = await ctx.db
      .query("shopifyOrders")
      .withIndex("by_userId_placedOn", (q) =>
        q.eq("userId", args.userId).gte("placedOn", cutoffDateStr)
      )
      .order("desc")
      .paginate({ numItems, cursor: args.cursor ?? null });

    const results: Array<{ _id: any; trackingNumber: string; orderNumber: string }> = [];

    for (const order of page.page) {
      if (!order.trackingNumber) continue;
      if (order.status === "cancelled") continue;
      if (order.deliveryStatus) {
        const status = order.deliveryStatus.toLowerCase();
        const isFinal = FINAL_STATES.some((finalState) => status.includes(finalState));
        if (isFinal) continue;
      }
      results.push({
        _id: order._id,
        trackingNumber: order.trackingNumber!,
        orderNumber: order.orderNumber,
      });
    }

    return {
      orders: results,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

export const getOrdersWithAwbs = internalQuery({
  args: {
    limit: v.optional(v.number()),
    userId: v.id("profiles"),
    days: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 100, 200);
    const days = Math.min(args.days ?? 90, 180);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split("T")[0];
    const scanLimit = Math.max(limit * 3, 300);

    const results: Array<{
      _id: any;
      orderNumber: string;
      trackingNumber: string;
      line1: string;
      city: string;
      state: string;
      postalCode: string;
      countryCode: string;
      country: string;
    }> = [];
    const orders = await ctx.db
      .query("shopifyOrders")
      .withIndex("by_userId_placedOn", (q) =>
        q.eq("userId", args.userId).gte("placedOn", startDateStr)
      )
      .order("desc")
      .take(scanLimit);

    for (const o of orders) {
      if (results.length >= limit) break;
      if (!o.trackingNumber || !o.shippingAddress) continue;

      results.push({
        _id: o._id,
        orderNumber: o.orderNumber,
        trackingNumber: o.trackingNumber,
        line1: o.shippingAddress?.line1 || o.shippingAddress?.address1 || "",
        city: o.shippingAddress?.city || "",
        state: o.shippingAddress?.state || o.shippingAddress?.province || "",
        postalCode:
          o.shippingAddress?.postalCode ||
          o.shippingAddress?.zipCode ||
          o.shippingAddress?.zip ||
          o.shippingAddress?.postal_code ||
          o.shippingAddress?.postcode ||
          "",
        countryCode: o.shippingAddress?.countryCode || o.shippingAddress?.country_code || "RO",
        country: o.shippingAddress?.country || "Romania",
      });
    }

    return results;
  },
});
