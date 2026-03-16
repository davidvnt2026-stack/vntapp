import { v } from "convex/values";
import { query } from "../_generated/server";
import { formatDisplayDate, getValidSession, toDateOnly } from "./shared";

export const getDailySales = query({
  args: {
    token: v.string(),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await getValidSession(ctx, args.token);

    return ctx.db
      .query("dailySales")
      .withIndex("by_userId_date", (q) =>
        q.eq("userId", session.impersonatingUserId || session.userId)
          .gte("date", args.startDate)
          .lte("date", args.endDate)
      )
      .collect();
  },
});

export const getSalesChartData = query({
  args: {
    token: v.string(),
    days: v.optional(v.number()),
    shopDomain: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const session = await getValidSession(ctx, args.token);
    const targetUserId = session.impersonatingUserId || session.userId;

    const daysToFetch = args.days ?? 7;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysToFetch + 1);

    const startDateStr = toDateOnly(startDate);
    const endDateStr = toDateOnly(endDate);

    // Try pre-aggregated dailySales first (global or per-shop)
    const salesRows = args.shopDomain
      ? await ctx.db
          .query("dailySales")
          .withIndex("by_userId_shopDomain_date", (q: any) =>
            q.eq("userId", targetUserId).eq("shopDomain", args.shopDomain!).gte("date", startDateStr).lte("date", endDateStr)
          )
          .collect()
      : await ctx.db
          .query("dailySales")
          .withIndex("by_userId_date", (q: any) =>
            q.eq("userId", targetUserId).gte("date", startDateStr).lte("date", endDateStr)
          )
          .filter((q: any) => q.eq(q.field("shopDomain"), undefined))
          .collect();

    if (salesRows.length > 0) {
      const chartData = salesRows
        .map((row: any) => ({
          date: row.date,
          displayDate: formatDisplayDate(row.date),
          orders: row.totalOrders || 0,
          revenue: row.totalRevenue || 0,
          revenueByCurrency: { RON: row.totalRevenue || 0 },
        }))
        .sort((a: any, b: any) => a.date.localeCompare(b.date));

      const totalOrders = chartData.reduce((sum, d) => sum + d.orders, 0);
      const totalRevenue = chartData.reduce((sum, d) => sum + d.revenue, 0);

      return {
        chartData,
        totals: {
          totalOrders,
          totalRevenue,
          currency: "RON",
          totalsByCurrency: { RON: totalRevenue },
        },
      };
    }

    // Fallback: scan raw orders (only when no dailySales data exists yet)
    const filteredOrders = args.shopDomain
      ? await ctx.db
          .query("shopifyOrders")
          .withIndex("by_userId_shopDomain_placedOn", (q) =>
            q.eq("userId", targetUserId)
              .eq("shopDomain", args.shopDomain!)
              .gte("placedOn", startDateStr)
              .lte("placedOn", endDateStr)
          )
          .order("desc")
          .collect()
      : await ctx.db
          .query("shopifyOrders")
          .withIndex("by_userId_placedOn", (q) =>
            q.eq("userId", targetUserId).gte("placedOn", startDateStr).lte("placedOn", endDateStr)
          )
          .order("desc")
          .collect();

    const currencyCounts: Record<string, number> = {};
    for (const order of filteredOrders) {
      const currency = order.currency || "RON";
      currencyCounts[currency] = (currencyCounts[currency] || 0) + 1;
    }
    const primaryCurrency = Object.entries(currencyCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "RON";

    const dailyData: Record<string, { orders: number; revenue: number; revenueByCurrency: Record<string, number> }> = {};
    for (const order of filteredOrders) {
      if (!dailyData[order.placedOn]) {
        dailyData[order.placedOn] = { orders: 0, revenue: 0, revenueByCurrency: {} };
      }
      dailyData[order.placedOn].orders++;

      const orderCurrency = order.currency || "RON";
      dailyData[order.placedOn].revenueByCurrency[orderCurrency] =
        (dailyData[order.placedOn].revenueByCurrency[orderCurrency] || 0) + order.totalPrice;

      if (orderCurrency === primaryCurrency) {
        dailyData[order.placedOn].revenue += order.totalPrice;
      }
    }

    const chartData = Object.entries(dailyData)
      .map(([date, data]) => ({
        date,
        displayDate: formatDisplayDate(date),
        orders: data.orders,
        revenue: data.revenue,
        revenueByCurrency: data.revenueByCurrency,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const totalOrders = chartData.reduce((sum, d) => sum + d.orders, 0);
    const totalRevenue = chartData.reduce((sum, d) => sum + d.revenue, 0);
    const totalsByCurrency: Record<string, number> = {};

    for (const day of chartData) {
      for (const [currency, amount] of Object.entries(day.revenueByCurrency)) {
        totalsByCurrency[currency] = (totalsByCurrency[currency] || 0) + amount;
      }
    }

    return {
      chartData,
      totals: {
        totalOrders,
        totalRevenue,
        currency: primaryCurrency,
        totalsByCurrency,
      },
    };
  },
});

export const getDashboardOverview = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await getValidSession(ctx, args.token);
    const targetUserId = session.impersonatingUserId || session.userId;
    const today = toDateOnly(new Date());
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = toDateOnly(sevenDaysAgo);

    const weekOrders = await ctx.db
      .query("shopifyOrders")
      .withIndex("by_userId_placedOn", (q) => q.eq("userId", targetUserId).gte("placedOn", sevenDaysAgoStr))
      .collect();

    const todayOrders = weekOrders.filter((o) => o.placedOn === today);

    const skus = await ctx.db
      .query("skus")
      .withIndex("by_userId_active", (q) => q.eq("userId", targetUserId).eq("isActive", true))
      .collect();
    const lowStockSkus = skus.filter((s) => s.currentStock < s.lowStockThreshold);

    const pendingPickingLists = await ctx.db
      .query("pickingLists")
      .withIndex("by_userId_status", (q) => q.eq("userId", targetUserId).eq("status", "pending"))
      .collect();

    const recentAwbs = await ctx.db
      .query("awbTracking")
      .withIndex("by_userId", (q) => q.eq("userId", targetUserId))
      .order("desc")
      .take(200);

    const weekAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentAwbCount = recentAwbs.filter((a) => a.createdAt >= weekAgoMs).length;

    return {
      todayStats: {
        orders: todayOrders.length,
        revenue: todayOrders.reduce((sum, o) => sum + o.totalPrice, 0),
      },
      weekStats: {
        orders: weekOrders.length,
        revenue: weekOrders.reduce((sum, o) => sum + o.totalPrice, 0),
      },
      lowStockAlerts: lowStockSkus.map((s) => ({
        sku: s.sku,
        name: s.name,
        currentStock: s.currentStock,
        threshold: s.lowStockThreshold,
      })),
      pendingPickingLists: pendingPickingLists.length,
      recentShipments: recentAwbCount,
    };
  },
});
