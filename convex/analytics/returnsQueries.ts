import { v } from "convex/values";
import { query } from "../_generated/server";
import { formatDisplayDate, getReturnsByRange, getValidSession, toDateOnly } from "./shared";

export const getTopReturnedProducts = query({
  args: {
    token: v.string(),
    days: v.optional(v.number()),
    allTime: v.optional(v.boolean()),
    limit: v.optional(v.number()),
    shopDomain: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const session = await getValidSession(ctx, args.token);
    const targetUserId = session.impersonatingUserId || session.userId;

    const isAllTime = args.allTime === true;
    const daysToFetch = args.days ?? 30;
    const limitCount = args.limit ?? 10;
    let cutoffDateStr = "0000-01-01";
    if (!isAllTime) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToFetch);
      cutoffDateStr = toDateOnly(cutoffDate);
    }
    const scanCap = isAllTime ? 3000 : 1500;

    const filteredReturns = await getReturnsByRange(
      ctx,
      targetUserId,
      cutoffDateStr,
      undefined,
      args.shopDomain,
      scanCap
    );

    const skuReturns: Record<string, { sku: string; name: string; quantity: number; returns: number }> = {};
    for (const returnDoc of filteredReturns) {
      if (!Array.isArray(returnDoc.returnedItems)) {
        continue;
      }

      for (const item of returnDoc.returnedItems as Array<{ sku?: string; name?: string; quantity?: number }>) {
        const sku = item.sku || item.name || "Unknown";
        const name = item.name || item.sku || "Unknown";
        const quantity = item.quantity || 1;

        if (!skuReturns[sku]) {
          skuReturns[sku] = {
            sku,
            name,
            quantity: 0,
            returns: 0,
          };
        }

        skuReturns[sku].quantity += quantity;
        skuReturns[sku].returns += 1;
      }
    }

    const topReturns = Object.values(skuReturns).sort((a, b) => b.quantity - a.quantity).slice(0, limitCount);
    return {
      products: topReturns,
      period: isAllTime ? "all" : daysToFetch,
      totalReturns: filteredReturns.length,
      totalUnits: Object.values(skuReturns).reduce((sum, p) => sum + p.quantity, 0),
    };
  },
});

export const getReturnsAnalysis = query({
  args: {
    token: v.string(),
    days: v.optional(v.number()),
    allTime: v.optional(v.boolean()),
    shopDomain: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const session = await getValidSession(ctx, args.token);
    const targetUserId = session.impersonatingUserId || session.userId;

    const isAllTime = args.allTime === true;
    const daysToFetch = args.days ?? 30;
    let cutoffDateStr = "0000-01-01";
    if (!isAllTime) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToFetch);
      cutoffDateStr = toDateOnly(cutoffDate);
    }
    const scanCap = isAllTime ? 3000 : 1500;
    const maxDailySalesRows = isAllTime ? 730 : Math.min(Math.max(daysToFetch + 30, 60), 180);

    // Get order counts from pre-aggregated dailySales (global or per-shop)
    const dailyOrders: Record<string, number> = {};
    let totalOrders = 0;
    const salesRows = args.shopDomain
      ? await ctx.db
          .query("dailySales")
          .withIndex("by_userId_shopDomain_date", (q: any) =>
            q.eq("userId", targetUserId).eq("shopDomain", args.shopDomain!).gte("date", cutoffDateStr)
          )
          .order("desc")
          .take(maxDailySalesRows)
      : await ctx.db
          .query("dailySales")
          .withIndex("by_userId_date", (q: any) => q.eq("userId", targetUserId).gte("date", cutoffDateStr))
          .filter((q: any) => q.eq(q.field("shopDomain"), undefined))
          .order("desc")
          .take(maxDailySalesRows);

    if (salesRows.length > 0) {
      for (const row of salesRows) {
        dailyOrders[row.date] = row.totalOrders || 0;
        totalOrders += row.totalOrders || 0;
      }
    } else if (args.shopDomain) {
      // Fallback: scan raw orders only when no dailySales data exists yet
      const filteredOrders = await ctx.db
        .query("shopifyOrders")
        .withIndex("by_userId_shopDomain_placedOn", (q) =>
          q.eq("userId", targetUserId).eq("shopDomain", args.shopDomain!).gte("placedOn", cutoffDateStr)
        )
        .order("desc")
        .collect();
      const validOrders = filteredOrders.filter((o) => o.status !== "cancelled");
      for (const order of validOrders) {
        dailyOrders[order.placedOn] = (dailyOrders[order.placedOn] || 0) + 1;
      }
      totalOrders = validOrders.length;
    }

    const filteredReturns = await getReturnsByRange(
      ctx,
      targetUserId,
      cutoffDateStr,
      undefined,
      args.shopDomain,
      scanCap
    );

    const dailyReturns: Record<string, { date: string; returns: number; units: number }> = {};
    for (const returnDoc of filteredReturns) {
      if (!dailyReturns[returnDoc.returnDate]) {
        dailyReturns[returnDoc.returnDate] = {
          date: returnDoc.returnDate,
          returns: 0,
          units: 0,
        };
      }

      dailyReturns[returnDoc.returnDate].returns++;
      if (Array.isArray(returnDoc.returnedItems)) {
        for (const item of returnDoc.returnedItems as Array<{ quantity?: number }>) {
          dailyReturns[returnDoc.returnDate].units += item.quantity || 1;
        }
      }
    }

    const chartData = Object.entries(dailyReturns)
      .map(([date, data]) => ({
        date,
        displayDate: formatDisplayDate(date),
        returns: data.returns,
        units: data.units,
        orders: dailyOrders[date] || 0,
        returnRate: dailyOrders[date] ? Math.round((data.returns / dailyOrders[date]) * 100 * 10) / 10 : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const totalReturns = filteredReturns.length;
    const totalUnits = Object.values(dailyReturns).reduce((sum, d) => sum + d.units, 0);
    const overallReturnRate = totalOrders > 0 ? Math.round((totalReturns / totalOrders) * 100 * 10) / 10 : 0;

    return {
      chartData,
      totals: {
        totalReturns,
        totalOrders,
        totalUnits,
        returnRate: overallReturnRate,
      },
      period: isAllTime ? "all" : daysToFetch,
    };
  },
});
