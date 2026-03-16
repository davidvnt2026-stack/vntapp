import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { getReturnsByRange, getValidSession, normalizeSku } from "./shared";

export const aggregateDailySales = mutation({
  args: {
    token: v.string(),
    date: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const session = await getValidSession(ctx, args.token);
    const targetUserId = session.impersonatingUserId || session.userId;
    const date = args.date ?? new Date().toISOString().split("T")[0];

    const orders = await ctx.db
      .query("shopifyOrders")
      .withIndex("by_userId_placedOn", (q) => q.eq("userId", targetUserId).eq("placedOn", date))
      .collect();

    const dateReturns = await getReturnsByRange(ctx, targetUserId, date, date);
    const returnOrders = dateReturns.length;
    const returnRevenue = 0;
    const now = Date.now();

    // --- Global aggregate (no shopDomain) ---
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, o) => sum + o.totalPrice, 0);
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    let totalUnits = 0;
    for (const order of orders) {
      if (!Array.isArray(order.items)) continue;
      for (const item of order.items) {
        totalUnits += (item as { quantity?: number }).quantity ?? 1;
      }
    }

    const existing = await ctx.db
      .query("dailySales")
      .withIndex("by_userId_date", (q) => q.eq("userId", targetUserId).eq("date", date))
      .filter((q) => q.eq(q.field("shopDomain"), undefined))
      .first();

    const globalData = {
      userId: targetUserId,
      date,
      totalOrders,
      totalRevenue,
      averageOrderValue,
      totalUnits,
      returnOrders,
      returnRevenue,
      netRevenue: totalRevenue - returnRevenue,
      updatedAt: now,
    };

    let globalId;
    if (existing) {
      await ctx.db.patch(existing._id, globalData);
      globalId = existing._id;
    } else {
      globalId = await ctx.db.insert("dailySales", { ...globalData, createdAt: now });
    }

    // --- Per-shop aggregates ---
    const ordersByShop = new Map<string, typeof orders>();
    for (const order of orders) {
      const shop = order.shopDomain || "unknown";
      if (!ordersByShop.has(shop)) ordersByShop.set(shop, []);
      ordersByShop.get(shop)!.push(order);
    }

    for (const [shopDomain, shopOrders] of ordersByShop) {
      const shopTotal = shopOrders.length;
      const shopRevenue = shopOrders.reduce((sum, o) => sum + o.totalPrice, 0);
      const shopAvg = shopTotal > 0 ? shopRevenue / shopTotal : 0;
      let shopUnits = 0;
      for (const order of shopOrders) {
        if (!Array.isArray(order.items)) continue;
        for (const item of order.items) {
          shopUnits += (item as { quantity?: number }).quantity ?? 1;
        }
      }

      const existingShop = await ctx.db
        .query("dailySales")
        .withIndex("by_userId_shopDomain_date", (q) =>
          q.eq("userId", targetUserId).eq("shopDomain", shopDomain).eq("date", date)
        )
        .first();

      const shopData = {
        userId: targetUserId,
        date,
        shopDomain,
        totalOrders: shopTotal,
        totalRevenue: shopRevenue,
        averageOrderValue: shopAvg,
        totalUnits: shopUnits,
        returnOrders: 0,
        returnRevenue: 0,
        netRevenue: shopRevenue,
        updatedAt: now,
      };

      if (existingShop) {
        await ctx.db.patch(existingShop._id, shopData);
      } else {
        await ctx.db.insert("dailySales", { ...shopData, createdAt: now });
      }
    }

    return globalId;
  },
});

export const refreshSkuMetrics = mutation({
  args: {
    token: v.string(),
    period: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await getValidSession(ctx, args.token);
    const targetUserId = session.impersonatingUserId || session.userId;

    const skus = await ctx.db.query("skus").withIndex("by_userId", (q) => q.eq("userId", targetUserId)).collect();

    let periodOrders;
    if (args.period.length === 7) {
      const monthStart = `${args.period}-01`;
      const [yearStr, monthStr] = args.period.split("-");
      const yr = parseInt(yearStr);
      const mo = parseInt(monthStr);
      const lastDay = new Date(yr, mo, 0).getDate();
      const monthEnd = `${args.period}-${String(lastDay).padStart(2, "0")}`;
      periodOrders = await ctx.db
        .query("shopifyOrders")
        .withIndex("by_userId_placedOn", (q) =>
          q.eq("userId", targetUserId).gte("placedOn", monthStart).lte("placedOn", monthEnd)
        )
        .collect();
    } else {
      const yearStart = `${args.period}-01-01`;
      const yearEnd = `${args.period}-12-31`;
      periodOrders = await ctx.db
        .query("shopifyOrders")
        .withIndex("by_userId_placedOn", (q) =>
          q.eq("userId", targetUserId).gte("placedOn", yearStart).lte("placedOn", yearEnd)
        )
        .collect();
    }

    const existingMetrics = await ctx.db
      .query("skuMetrics")
      .withIndex("by_userId_period", (q) => q.eq("userId", targetUserId).eq("period", args.period))
      .collect();
    for (const m of existingMetrics) {
      await ctx.db.delete(m._id);
    }

    const activeSkus = skus.filter((s) => s.isActive);
    const activeSkuByNormalized = new Map<string, string>();
    for (const sku of activeSkus) {
      const normalized = normalizeSku(sku.sku);
      if (normalized) {
        activeSkuByNormalized.set(normalized, sku.sku);
      }
    }

    let periodReturns;
    if (args.period.length === 7) {
      const monthStart = `${args.period}-01`;
      const [yearStr, monthStr] = args.period.split("-");
      const yr = parseInt(yearStr);
      const mo = parseInt(monthStr);
      const lastDay = new Date(yr, mo, 0).getDate();
      const monthEnd = `${args.period}-${String(lastDay).padStart(2, "0")}`;
      periodReturns = await getReturnsByRange(ctx, targetUserId, monthStart, monthEnd);
    } else {
      const yearStart = `${args.period}-01-01`;
      const yearEnd = `${args.period}-12-31`;
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
      { totalOrders: number; totalUnits: number; orderReturns: number; returnUnits: number; totalRevenue: number }
    > = {};
    for (const sku of activeSkus) {
      skuMetricsMap[sku.sku] = {
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

    const now = Date.now();
    let created = 0;
    for (const [sku, metrics] of Object.entries(skuMetricsMap)) {
      const skuRecord = activeSkus.find((s) => s.sku === sku);
      const returnRate = metrics.totalOrders > 0 ? (metrics.orderReturns / metrics.totalOrders) * 100 : 0;

      await ctx.db.insert("skuMetrics", {
        userId: targetUserId,
        period: args.period,
        sku,
        currentStock: skuRecord?.currentStock ?? 0,
        totalOrders: metrics.totalOrders,
        totalUnits: metrics.totalUnits,
        orderReturns: metrics.orderReturns,
        returnUnits: metrics.returnUnits,
        totalRevenue: metrics.totalRevenue,
        returnRate,
        createdAt: now,
        updatedAt: now,
      });
      created++;
    }

    return { created };
  },
});
