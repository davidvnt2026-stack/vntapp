import { v } from "convex/values";
import { query } from "../_generated/server";
import { getReturnsByRange, getValidSession, normalizeSku } from "./shared";

export const getSkuMetrics = query({
  args: {
    token: v.string(),
    period: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const session = await getValidSession(ctx, args.token);

    const period = args.period ?? new Date().getFullYear().toString();
    const targetUserId = session.impersonatingUserId || session.userId;

    const cachedMetrics = await ctx.db
      .query("skuMetrics")
      .withIndex("by_userId_period", (q: any) => q.eq("userId", targetUserId).eq("period", period))
      .collect();
    if (cachedMetrics.length > 0) {
      return cachedMetrics.sort((a: any, b: any) => b.totalOrders - a.totalOrders);
    }

    const skus = await ctx.db.query("skus").withIndex("by_userId", (q) => q.eq("userId", targetUserId)).collect();
    const activeSkus = skus.filter((s) => s.isActive);

    const activeSkuByNormalized = new Map<string, string>();
    for (const sku of activeSkus) {
      const normalized = normalizeSku(sku.sku);
      if (normalized) {
        activeSkuByNormalized.set(normalized, sku.sku);
      }
    }

    const maxOrdersToScan = period.length === 7 ? 2500 : 6000;
    let periodOrders;
    if (period.length === 7) {
      const monthStart = `${period}-01`;
      const [yearStr, monthStr] = period.split("-");
      const yr = parseInt(yearStr);
      const mo = parseInt(monthStr);
      const lastDay = new Date(yr, mo, 0).getDate();
      const monthEnd = `${period}-${String(lastDay).padStart(2, "0")}`;
      periodOrders = await ctx.db
        .query("shopifyOrders")
        .withIndex("by_userId_placedOn", (q) =>
          q.eq("userId", targetUserId).gte("placedOn", monthStart).lte("placedOn", monthEnd)
        )
        .order("desc")
        .take(maxOrdersToScan);
    } else {
      const yearStart = `${period}-01-01`;
      const yearEnd = `${period}-12-31`;
      periodOrders = await ctx.db
        .query("shopifyOrders")
        .withIndex("by_userId_placedOn", (q) =>
          q.eq("userId", targetUserId).gte("placedOn", yearStart).lte("placedOn", yearEnd)
        )
        .order("desc")
        .take(maxOrdersToScan);
    }

    let periodReturns;
    if (period.length === 7) {
      const monthStart = `${period}-01`;
      const [yearStr, monthStr] = period.split("-");
      const yr = parseInt(yearStr);
      const mo = parseInt(monthStr);
      const lastDay = new Date(yr, mo, 0).getDate();
      const monthEnd = `${period}-${String(lastDay).padStart(2, "0")}`;
      periodReturns = await getReturnsByRange(ctx, targetUserId, monthStart, monthEnd);
    } else {
      const yearStart = `${period}-01-01`;
      const yearEnd = `${period}-12-31`;
      periodReturns = await getReturnsByRange(ctx, targetUserId, yearStart, yearEnd);
    }

    const skuReturnUnitsMap: Record<string, number> = {};
    const skuOrderReturnsMap: Record<string, number> = {};
    for (const ret of periodReturns) {
      const items = (ret.returnedItems as Array<{ sku?: string; quantity?: number }>) || [];
      const skusInReturn = new Set<string>();
      for (const item of items) {
        const canonicalSku = activeSkuByNormalized.get(normalizeSku(item.sku));
        if (canonicalSku) {
          skuReturnUnitsMap[canonicalSku] = (skuReturnUnitsMap[canonicalSku] || 0) + (item.quantity || 1);
          skusInReturn.add(canonicalSku);
        }
      }
      for (const sku of skusInReturn) {
        skuOrderReturnsMap[sku] = (skuOrderReturnsMap[sku] || 0) + 1;
      }
    }

    const skuMetricsMap: Record<
      string,
      {
        sku: string;
        currentStock: number;
        totalOrders: number;
        totalUnits: number;
        orderReturns: number;
        returnUnits: number;
        totalRevenue: number;
      }
    > = {};

    for (const sku of activeSkus) {
      skuMetricsMap[sku.sku] = {
        sku: sku.sku,
        currentStock: sku.currentStock,
        totalOrders: 0,
        totalUnits: 0,
        orderReturns: skuOrderReturnsMap[sku.sku] || 0,
        returnUnits: skuReturnUnitsMap[sku.sku] || 0,
        totalRevenue: 0,
      };
    }

    for (const order of periodOrders) {
      if (order.status === "cancelled" || !Array.isArray(order.items)) {
        continue;
      }

      const skusInOrder = new Set<string>();
      for (const item of order.items as Array<{ sku?: string; quantity?: number; price?: number }>) {
        const canonicalSku = activeSkuByNormalized.get(normalizeSku(item.sku));
        if (!canonicalSku || !skuMetricsMap[canonicalSku]) {
          continue;
        }

        const qty = item.quantity || 1;
        skuMetricsMap[canonicalSku].totalUnits += qty;
        skuMetricsMap[canonicalSku].totalRevenue += qty * (item.price || 0);
        skusInOrder.add(canonicalSku);
      }

      for (const sku of skusInOrder) {
        skuMetricsMap[sku].totalOrders += 1;
      }
    }

    const result = Object.values(skuMetricsMap).map((m) => ({
      ...m,
      returnRate: m.totalOrders > 0 ? (m.orderReturns / m.totalOrders) * 100 : 0,
    }));
    result.sort((a, b) => b.totalOrders - a.totalOrders);
    return result;
  },
});
