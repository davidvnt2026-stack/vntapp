import { mutation, query, internalQuery } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { getRealUserFromToken } from "./auth";

// ============================================
// BILLING RATES (price per order per user)
// ============================================

// Get billing rate for a specific user
export const getBillingRate = query({
  args: {
    token: v.string(),
    userId: v.id("profiles"),
  },
  handler: async (ctx, args) => {
    const admin = await getRealUserFromToken(ctx, args.token);
    if (!admin || !admin.isAdmin) {
      throw new ConvexError("Doar adminii pot accesa facturarea.");
    }

    return await ctx.db
      .query("userBillingRates")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();
  },
});

// Set / update billing rate for a user
export const setBillingRate = mutation({
  args: {
    token: v.string(),
    userId: v.id("profiles"),
    pricePerOrder: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await getRealUserFromToken(ctx, args.token);
    if (!admin || !admin.isAdmin) {
      throw new ConvexError("Doar adminii pot seta tarifele.");
    }

    const existing = await ctx.db
      .query("userBillingRates")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        pricePerOrder: args.pricePerOrder,
        notes: args.notes,
        updatedAt: now,
      });
      return existing._id;
    } else {
      return await ctx.db.insert("userBillingRates", {
        userId: args.userId,
        pricePerOrder: args.pricePerOrder,
        notes: args.notes,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

// ============================================
// PACKAGING RATES (extra cost per SKU per user)
// ============================================

// Get all packaging rates for a user
export const getPackagingRates = query({
  args: {
    token: v.string(),
    userId: v.id("profiles"),
  },
  handler: async (ctx, args) => {
    const admin = await getRealUserFromToken(ctx, args.token);
    if (!admin || !admin.isAdmin) {
      throw new ConvexError("Doar adminii pot accesa facturarea.");
    }

    return await ctx.db
      .query("userPackagingRates")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

// Add or update a packaging rate for a user + SKU
export const setPackagingRate = mutation({
  args: {
    token: v.string(),
    userId: v.id("profiles"),
    sku: v.string(),
    packagingType: v.string(),
    packagingCost: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await getRealUserFromToken(ctx, args.token);
    if (!admin || !admin.isAdmin) {
      throw new ConvexError("Doar adminii pot seta tarifele.");
    }

    // Check if a rate already exists for this user + sku
    const existing = await ctx.db
      .query("userPackagingRates")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();

    const match = existing.find(
      (r) => r.sku === args.sku || (!r.sku && !args.sku)
    );

    const now = Date.now();

    if (match) {
      await ctx.db.patch(match._id, {
        packagingType: args.packagingType,
        packagingCost: args.packagingCost,
        notes: args.notes,
        updatedAt: now,
      });
      return match._id;
    } else {
      return await ctx.db.insert("userPackagingRates", {
        userId: args.userId,
        sku: args.sku || undefined,
        packagingType: args.packagingType,
        packagingCost: args.packagingCost,
        quantityThreshold: 0,
        notes: args.notes,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

// Delete a packaging rate
export const deletePackagingRate = mutation({
  args: {
    token: v.string(),
    rateId: v.id("userPackagingRates"),
  },
  handler: async (ctx, args) => {
    const admin = await getRealUserFromToken(ctx, args.token);
    if (!admin || !admin.isAdmin) {
      throw new ConvexError("Doar adminii pot șterge tarifele.");
    }

    await ctx.db.delete(args.rateId);
    return { success: true };
  },
});

function extractUniqueSkuEntries(order: any): Array<{ sku: string; name: string }> {
  const items = Array.isArray(order?.items)
    ? (order.items as Array<{ sku?: string; name?: string }>)
    : [];
  const skuMap = new Map<string, string>();

  for (const item of items) {
    const sku = (item.sku || "").trim();
    if (!sku) continue;
    if (!skuMap.has(sku)) {
      skuMap.set(sku, (item.name || "").trim() || sku);
    }
  }

  return Array.from(skuMap.entries()).map(([sku, name]) => ({ sku, name }));
}

export const rebuildWorkedInvoiceAggregates = mutation({
  args: {
    token: v.string(),
    userId: v.id("profiles"),
  },
  handler: async (ctx, args) => {
    const admin = await getRealUserFromToken(ctx, args.token);
    if (!admin || !admin.isAdmin) {
      throw new ConvexError("Doar adminii pot reconstrui agregatele de facturare.");
    }

    const now = Date.now();

    const existingSnapshots = await ctx.db
      .query("invoiceWorkedOrderSnapshots")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const row of existingSnapshots) {
      await ctx.db.delete(row._id);
    }

    const existingDailyTotals = await ctx.db
      .query("invoiceWorkedDailyTotals")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const row of existingDailyTotals) {
      await ctx.db.delete(row._id);
    }

    const existingDailySku = await ctx.db
      .query("invoiceWorkedDailySku")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const row of existingDailySku) {
      await ctx.db.delete(row._id);
    }

    const workedOrders = await ctx.db
      .query("shopifyOrders")
      .withIndex("by_userId_isWorked_placedOn", (q: any) =>
        q.eq("userId", args.userId).eq("isWorked", true)
      )
      .collect();

    const dailyTotalsMap = new Map<string, number>();
    const dailySkuMap = new Map<string, { date: string; sku: string; skuName: string; orderCount: number }>();

    for (const order of workedOrders) {
      const date = order.placedOn;
      const skus = extractUniqueSkuEntries(order);

      await ctx.db.insert("invoiceWorkedOrderSnapshots", {
        userId: args.userId,
        orderId: order._id,
        placedOn: date,
        skus,
        createdAt: now,
        updatedAt: now,
      });

      dailyTotalsMap.set(date, (dailyTotalsMap.get(date) || 0) + 1);

      for (const skuEntry of skus) {
        const key = `${date}::${skuEntry.sku}`;
        const existing = dailySkuMap.get(key);
        if (existing) {
          existing.orderCount += 1;
          if (!existing.skuName) existing.skuName = skuEntry.name;
        } else {
          dailySkuMap.set(key, {
            date,
            sku: skuEntry.sku,
            skuName: skuEntry.name,
            orderCount: 1,
          });
        }
      }
    }

    for (const [date, workedOrdersCount] of dailyTotalsMap.entries()) {
      await ctx.db.insert("invoiceWorkedDailyTotals", {
        userId: args.userId,
        date,
        workedOrders: workedOrdersCount,
        createdAt: now,
        updatedAt: now,
      });
    }

    for (const row of dailySkuMap.values()) {
      await ctx.db.insert("invoiceWorkedDailySku", {
        userId: args.userId,
        date: row.date,
        sku: row.sku,
        skuName: row.skuName || row.sku,
        orderCount: row.orderCount,
        createdAt: now,
        updatedAt: now,
      });
    }

    const aggregationState = await ctx.db
      .query("invoiceWorkedAggregationState")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();

    if (aggregationState) {
      await ctx.db.patch(aggregationState._id, {
        initializedAt: now,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("invoiceWorkedAggregationState", {
        userId: args.userId,
        initializedAt: now,
        updatedAt: now,
      });
    }

    return {
      success: true,
      workedOrders: workedOrders.length,
      dailyTotalsRows: dailyTotalsMap.size,
      dailySkuRows: dailySkuMap.size,
    };
  },
});

// ============================================
// INVOICE CALCULATION
// ============================================

// Calculate invoice for a user in a given month
// Aggregates across ALL stores for that user
// Internal-only: called from invoiceSnapshots action, never subscribed to reactively.
export const calculateInvoice = internalQuery({
  args: {
    token: v.string(),
    userId: v.id("profiles"),
    month: v.optional(v.string()), // Backward-compat ("YYYY-MM")
    startDate: v.optional(v.string()), // "YYYY-MM-DD" (inclusive)
    endDate: v.optional(v.string()), // "YYYY-MM-DD" (inclusive)
  },
  handler: async (ctx, args) => {
    const admin = await getRealUserFromToken(ctx, args.token);
    if (!admin || !admin.isAdmin) {
      throw new ConvexError("Doar adminii pot accesa facturarea.");
    }

    // Get user profile
    const userProfile = await ctx.db.get(args.userId);
    if (!userProfile) {
      throw new ConvexError("Utilizatorul nu a fost găsit.");
    }

    // Get billing rate
    const billingRate = await ctx.db
      .query("userBillingRates")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();

    const pricePerOrder = billingRate?.pricePerOrder ?? 0;

    // Get packaging rates for this user
    const packagingRates = await ctx.db
      .query("userPackagingRates")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();

    // Build a map: SKU -> { packagingType, packagingCost }
    const skuExtraMap = new Map<
      string,
      { packagingType: string; packagingCost: number }
    >();
    for (const rate of packagingRates) {
      if (rate.sku) {
        skuExtraMap.set(rate.sku, {
          packagingType: rate.packagingType,
          packagingCost: rate.packagingCost,
        });
      }
    }

    const toDateOnly = (d: Date) => d.toISOString().split("T")[0];
    const addDays = (dateStr: string, days: number) => {
      const d = new Date(`${dateStr}T00:00:00.000Z`);
      d.setUTCDate(d.getUTCDate() + days);
      return toDateOnly(d);
    };

    // Determine date range (custom range preferred; fallback to month)
    let startDate: string;
    let endDateInclusive: string;
    if (args.startDate && args.endDate) {
      startDate = args.startDate;
      endDateInclusive = args.endDate;
    } else {
      const month = args.month || new Date().toISOString().slice(0, 7);
      const [year, monthNum] = month.split("-").map(Number);
      startDate = `${month}-01`;
      const lastDayOfMonth = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
      endDateInclusive = `${month}-${String(lastDayOfMonth).padStart(2, "0")}`;
    }
    if (startDate > endDateInclusive) {
      throw new ConvexError("Perioada selectată este invalidă: data de început este după data de final.");
    }
    const endDateExclusive = addDays(endDateInclusive, 1);

    // Until backfill is executed for this user, keep legacy reads for correctness.
    const aggregateState = await ctx.db
      .query("invoiceWorkedAggregationState")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();

    let totalOrders = 0;

    // Use daily aggregates for total order count in period.
    // Filter for global rows only (shopDomain undefined) to avoid double-counting
    // with per-shop rows.
    const dailyRows = await ctx.db
      .query("dailySales")
      .withIndex("by_userId_date", (q: any) =>
        q
          .eq("userId", args.userId)
          .gte("date", startDate)
          .lt("date", endDateExclusive)
      )
      .filter((q: any) => q.eq(q.field("shopDomain"), undefined))
      .collect();
    let totalOrdersInMonth = dailyRows.reduce((sum: number, d: any) => sum + (d.totalOrders || 0), 0);
    if (totalOrdersInMonth === 0) {
      // Fallback: count raw orders (date range already bounded by index).
      const fallbackOrders = await ctx.db
        .query("shopifyOrders")
        .withIndex("by_userId_placedOn", (q: any) =>
          q.eq("userId", args.userId).gte("placedOn", startDate).lt("placedOn", endDateExclusive)
        )
        .order("desc")
        .collect();
      totalOrdersInMonth = fallbackOrders.length;
    }

    // Aggregate by SKU across all orders
    const skuBreakdown: Record<
      string,
      {
        sku: string;
        name: string;
        orderCount: number;
        packagingType: string;
        extraCostPerOrder: number;
        totalExtraCost: number;
      }
    > = {};

    // Track which orders have extras
    let totalExtraCost = 0;

    if (aggregateState) {
      // Fast path: use compact aggregate tables.
      // Critical optimization: only read per-SKU rows for SKUs that have packaging extra configured.
      const workedDailyTotals = await ctx.db
        .query("invoiceWorkedDailyTotals")
        .withIndex("by_userId_date", (q: any) =>
          q.eq("userId", args.userId).gte("date", startDate).lt("date", endDateExclusive)
        )
        .collect();

      totalOrders = workedDailyTotals.reduce(
        (sum: number, row: any) => sum + (row.workedOrders || 0),
        0
      );

      const extraSkuKeys = Array.from(skuExtraMap.keys());
      for (const sku of extraSkuKeys) {
        const extraRate = skuExtraMap.get(sku);
        if (!extraRate || extraRate.packagingCost <= 0) continue;

        const skuRows = await ctx.db
          .query("invoiceWorkedDailySku")
          .withIndex("by_userId_sku_date", (q: any) =>
            q
              .eq("userId", args.userId)
              .eq("sku", sku)
              .gte("date", startDate)
              .lt("date", endDateExclusive)
          )
          .collect();

        const orderCount = skuRows.reduce(
          (sum: number, row: any) => sum + (row?.orderCount || 0),
          0
        );
        if (orderCount <= 0) continue;

        const skuName = skuRows.find((row: any) => row?.skuName)?.skuName || sku;
        const skuExtraTotal = orderCount * extraRate.packagingCost;
        totalExtraCost += skuExtraTotal;
        skuBreakdown[sku] = {
          sku,
          name: skuName,
          orderCount,
          packagingType: extraRate.packagingType || "Standard",
          extraCostPerOrder: extraRate.packagingCost,
          totalExtraCost: skuExtraTotal,
        };
      }
    } else {
      // Legacy fallback kept for users not yet backfilled.
      const legacyWorkedOrders = await ctx.db
        .query("shopifyOrders")
        .withIndex("by_userId_isWorked_placedOn", (q: any) =>
          q
            .eq("userId", args.userId)
            .eq("isWorked", true)
            .gte("placedOn", startDate)
            .lt("placedOn", endDateExclusive)
        )
        .collect();

      totalOrders = legacyWorkedOrders.length;

      // Only iterate items for SKU breakdown if packaging rates are configured.
      // This avoids expensive per-item extraction when there are no extras.
      if (skuExtraMap.size > 0) {
        for (const order of legacyWorkedOrders) {
          for (const skuEntry of extractUniqueSkuEntries(order)) {
            const sku = skuEntry?.sku;
            if (!sku) continue;
            const extraRate = skuExtraMap.get(sku);

            if (!skuBreakdown[sku]) {
              skuBreakdown[sku] = {
                sku,
                name: skuEntry?.name || sku,
                orderCount: 0,
                packagingType: extraRate?.packagingType || "Standard",
                extraCostPerOrder: extraRate?.packagingCost || 0,
                totalExtraCost: 0,
              };
            }

            skuBreakdown[sku].orderCount++;

            if (extraRate && extraRate.packagingCost > 0) {
              skuBreakdown[sku].totalExtraCost += extraRate.packagingCost;
              totalExtraCost += extraRate.packagingCost;
            }
          }
        }
      }
    }

    const baseCost = totalOrders * pricePerOrder;
    const grandTotal = baseCost + totalExtraCost;

    // Get user's stores for display
    const stores = await ctx.db
      .query("shopifyStoreConnections")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();

    const storeNames = stores.map(
      (s) =>
        s.alias || s.connectionName || s.shopDomain.replace(".myshopify.com", "")
    );

    return {
      userId: args.userId,
      userName: userProfile.name || userProfile.email,
      userEmail: userProfile.email,
      month: args.month || startDate.slice(0, 7),
      startDate,
      endDate: endDateInclusive,
      stores: storeNames,
      pricePerOrder,
      totalOrders,
      totalOrdersInMonth,
      ordersNotWorked: Math.max(0, totalOrdersInMonth - totalOrders),
      // Backward-compat for existing frontend consumers. Same value as ordersNotWorked.
      ordersWithoutAwb: Math.max(0, totalOrdersInMonth - totalOrders),
      baseCost,
      totalExtraCost,
      grandTotal,
      skuBreakdown: Object.values(skuBreakdown).sort(
        (a, b) => b.orderCount - a.orderCount
      ),
      billingRateConfigured: !!billingRate,
      packagingRatesCount: packagingRates.length,
    };
  },
});

// Get all users with their billing info (for the admin overview)
export const getAllUsersBillingOverview = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await getRealUserFromToken(ctx, args.token);
    if (!admin || !admin.isAdmin) {
      throw new ConvexError("Doar adminii pot accesa facturarea.");
    }

    const users = await ctx.db.query("profiles").collect();
    const allBillingRates = await ctx.db.query("userBillingRates").collect();
    const allPackagingRates = await ctx.db.query("userPackagingRates").collect();

    // Build maps for quick lookup
    const billingMap = new Map(allBillingRates.map((r) => [r.userId, r]));
    const packagingMap = new Map<string, number>();
    for (const r of allPackagingRates) {
      packagingMap.set(r.userId, (packagingMap.get(r.userId) || 0) + 1);
    }

    return users.map((user) => {
      const billing = billingMap.get(user._id);
      return {
        _id: user._id,
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin || false,
        pricePerOrder: billing?.pricePerOrder ?? null,
        billingNotes: billing?.notes,
        packagingRulesCount: packagingMap.get(user._id) || 0,
      };
    });
  },
});

