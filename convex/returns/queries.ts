import { query } from "../_generated/server";
import { v } from "convex/values";
import { getUserFromToken } from "../auth";
import { getReturnsByDateRange, toDateOnly } from "./shared";

export const list = query({
  args: {
    token: v.string(),
    status: v.optional(v.string()),
    search: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    limit: v.optional(v.number()),
    shopDomain: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new Error("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    const fallbackStartDate = toDateOnly(new Date(Date.now() - 180 * 24 * 60 * 60 * 1000));
    let returns = await getReturnsByDateRange(
      ctx,
      user._id,
      args.startDate || fallbackStartDate,
      args.endDate,
      args.shopDomain
    );

    if (args.status) {
      returns = returns.filter((r: any) => r.returnStatus === args.status);
    }
    if (args.startDate) {
      returns = returns.filter((r: any) => r.returnDate >= args.startDate!);
    }
    if (args.endDate) {
      returns = returns.filter((r: any) => r.returnDate <= args.endDate!);
    }
    if (args.search) {
      const searchLower = args.search.toLowerCase();
      returns = returns.filter(
        (r: any) =>
          r.awbNumber?.toLowerCase().includes(searchLower) ||
          r.orderNumber?.toLowerCase().includes(searchLower) ||
          r.customerName?.toLowerCase().includes(searchLower)
      );
    }

    returns.sort((a: any, b: any) => new Date(b.returnDate).getTime() - new Date(a.returnDate).getTime());
    return returns.slice(0, args.limit || 200);
  },
});

export const getPendingCount = query({
  args: {
    token: v.string(),
    shopDomain: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      return 0;
    }
    const fallbackStartDate = toDateOnly(new Date(Date.now() - 180 * 24 * 60 * 60 * 1000));
    const returns = await getReturnsByDateRange(ctx, user._id, fallbackStartDate, undefined, args.shopDomain);
    return returns.filter((r: any) => r.returnStatus === "pending").length;
  },
});

export const getStats = query({
  args: {
    token: v.string(),
    shopDomain: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new Error("Sesiune expirată.");
    }

    const today = toDateOnly(new Date());
    const yesterday = toDateOnly(new Date(Date.now() - 24 * 60 * 60 * 1000));
    const weekAgo = toDateOnly(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
    const tenDaysAgo = toDateOnly(new Date(Date.now() - 10 * 24 * 60 * 60 * 1000));
    const monthAgo = toDateOnly(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
    const sixMonthsAgo = toDateOnly(new Date(Date.now() - 180 * 24 * 60 * 60 * 1000));

    const [recentReturns, todayReturns, yesterdayReturns] = await Promise.all([
      getReturnsByDateRange(ctx, user._id, sixMonthsAgo, undefined, args.shopDomain),
      getReturnsByDateRange(ctx, user._id, today, today, args.shopDomain),
      getReturnsByDateRange(ctx, user._id, yesterday, yesterday, args.shopDomain),
    ]);

    let totalUnitsReturned = 0;
    let todayUnitsReturned = 0;
    let yesterdayUnitsReturned = 0;
    let last10DaysUnits = 0;

    recentReturns.forEach((r: any) => {
      const units = ((r.returnedItems as Array<{ quantity?: number }>) || []).reduce(
        (sum, item) => sum + (item.quantity || 1),
        0
      );
      totalUnitsReturned += units;
      if (r.returnDate === today) {
        todayUnitsReturned += units;
      }
      if (r.returnDate === yesterday) {
        yesterdayUnitsReturned += units;
      }
      if (r.returnDate >= tenDaysAgo) {
        last10DaysUnits += units;
      }
    });

    const last10DaysReturns = recentReturns.filter((r: any) => r.returnDate >= tenDaysAgo);

    return {
      total: recentReturns.length,
      pending: recentReturns.filter((r: any) => r.returnStatus === "pending").length,
      processed: recentReturns.filter((r: any) => r.returnStatus === "processed").length,
      today: todayReturns.length,
      yesterday: yesterdayReturns.length,
      thisWeek: recentReturns.filter((r: any) => r.returnDate >= weekAgo).length,
      thisMonth: recentReturns.filter((r: any) => r.returnDate >= monthAgo).length,
      totalUnitsReturned,
      todayUnitsReturned,
      yesterdayUnitsReturned,
      last10DaysUnits,
      last10DaysOrders: last10DaysReturns.length,
    };
  },
});

export const getDailyHistory = query({
  args: {
    token: v.string(),
    days: v.optional(v.number()),
    shopDomain: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new Error("Sesiune expirată.");
    }

    const daysToFetch = args.days || 10;
    const startDate = new Date(Date.now() - daysToFetch * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const recentReturns = await getReturnsByDateRange(ctx, user._id, startDate, undefined, args.shopDomain);

    const byDate: Record<
      string,
      { date: string; returns: typeof recentReturns; totalUnits: number; totalOrders: number; uniqueSkus: Set<string> }
    > = {};

    recentReturns.forEach((r: any) => {
      if (!byDate[r.returnDate]) {
        byDate[r.returnDate] = { date: r.returnDate, returns: [], totalUnits: 0, totalOrders: 0, uniqueSkus: new Set() };
      }

      byDate[r.returnDate].returns.push(r);
      byDate[r.returnDate].totalOrders++;
      const items = (r.returnedItems as Array<{ sku?: string; quantity?: number }>) || [];
      items.forEach((item) => {
        byDate[r.returnDate].totalUnits += item.quantity || 1;
        if (item.sku) {
          byDate[r.returnDate].uniqueSkus.add(item.sku);
        }
      });
    });

    return Object.values(byDate)
      .map((day) => ({
        date: day.date,
        totalUnits: day.totalUnits,
        totalOrders: day.totalOrders,
        uniqueSkus: day.uniqueSkus.size,
        returns: day.returns.map((r: any) => ({
          _id: r._id,
          awbNumber: r.awbNumber,
          orderNumber: r.orderNumber,
          customerName: r.customerName,
          returnReason: r.returnReason,
          returnStatus: r.returnStatus,
          returnedItems: r.returnedItems,
        })),
      }))
      .sort((a: any, b: any) => b.date.localeCompare(a.date));
  },
});

export const searchOrdersForReturn = query({
  args: {
    token: v.string(),
    searchTerm: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new Error("Sesiune expirată.");
    }
    if (!args.searchTerm || args.searchTerm.length < 2) {
      return [];
    }

    const searchLower = args.searchTerm.toLowerCase().trim();
    const cleanSearch = searchLower.replace(/^#/, "");

    const orderByAwb = await ctx.db
      .query("shopifyOrders")
      .withIndex("by_trackingNumber", (q) => q.eq("trackingNumber", args.searchTerm.trim()))
      .first();
    if (orderByAwb && orderByAwb.userId === user._id) {
      return [orderByAwb];
    }

    const orderByNumber = await ctx.db
      .query("shopifyOrders")
      .withIndex("by_userId_orderNumber", (q) => q.eq("userId", user._id).eq("orderNumber", cleanSearch))
      .first();
    if (orderByNumber) {
      return [orderByNumber];
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);
    const cutoffDateStr = cutoffDate.toISOString().split("T")[0];
    const orders = await ctx.db
      .query("shopifyOrders")
      .withIndex("by_userId_placedOn", (q) => q.eq("userId", user._id).gte("placedOn", cutoffDateStr))
      .order("desc")
      .take(800);

    const matches = orders.filter(
      (o) =>
        o.orderNumber?.toLowerCase() === cleanSearch ||
        o.trackingNumber?.toLowerCase() === cleanSearch ||
        o.orderNumber?.toLowerCase().includes(cleanSearch) ||
        o.trackingNumber?.toLowerCase().includes(cleanSearch)
    );

    return matches.slice(0, 10);
  },
});

export const searchOrder = query({
  args: {
    token: v.string(),
    searchTerm: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new Error("Sesiune expirată.");
    }
    if (!args.searchTerm || args.searchTerm.length < 2) {
      return null;
    }

    const searchLower = args.searchTerm.toLowerCase().trim();
    const cleanSearch = searchLower.replace(/^#/, "");
    const orderByAwb = await ctx.db
      .query("shopifyOrders")
      .withIndex("by_trackingNumber", (q) => q.eq("trackingNumber", args.searchTerm.trim()))
      .first();
    if (orderByAwb && orderByAwb.userId === user._id) {
      return orderByAwb;
    }

    const orderByNumber = await ctx.db
      .query("shopifyOrders")
      .withIndex("by_userId_orderNumber", (q) => q.eq("userId", user._id).eq("orderNumber", cleanSearch))
      .first();
    if (orderByNumber) {
      return orderByNumber;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);
    const cutoffDateStr = cutoffDate.toISOString().split("T")[0];
    const orders = await ctx.db
      .query("shopifyOrders")
      .withIndex("by_userId_placedOn", (q) => q.eq("userId", user._id).gte("placedOn", cutoffDateStr))
      .order("desc")
      .take(800);

    return (
      orders.find(
        (o) =>
          o.orderNumber?.toLowerCase() === searchLower ||
          o.orderNumber?.toLowerCase() === cleanSearch ||
          o.trackingNumber?.toLowerCase() === searchLower ||
          o.orderNumber?.toLowerCase().includes(searchLower) ||
          o.trackingNumber?.toLowerCase().includes(searchLower)
      ) || null
    );
  },
});

export const getById = query({
  args: {
    token: v.string(),
    returnId: v.id("returns"),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new Error("Sesiune expirată.");
    }
    const returnDoc = await ctx.db.get(args.returnId);
    if (!returnDoc || returnDoc.userId !== user._id) {
      return null;
    }
    return returnDoc;
  },
});
