import { v } from "convex/values";
import { query } from "../_generated/server";
import { getValidSession, toDateOnly } from "./shared";

export const getTopSellingProducts = query({
  args: {
    token: v.string(),
    days: v.optional(v.number()),
    limit: v.optional(v.number()),
    shopDomain: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const session = await getValidSession(ctx, args.token);
    const targetUserId = session.impersonatingUserId || session.userId;

    const daysToFetch = args.days ?? 30;
    const limitCount = args.limit ?? 10;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToFetch);
    const cutoffDateStr = toDateOnly(cutoffDate);
    const todayStr = toDateOnly(new Date());

    if (!args.shopDomain) {
      const dailyRows = await ctx.db
        .query("dailyStockRecords")
        .withIndex("by_userId_date_sku", (q: any) =>
          q.eq("userId", targetUserId).gte("date", cutoffDateStr).lte("date", todayStr)
        )
        .collect();

      if (dailyRows.length > 0) {
        const skuSales: Record<string, { sku: string; name: string; quantity: number; revenue: number; orders: number }> = {};
        for (const row of dailyRows) {
          if (!skuSales[row.sku]) {
            skuSales[row.sku] = {
              sku: row.sku,
              name: row.sku,
              quantity: 0,
              revenue: 0,
              orders: 0,
            };
          }
          skuSales[row.sku].quantity += row.outboundUnits || 0;
          skuSales[row.sku].revenue += row.revenue || 0;
          skuSales[row.sku].orders += row.orders || 0;
        }

        const sortedProducts = Object.values(skuSales).sort((a, b) => b.quantity - a.quantity);
        const topProducts = sortedProducts.slice(0, limitCount);

        // Resolve names only for top SKUs, instead of loading all SKU documents every call.
        const topSkuRows = await Promise.all(
          topProducts.map((product) =>
            ctx.db
              .query("skus")
              .withIndex("by_userId_sku", (q: any) => q.eq("userId", targetUserId).eq("sku", product.sku))
              .first()
          )
        );
        const topSkuNameByCode = new Map<string, string>();
        for (const skuRow of topSkuRows) {
          if (skuRow?.sku) {
            topSkuNameByCode.set(skuRow.sku, skuRow.name || skuRow.sku);
          }
        }

        for (const product of topProducts) {
          product.name = topSkuNameByCode.get(product.sku) || product.sku;
        }

        return {
          products: topProducts,
          period: daysToFetch,
          totalProducts: Object.keys(skuSales).length,
        };
      }
    }

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

    const filteredOrders = orders.filter((o) => o.status !== "cancelled");
    const skuSales: Record<string, { sku: string; name: string; quantity: number; revenue: number; orders: number }> = {};
    for (const order of filteredOrders) {
      if (!Array.isArray(order.items)) {
        continue;
      }
      for (const item of order.items as Array<{ sku?: string; name?: string; quantity?: number; price?: number }>) {
        const sku = item.sku || item.name || "Unknown";
        const name = item.name || item.sku || "Unknown";
        const quantity = item.quantity || 1;
        const price = item.price || 0;

        if (!skuSales[sku]) {
          skuSales[sku] = { sku, name, quantity: 0, revenue: 0, orders: 0 };
        }

        skuSales[sku].quantity += quantity;
        skuSales[sku].revenue += quantity * price;
        skuSales[sku].orders += 1;
      }
    }

    const topProducts = Object.values(skuSales).sort((a, b) => b.quantity - a.quantity).slice(0, limitCount);
    return {
      products: topProducts,
      period: daysToFetch,
      totalProducts: Object.keys(skuSales).length,
    };
  },
});
