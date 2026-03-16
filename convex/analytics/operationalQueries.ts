import { v } from "convex/values";
import { query } from "../_generated/server";
import { formatDisplayDate, getValidSession, toDateOnly } from "./shared";

export const getStatusDistribution = query({
  args: {
    token: v.string(),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await getValidSession(ctx, args.token);

    const filteredOrders = await ctx.db
      .query("shopifyOrders")
      .withIndex("by_userId_placedOn", (q) =>
        q.eq("userId", session.impersonatingUserId || session.userId)
          .gte("placedOn", args.startDate)
          .lte("placedOn", args.endDate)
      )
      .order("desc")
      .collect();

    const statusCounts: Record<string, number> = {};
    for (const order of filteredOrders) {
      const status = order.fulfillmentStatus || order.status || "unknown";
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    }

    const distribution = Object.entries(statusCounts)
      .map(([status, count]) => ({
        status,
        count,
        percentage: filteredOrders.length > 0 ? Math.round((count / filteredOrders.length) * 100 * 10) / 10 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      total: filteredOrders.length,
      distribution,
    };
  },
});

export const getPickingListStats = query({
  args: {
    token: v.string(),
    period: v.optional(v.string()),
    shopDomain: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const session = await getValidSession(ctx, args.token);
    const targetUserId = session.impersonatingUserId || session.userId;

    const period = args.period ?? "30d";
    let daysBack = 30;
    if (period === "7d") {
      daysBack = 7;
    } else if (period === "3m") {
      daysBack = 90;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);
    const cutoffDateStr = toDateOnly(cutoffDate);
    const todayStr = toDateOnly(new Date());

    // Try pre-aggregated dailySales first (global or per-shop)
    const salesRows = args.shopDomain
      ? await ctx.db
          .query("dailySales")
          .withIndex("by_userId_shopDomain_date", (q: any) =>
            q.eq("userId", targetUserId).eq("shopDomain", args.shopDomain!).gte("date", cutoffDateStr).lte("date", todayStr)
          )
          .collect()
      : await ctx.db
          .query("dailySales")
          .withIndex("by_userId_date", (q: any) =>
            q.eq("userId", targetUserId).gte("date", cutoffDateStr).lte("date", todayStr)
          )
          .filter((q: any) => q.eq(q.field("shopDomain"), undefined))
          .collect();

    if (salesRows.length > 0) {
      const chartData = salesRows
        .map((row: any) => ({
          date: row.date,
          displayDate: formatDisplayDate(row.date),
          pickingLists: 1,
          orders: row.totalOrders || 0,
        }))
        .sort((a: any, b: any) => a.date.localeCompare(b.date));

      return {
        totalOrders: salesRows.reduce((sum: number, r: any) => sum + (r.totalOrders || 0), 0),
        totalPickingLists: chartData.length,
        chartData,
      };
    }

    // Fallback: scan raw orders (only when no dailySales data exists yet)
    const orders = args.shopDomain
      ? await ctx.db
          .query("shopifyOrders")
          .withIndex("by_userId_shopDomain_placedOn", (q) =>
            q.eq("userId", targetUserId).eq("shopDomain", args.shopDomain!).gte("placedOn", cutoffDateStr)
          )
          .order("desc")
          .collect()
      : await ctx.db
          .query("shopifyOrders")
          .withIndex("by_userId_placedOn", (q) => q.eq("userId", targetUserId).gte("placedOn", cutoffDateStr))
          .order("desc")
          .collect();

    const dailyData: Record<string, { orders: number }> = {};
    for (const order of orders) {
      if (!dailyData[order.placedOn]) {
        dailyData[order.placedOn] = { orders: 0 };
      }
      dailyData[order.placedOn].orders++;
    }

    const chartData = Object.entries(dailyData)
      .map(([date, data]) => ({
        date,
        displayDate: formatDisplayDate(date),
        pickingLists: 1,
        orders: data.orders,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      totalOrders: orders.length,
      totalPickingLists: chartData.length,
      chartData,
    };
  },
});
