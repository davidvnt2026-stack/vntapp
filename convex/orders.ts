import { action, internalQuery, mutation, query, internalMutation } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v, ConvexError } from "convex/values";
import { getUserFromToken } from "./auth";

type OrderItemStock = { sku?: string; quantity?: number };
type ActivityEntry = {
  timestamp?: string;
  action?: string;
  description?: string;
  details?: {
    oldStatus?: string;
    newStatus?: string;
    awbNumber?: string;
    trackingCompany?: string;
  };
};

function normalizeStatus(status?: string | null) {
  return (status || "").trim().toLowerCase();
}

function parseTimestampMs(timestamp?: string) {
  if (!timestamp) return null;
  const ms = Date.parse(timestamp);
  return Number.isNaN(ms) ? null : ms;
}

function areValuesEqual(a: any, b: any) {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a === "object") {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}

function summarizeWebhookChanges(existing: any, orderData: any) {
  const fieldLabels: Record<string, string> = {
    status: "status",
    fulfillmentStatus: "fulfillment status",
    paymentStatus: "payment status",
    placedOn: "placed date",
    paymentMethod: "payment method",
    totalPrice: "total",
    subtotalPrice: "subtotal",
    totalShipping: "shipping",
    totalTax: "tax",
    totalDiscounts: "discounts",
    customerName: "customer name",
    customerEmail: "customer email",
    customerPhone: "customer phone",
    shippingAddress: "shipping address",
    billingAddress: "billing address",
    shippingLines: "shipping lines",
    taxLines: "tax lines",
    discountCodes: "discount codes",
    customerNote: "customer note",
    noteAttributes: "note attributes",
    openPackageRequested: "open package",
    currency: "currency",
    items: "items",
  };

  const changedFields = Object.keys(orderData).filter((key) => !areValuesEqual(existing[key], orderData[key]));
  const labeled = changedFields.map((key) => fieldLabels[key] || key);
  return { changedFields, labeled };
}

function appendActivityIfNotDuplicate(
  activityHistory: ActivityEntry[],
  entry: ActivityEntry,
  dedupeWindowMs = 120000
) {
  const last = activityHistory[activityHistory.length - 1];
  if (!last) {
    activityHistory.push(entry);
    return;
  }

  if (last.action !== entry.action || last.description !== entry.description) {
    activityHistory.push(entry);
    return;
  }

  if (entry.action === "delivery_status_changed") {
    const sameDetails =
      last.details?.oldStatus === entry.details?.oldStatus &&
      last.details?.newStatus === entry.details?.newStatus;
    if (!sameDetails) {
      activityHistory.push(entry);
      return;
    }
  }

  if (entry.action === "awb_generated") {
    const sameAwb = last.details?.awbNumber === entry.details?.awbNumber;
    if (!sameAwb) {
      activityHistory.push(entry);
      return;
    }
  }

  const lastMs = parseTimestampMs(last.timestamp);
  const entryMs = parseTimestampMs(entry.timestamp);
  if (lastMs === null || entryMs === null || Math.abs(entryMs - lastMs) > dedupeWindowMs) {
    activityHistory.push(entry);
  }
}

async function getStockAdjustmentEntriesForItem(
  ctx: any,
  userId: string,
  item: OrderItemStock,
  bundleCache: Map<string, string[] | null>
) {
  if (!item.sku || !item.quantity) return [] as Array<{ sku: string; quantity: number }>;

  const cached = bundleCache.get(item.sku);
  if (cached !== undefined) {
    if (!cached) return [{ sku: item.sku, quantity: item.quantity }];
    return cached.map((componentSku) => ({ sku: componentSku, quantity: item.quantity! }));
  }

  const bundle = await ctx.db
    .query("productBundles")
    .withIndex("by_userId_bundleSku", (q: any) =>
      q.eq("userId", userId).eq("bundleSku", item.sku!)
    )
    .first();

  if (!bundle || !bundle.isActive) {
    bundleCache.set(item.sku, null);
    return [{ sku: item.sku, quantity: item.quantity }];
  }

  const components = [bundle.componentSku1, bundle.componentSku2];
  bundleCache.set(item.sku, components);
  return components.map((componentSku) => ({ sku: componentSku, quantity: item.quantity! }));
}

type InvoiceWorkedSkuSnapshot = { sku: string; name: string };

function buildInvoiceWorkedSkuSnapshot(order: any): InvoiceWorkedSkuSnapshot[] {
  const items = Array.isArray(order.items)
    ? (order.items as Array<{ sku?: string; name?: string }>)
    : [];
  const skuMap = new Map<string, string>();

  for (const item of items) {
    const sku = (item.sku || "").trim();
    if (!sku) continue;
    if (!skuMap.has(sku)) {
      const name = (item.name || "").trim() || sku;
      skuMap.set(sku, name);
    }
  }

  return Array.from(skuMap.entries()).map(([sku, name]) => ({ sku, name }));
}

async function addInvoiceWorkedSnapshot(ctx: any, order: any, now: number) {
  const existing = await ctx.db
    .query("invoiceWorkedOrderSnapshots")
    .withIndex("by_orderId", (q: any) => q.eq("orderId", order._id))
    .first();
  if (existing) return;

  const skuSnapshot = buildInvoiceWorkedSkuSnapshot(order);
  const date = order.placedOn;

  await ctx.db.insert("invoiceWorkedOrderSnapshots", {
    userId: order.userId,
    orderId: order._id,
    placedOn: date,
    skus: skuSnapshot,
    createdAt: now,
    updatedAt: now,
  });

  const dailyTotals = await ctx.db
    .query("invoiceWorkedDailyTotals")
    .withIndex("by_userId_date", (q: any) =>
      q.eq("userId", order.userId).eq("date", date)
    )
    .first();
  if (dailyTotals) {
    await ctx.db.patch(dailyTotals._id, {
      workedOrders: dailyTotals.workedOrders + 1,
      updatedAt: now,
    });
  } else {
    await ctx.db.insert("invoiceWorkedDailyTotals", {
      userId: order.userId,
      date,
      workedOrders: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  for (const skuEntry of skuSnapshot) {
    const skuRow = await ctx.db
      .query("invoiceWorkedDailySku")
      .withIndex("by_userId_date_sku", (q: any) =>
        q.eq("userId", order.userId).eq("date", date).eq("sku", skuEntry.sku)
      )
      .first();

    if (skuRow) {
      await ctx.db.patch(skuRow._id, {
        orderCount: skuRow.orderCount + 1,
        skuName: skuRow.skuName || skuEntry.name,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("invoiceWorkedDailySku", {
        userId: order.userId,
        date,
        sku: skuEntry.sku,
        skuName: skuEntry.name,
        orderCount: 1,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
}

async function removeInvoiceWorkedSnapshot(ctx: any, orderId: any, now: number) {
  const snapshot = await ctx.db
    .query("invoiceWorkedOrderSnapshots")
    .withIndex("by_orderId", (q: any) => q.eq("orderId", orderId))
    .first();
  if (!snapshot) return;

  const { userId, placedOn: date } = snapshot;

  const dailyTotals = await ctx.db
    .query("invoiceWorkedDailyTotals")
    .withIndex("by_userId_date", (q: any) => q.eq("userId", userId).eq("date", date))
    .first();
  if (dailyTotals) {
    if (dailyTotals.workedOrders <= 1) {
      await ctx.db.delete(dailyTotals._id);
    } else {
      await ctx.db.patch(dailyTotals._id, {
        workedOrders: dailyTotals.workedOrders - 1,
        updatedAt: now,
      });
    }
  }

  for (const skuEntry of snapshot.skus || []) {
    const sku = skuEntry?.sku;
    if (!sku) continue;

    const skuRow = await ctx.db
      .query("invoiceWorkedDailySku")
      .withIndex("by_userId_date_sku", (q: any) =>
        q.eq("userId", userId).eq("date", date).eq("sku", sku)
      )
      .first();

    if (!skuRow) continue;
    if (skuRow.orderCount <= 1) {
      await ctx.db.delete(skuRow._id);
    } else {
      await ctx.db.patch(skuRow._id, {
        orderCount: skuRow.orderCount - 1,
        updatedAt: now,
      });
    }
  }

  await ctx.db.delete(snapshot._id);
}

export const list = query({
  args: {
    token: v.string(),
    status: v.optional(v.string()),
    fulfillmentStatus: v.optional(v.string()),
    deliveryStatus: v.optional(v.string()),
    paymentStatus: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    search: v.optional(v.string()),
    spamOnly: v.optional(v.boolean()), // Show only potential spam (same phone + zip)
    shopDomain: v.optional(v.string()), // Filter by store
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }
    
    // --- Optimized: Use indexed range queries to avoid reading ALL orders ---
    // Default to last 30 days if no date range specified (prevents 16MB limit)
    const defaultStartDate = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return d.toISOString().split("T")[0];
    })();
    
    const effectiveStartDate = args.startDate || defaultStartDate;
    const effectiveEndDate = args.endDate; // No default end date needed
    const requestedLimit = Math.max(1, args.limit || 200);
    // Bound DB reads: fetch only a capped window and then apply in-memory filters.
    const maxRowsToScan = Math.min(Math.max(requestedLimit * 4, 250), 800);
    
    let orders;
    
    if (args.shopDomain) {
      // Use compound index for store-specific queries
      orders = await ctx.db
        .query("shopifyOrders")
        .withIndex("by_userId_shopDomain_placedOn", q => {
          const base = q.eq("userId", user._id).eq("shopDomain", args.shopDomain!);
          if (effectiveEndDate) {
            return base.gte("placedOn", effectiveStartDate).lte("placedOn", effectiveEndDate);
          }
          return base.gte("placedOn", effectiveStartDate);
        })
        .order("desc")
        .take(maxRowsToScan);
    } else {
      // Use date range index
      orders = await ctx.db
        .query("shopifyOrders")
        .withIndex("by_userId_placedOn", q => {
          const base = q.eq("userId", user._id);
          if (effectiveEndDate) {
            return base.gte("placedOn", effectiveStartDate).lte("placedOn", effectiveEndDate);
          }
          return base.gte("placedOn", effectiveStartDate);
        })
        .order("desc")
        .take(maxRowsToScan);
    }
    
    // Apply in-memory filters (these are cheap after index narrowing)
    if (args.status) {
      orders = orders.filter(o => o.status === args.status);
    }
    if (args.fulfillmentStatus) {
      orders = orders.filter(o => o.fulfillmentStatus === args.fulfillmentStatus);
    }
    if (args.deliveryStatus) {
      orders = orders.filter(o => o.deliveryStatus === args.deliveryStatus);
    }
    if (args.paymentStatus) {
      orders = orders.filter(o => o.paymentStatus === args.paymentStatus);
    }
    if (args.search) {
      const searchLower = args.search.toLowerCase();
      orders = orders.filter(o => 
        o.orderNumber?.toLowerCase().includes(searchLower) ||
        o.customerName?.toLowerCase().includes(searchLower) ||
        o.customerPhone?.includes(searchLower) ||
        o.trackingNumber?.toLowerCase().includes(searchLower) ||
        // Sameday AWB prefix matching (both directions):
        // 1. Scanned "1ONB24462474600" matches stored "1ONB24462474600001"
        o.trackingNumber?.toLowerCase().startsWith(searchLower) ||
        // 2. Scanned "1ONB24461324775001" matches stored "1ONB24461324775"
        (o.trackingNumber && searchLower.startsWith(o.trackingNumber.toLowerCase())) ||
        o.notes?.toLowerCase().includes(searchLower) || // Search in notes
        o.items?.some((item: any) => 
          item.sku?.toLowerCase().includes(searchLower) ||
          item.name?.toLowerCase().includes(searchLower)
        )
      );
    }
    
    // Spam detection: find orders with identical phone + zip
    if (args.spamOnly) {
      const phoneZipMap = new Map<string, number>();
      orders.forEach(o => {
        const phone = o.customerPhone?.replace(/\s/g, "") || "";
        const zip = o.shippingAddress?.postalCode || o.shippingAddress?.zipCode || o.shippingAddress?.zip || "";
        const key = `${phone}_${zip}`;
        phoneZipMap.set(key, (phoneZipMap.get(key) || 0) + 1);
      });
      
      orders = orders.filter(o => {
        const phone = o.customerPhone?.replace(/\s/g, "") || "";
        const zip = o.shippingAddress?.postalCode || o.shippingAddress?.zipCode || o.shippingAddress?.zip || "";
        const key = `${phone}_${zip}`;
        return (phoneZipMap.get(key) || 0) > 1;
      });
    }
    
    // Already sorted desc by index, but refine same-day ordering
    orders.sort((a, b) => {
      const dateA = new Date(a.placedOn).getTime();
      const dateB = new Date(b.placedOn).getTime();
      if (dateB !== dateA) {
        return dateB - dateA;
      }
      // Same day - sort by order number descending (highest first)
      const numA = parseInt((a.orderNumber || "0").replace(/\D/g, ""), 10) || 0;
      const numB = parseInt((b.orderNumber || "0").replace(/\D/g, ""), 10) || 0;
      return numB - numA;
    });
    
    orders = orders.slice(0, requestedLimit);
    
    return orders;
  },
});

// Project only the fields the orders table needs — strips items to {name,qty,sku},
// removes activityHistory, billingAddress, shippingLines, taxLines, discountCodes,
// noteAttributes, customerNote. Full doc loaded on-demand via getById when editing.
function projectOrderForList(order: any) {
  return {
    _id: order._id,
    _creationTime: order._creationTime,
    shopifyOrderId: order.shopifyOrderId,
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    notes: order.notes,
    totalPrice: order.totalPrice,
    totalShipping: order.totalShipping,
    totalDiscounts: order.totalDiscounts,
    currency: order.currency,
    status: order.status,
    fulfillmentStatus: order.fulfillmentStatus,
    deliveryStatus: order.deliveryStatus,
    trackingNumber: order.trackingNumber,
    awbGeneratedAt: order.awbGeneratedAt,
    invoiceNumber: order.invoiceNumber,
    invoiceSeries: order.invoiceSeries,
    invoiceStatus: order.invoiceStatus,
    invoiceCreatedAt: order.invoiceCreatedAt,
    paymentMethod: order.paymentMethod,
    createdAt: order.createdAt,
    placedOn: order.placedOn,
    isWorked: order.isWorked,
    workedAt: order.workedAt,
    stockDeducted: order.stockDeducted,
    stockDeductedAt: order.stockDeductedAt,
    printedAwb: order.printedAwb,
    printedInvoice: order.printedInvoice,
    lastPrintedAt: order.lastPrintedAt,
    isReturned: order.isReturned,
    returnedAt: order.returnedAt,
    openPackageRequested: order.openPackageRequested,
    // Strip shippingAddress to display-only fields
    shippingAddress: order.shippingAddress
      ? {
          line1: order.shippingAddress.line1 || order.shippingAddress.address1,
          line2: order.shippingAddress.line2 || order.shippingAddress.address2,
          city: order.shippingAddress.city,
          state: order.shippingAddress.state || order.shippingAddress.province,
          postalCode: order.shippingAddress.postalCode || order.shippingAddress.zipCode || order.shippingAddress.zip,
          zip: order.shippingAddress.zip,
          zipCode: order.shippingAddress.zipCode,
          country: order.shippingAddress.country,
        }
      : undefined,
    // Strip items to {name, quantity, sku} only (drops price, variant_id, properties, tax_lines etc.)
    items: Array.isArray(order.items)
      ? order.items.map((item: any) => ({
          name: item.name,
          quantity: item.quantity,
          sku: item.sku,
        }))
      : [],
  };
}

export const listPaginated = query({
  args: {
    token: v.string(),
    shopDomain: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    const startDate = args.startDate || undefined;
    const endDate = args.endDate || undefined;

    let result;
    if (args.shopDomain) {
      result = await ctx.db
        .query("shopifyOrders")
        .withIndex("by_userId_shopDomain_placedOn", (q) => {
          const base = q.eq("userId", user._id).eq("shopDomain", args.shopDomain!);
          if (startDate && endDate) {
            return base.gte("placedOn", startDate).lte("placedOn", endDate);
          } else if (startDate) {
            return base.gte("placedOn", startDate);
          } else if (endDate) {
            return base.lte("placedOn", endDate);
          }
          return base;
        })
        .order("desc")
        .paginate(args.paginationOpts);
    } else {
      result = await ctx.db
        .query("shopifyOrders")
        .withIndex("by_userId_placedOn", (q) => {
          const base = q.eq("userId", user._id);
          if (startDate && endDate) {
            return base.gte("placedOn", startDate).lte("placedOn", endDate);
          } else if (startDate) {
            return base.gte("placedOn", startDate);
          } else if (endDate) {
            return base.lte("placedOn", endDate);
          }
          return base;
        })
        .order("desc")
        .paginate(args.paginationOpts);
    }

    // Return lightweight projection — keeps pagination metadata intact
    return {
      ...result,
      page: result.page.map(projectOrderForList),
    };
  },
});

export const searchByText = query({
  args: {
    token: v.string(),
    search: v.string(),
    shopDomain: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    const searchRaw = args.search.trim();
    const searchLower = searchRaw.toLowerCase();
    if (!searchLower) return [];

    const limit = Math.min(Math.max(args.limit ?? 150, 1), 300);
    const searchNoHash = searchLower.replace(/^#/, "");

    // Normalize phone: strip all non-digit chars for flexible matching
    const searchDigitsOnly = searchRaw.replace(/\D/g, "");
    const looksLikePhone = searchDigitsOnly.length >= 7 && /^\+?[\d\s\-().]+$/.test(searchRaw);

    const defaultStartDate = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 45);
      return d.toISOString().split("T")[0];
    })();

    const startDate = args.startDate || defaultStartDate;
    const endDate = args.endDate || undefined;

    const isWithinRange = (order: any) => {
      if (args.shopDomain && order.shopDomain !== args.shopDomain) return false;
      if (startDate && order.placedOn < startDate) return false;
      if (endDate && order.placedOn > endDate) return false;
      return true;
    };

    // Normalise a phone value to digits-only for comparison
    const phoneDigits = (val: string | undefined | null) =>
      val ? val.replace(/\D/g, "") : "";

    const orderMatchesText = (o: any) =>
      o.orderNumber?.toLowerCase().includes(searchLower) ||
      o.customerName?.toLowerCase().includes(searchLower) ||
      o.customerPhone?.toLowerCase().includes(searchLower) ||
      // Also match phone by digits-only (ignores spaces, dashes, +40 etc.)
      (looksLikePhone && searchDigitsOnly.length >= 7 &&
        phoneDigits(o.customerPhone).includes(searchDigitsOnly)) ||
      o.customerEmail?.toLowerCase().includes(searchLower) ||
      o.notes?.toLowerCase().includes(searchLower) ||
      o.trackingNumber?.toLowerCase().includes(searchLower) ||
      o.trackingNumber?.toLowerCase().startsWith(searchLower) ||
      (o.trackingNumber && searchLower.startsWith(o.trackingNumber.toLowerCase())) ||
      o.items?.some((item: any) =>
        item?.sku?.toLowerCase().includes(searchLower) ||
        item?.name?.toLowerCase().includes(searchLower)
      );

    const byId = new Map<string, any>();
    const addCandidate = (order: any | null | undefined) => {
      if (!order) return;
      if (order.userId !== user._id) return;
      if (!isWithinRange(order)) return;
      byId.set(String(order._id), order);
    };

    // Fast indexed lookups (cheap, high hit-rate for scanners/order IDs/phones).
    const exactOrderNumber = await ctx.db
      .query("shopifyOrders")
      .withIndex("by_userId_orderNumber", (q) => q.eq("userId", user._id).eq("orderNumber", searchRaw))
      .first();
    addCandidate(exactOrderNumber);

    if (searchNoHash !== searchRaw) {
      const noHashOrderNumber = await ctx.db
        .query("shopifyOrders")
        .withIndex("by_userId_orderNumber", (q) =>
          q.eq("userId", user._id).eq("orderNumber", searchNoHash)
        )
        .first();
      addCandidate(noHashOrderNumber);
    }

    const byShopifyOrderId = await ctx.db
      .query("shopifyOrders")
      .withIndex("by_userId_shopifyOrderId", (q) =>
        q.eq("userId", user._id).eq("shopifyOrderId", searchRaw)
      )
      .first();
    addCandidate(byShopifyOrderId);

    // Phone lookup: try exact match first, then common normalized variants
    const byPhone = await ctx.db
      .query("shopifyOrders")
      .withIndex("by_userId_customerPhone", (q) =>
        q.eq("userId", user._id).eq("customerPhone", searchRaw)
      )
      .order("desc")
      .take(Math.min(limit, 30));
    for (const order of byPhone) addCandidate(order);

    // Try phone variants if the search looks like a phone number
    if (looksLikePhone && byPhone.length === 0) {
      // Try with/without leading +40/0040/0 prefix
      const phoneVariants: string[] = [];
      if (searchDigitsOnly.startsWith("40") && searchDigitsOnly.length > 9) {
        phoneVariants.push("+" + searchDigitsOnly); // +40...
        phoneVariants.push("0" + searchDigitsOnly.slice(2)); // 07...
      } else if (searchDigitsOnly.startsWith("0")) {
        phoneVariants.push("+40" + searchDigitsOnly.slice(1)); // +407...
        phoneVariants.push("0040" + searchDigitsOnly.slice(1)); // 00407...
      }
      for (const variant of phoneVariants) {
        if (byId.size >= limit) break;
        const byPhoneVariant = await ctx.db
          .query("shopifyOrders")
          .withIndex("by_userId_customerPhone", (q) =>
            q.eq("userId", user._id).eq("customerPhone", variant)
          )
          .order("desc")
          .take(Math.min(limit, 30));
        for (const order of byPhoneVariant) addCandidate(order);
      }
    }

    // Global index; verify user after read.
    const byTracking = await ctx.db
      .query("shopifyOrders")
      .withIndex("by_trackingNumber", (q) => q.eq("trackingNumber", searchRaw))
      .take(25);
    for (const order of byTracking) addCandidate(order);

    const sortResults = (rows: any[]) => {
      rows.sort((a, b) => {
        const dateA = new Date(a.placedOn).getTime();
        const dateB = new Date(b.placedOn).getTime();
        if (dateB !== dateA) return dateB - dateA;
        const numA = parseInt((a.orderNumber || "0").replace(/\D/g, ""), 10) || 0;
        const numB = parseInt((b.orderNumber || "0").replace(/\D/g, ""), 10) || 0;
        return numB - numA;
      });
      return rows;
    };

    const looksLikeSpecificLookup =
      /^#?\d+$/.test(searchRaw) ||
      searchLower.startsWith("1on") ||
      searchRaw.length >= 10;
    if (looksLikeSpecificLookup && byId.size > 0) {
      return sortResults(Array.from(byId.values())).slice(0, limit).map(projectOrderForList);
    }

    // Fallback scan: read a batch of recent orders and filter in-memory.
    // Uses .take() instead of .paginate() loop to avoid server-side pagination issues.
    const maxScanRows = 600;
    const scanResults = args.shopDomain
      ? await ctx.db
          .query("shopifyOrders")
          .withIndex("by_userId_shopDomain_placedOn", (q) => {
            const base = q.eq("userId", user._id).eq("shopDomain", args.shopDomain!);
            if (startDate && endDate) {
              return base.gte("placedOn", startDate).lte("placedOn", endDate);
            }
            if (startDate) return base.gte("placedOn", startDate);
            if (endDate) return base.lte("placedOn", endDate);
            return base;
          })
          .order("desc")
          .take(maxScanRows)
      : await ctx.db
          .query("shopifyOrders")
          .withIndex("by_userId_placedOn", (q) => {
            const base = q.eq("userId", user._id);
            if (startDate && endDate) {
              return base.gte("placedOn", startDate).lte("placedOn", endDate);
            }
            if (startDate) return base.gte("placedOn", startDate);
            if (endDate) return base.lte("placedOn", endDate);
            return base;
          })
          .order("desc")
          .take(maxScanRows);

    for (const order of scanResults) {
      if (orderMatchesText(order)) {
        addCandidate(order);
      }
      if (byId.size >= limit) break;
    }

    const dedupedMatches = sortResults(Array.from(byId.values()));

    return dedupedMatches.slice(0, limit).map(projectOrderForList);
  },
});

export const getById = query({
  args: {
    token: v.string(),
    id: v.id("shopifyOrders"),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }
    
    const order = await ctx.db.get(args.id);
    if (!order || order.userId !== user._id) {
      return null;
    }
    
    return order;
  },
});

export const getByShopifyId = query({
  args: {
    token: v.string(),
    shopifyOrderId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }
    
    const order = await ctx.db
      .query("shopifyOrders")
      .withIndex("by_userId_shopifyOrderId", q => 
        q.eq("userId", user._id).eq("shopifyOrderId", args.shopifyOrderId)
      )
      .first();
    
    return order;
  },
});

// Fast lookup by order number for integrations/webhooks
export const getByOrderNumber = query({
  args: {
    token: v.string(),
    orderNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    const normalized = args.orderNumber.trim().replace(/^#/, "");
    const candidates = [normalized, `#${normalized}`];

    for (const candidate of candidates) {
      const order = await ctx.db
        .query("shopifyOrders")
        .withIndex("by_userId_orderNumber", (q) =>
          q.eq("userId", user._id).eq("orderNumber", candidate)
        )
        .first();
      if (order) {
        return order;
      }
    }

    return null;
  },
});

// Lightweight AWB sync feed for courier status refreshers
export const listWithAwbUndelivered = query({
  args: {
    token: v.string(),
    shopDomain: v.optional(v.string()),
    days: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    const daysToScan = Math.min(Math.max(args.days ?? 45, 1), 180);
    const rowLimit = Math.min(Math.max(args.limit ?? 500, 10), 1000);
    const startDate = new Date(Date.now() - daysToScan * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const rows = args.shopDomain
      ? await ctx.db
          .query("shopifyOrders")
          .withIndex("by_userId_shopDomain_placedOn", (q) =>
            q.eq("userId", user._id).eq("shopDomain", args.shopDomain!).gte("placedOn", startDate)
          )
          .order("desc")
          .take(rowLimit)
      : await ctx.db
          .query("shopifyOrders")
          .withIndex("by_userId_placedOn", (q) =>
            q.eq("userId", user._id).gte("placedOn", startDate)
          )
          .order("desc")
          .take(rowLimit);

    return rows.filter(
      (o) =>
        !!o.trackingNumber &&
        o.deliveryStatus !== "Livrat cu succes" &&
        o.deliveryStatus !== "delivered"
    );
  },
});

// Get order by Shopify ID (for internal/webhook use - no auth required)
export const getByShopifyIdInternal = query({
  args: {
    userId: v.id("profiles"),
    shopifyOrderId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("shopifyOrders")
      .withIndex("by_userId_shopifyOrderId", q => 
        q.eq("userId", args.userId).eq("shopifyOrderId", args.shopifyOrderId)
      )
      .first();
  },
});

// Batch upsert for sync - more memory efficient
export const upsertBatch = mutation({
  args: {
    token: v.string(),
    orders: v.array(v.object({
      shopifyOrderId: v.string(),
      orderNumber: v.string(),
      status: v.string(),
      fulfillmentStatus: v.optional(v.string()),
      paymentStatus: v.optional(v.string()),
      placedOn: v.string(),
      paymentMethod: v.string(),
      totalPrice: v.number(),
      subtotalPrice: v.optional(v.number()),
      totalShipping: v.optional(v.number()),
      totalTax: v.optional(v.number()),
      totalDiscounts: v.optional(v.number()),
      customerName: v.optional(v.string()),
      customerEmail: v.optional(v.string()),
      customerPhone: v.optional(v.string()),
      shippingAddress: v.optional(v.any()),
      billingAddress: v.optional(v.any()),
      items: v.array(v.any()),
      shippingLines: v.optional(v.array(v.any())),
      taxLines: v.optional(v.array(v.any())),
      discountCodes: v.optional(v.array(v.any())),
      shopDomain: v.optional(v.string()),
      currency: v.optional(v.string()),
      // Open package detection fields
      customerNote: v.optional(v.string()),
      noteAttributes: v.optional(v.array(v.any())),
      openPackageRequested: v.optional(v.boolean()),
    })),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }
    
    let synced = 0;
    
    for (const orderData of args.orders) {
      const existing = await ctx.db
        .query("shopifyOrders")
        .withIndex("by_userId_shopifyOrderId", q => 
          q.eq("userId", user._id).eq("shopifyOrderId", orderData.shopifyOrderId)
        )
        .first();
      
      if (existing) {
        const preserveStatus =
          existing.status === "cancelled" || existing.status === "returned";
        await ctx.db.patch(existing._id, {
          ...orderData,
          // Preserve local status if order was cancelled/returned locally
          status: preserveStatus ? existing.status : orderData.status,
          previousStatus: existing.previousStatus,
          // Preserve local-only fields
          notes: existing.notes,
          activityHistory: existing.activityHistory,
          trackingNumber: existing.trackingNumber,
          invoiceNumber: existing.invoiceNumber,
          invoiceSeries: existing.invoiceSeries,
          invoiceStatus: existing.invoiceStatus,
          invoiceCreatedAt: existing.invoiceCreatedAt,
          // Preserve worked/returned flags
          isWorked: existing.isWorked,
          workedAt: existing.workedAt,
          workedBy: existing.workedBy,
          workedByName: existing.workedByName,
          stockDeducted: existing.stockDeducted,
          stockDeductedAt: existing.stockDeductedAt,
          isReturned: existing.isReturned,
          returnedAt: existing.returnedAt,
          returnId: existing.returnId,
          // Preserve print flags
          printedAwb: existing.printedAwb,
          printedInvoice: existing.printedInvoice,
          lastPrintedAt: existing.lastPrintedAt,
          lastPrintedBy: existing.lastPrintedBy,
          updatedAt: Date.now(),
        });
      } else {
        await ctx.db.insert("shopifyOrders", {
          userId: user._id,
          ...orderData,
          activityHistory: [{
            timestamp: new Date().toISOString(),
            action: "created",
            description: "Order synced from Shopify",
          }],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
      synced++;
    }
    
    return { synced };
  },
});

// Internal version of upsertBatch that uses userId directly (for auto-setup actions)
export const internalUpsertBatch = internalMutation({
  args: {
    userId: v.id("profiles"),
    orders: v.array(v.object({
      shopifyOrderId: v.string(),
      orderNumber: v.string(),
      status: v.string(),
      fulfillmentStatus: v.optional(v.string()),
      paymentStatus: v.optional(v.string()),
      placedOn: v.string(),
      paymentMethod: v.string(),
      totalPrice: v.number(),
      subtotalPrice: v.optional(v.number()),
      totalShipping: v.optional(v.number()),
      totalTax: v.optional(v.number()),
      totalDiscounts: v.optional(v.number()),
      customerName: v.optional(v.string()),
      customerEmail: v.optional(v.string()),
      customerPhone: v.optional(v.string()),
      shippingAddress: v.optional(v.any()),
      billingAddress: v.optional(v.any()),
      items: v.array(v.any()),
      shippingLines: v.optional(v.array(v.any())),
      taxLines: v.optional(v.array(v.any())),
      discountCodes: v.optional(v.array(v.any())),
      shopDomain: v.optional(v.string()),
      currency: v.optional(v.string()),
      customerNote: v.optional(v.string()),
      noteAttributes: v.optional(v.array(v.any())),
      openPackageRequested: v.optional(v.boolean()),
    })),
  },
  handler: async (ctx, args) => {
    let synced = 0;

    for (const orderData of args.orders) {
      const existing = await ctx.db
        .query("shopifyOrders")
        .withIndex("by_userId_shopifyOrderId", q =>
          q.eq("userId", args.userId).eq("shopifyOrderId", orderData.shopifyOrderId)
        )
        .first();

      if (existing) {
        const preserveStatus =
          existing.status === "cancelled" || existing.status === "returned";
        await ctx.db.patch(existing._id, {
          ...orderData,
          // Preserve local status if order was cancelled/returned locally
          status: preserveStatus ? existing.status : orderData.status,
          previousStatus: existing.previousStatus,
          // Preserve local-only fields
          notes: existing.notes,
          activityHistory: existing.activityHistory,
          trackingNumber: existing.trackingNumber,
          invoiceNumber: existing.invoiceNumber,
          invoiceSeries: existing.invoiceSeries,
          invoiceStatus: existing.invoiceStatus,
          invoiceCreatedAt: existing.invoiceCreatedAt,
          // Preserve worked/returned flags
          isWorked: existing.isWorked,
          workedAt: existing.workedAt,
          workedBy: existing.workedBy,
          workedByName: existing.workedByName,
          stockDeducted: existing.stockDeducted,
          stockDeductedAt: existing.stockDeductedAt,
          isReturned: existing.isReturned,
          returnedAt: existing.returnedAt,
          returnId: existing.returnId,
          // Preserve print flags
          printedAwb: existing.printedAwb,
          printedInvoice: existing.printedInvoice,
          lastPrintedAt: existing.lastPrintedAt,
          lastPrintedBy: existing.lastPrintedBy,
          updatedAt: Date.now(),
        });
      } else {
        await ctx.db.insert("shopifyOrders", {
          userId: args.userId,
          ...orderData,
          activityHistory: [{
            timestamp: new Date().toISOString(),
            action: "created",
            description: "Order synced from Shopify",
          }],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
      synced++;
    }

    return { synced };
  },
});

export const upsert = mutation({
  args: {
    token: v.string(),
    shopifyOrderId: v.string(),
    orderNumber: v.string(),
    status: v.string(),
    fulfillmentStatus: v.optional(v.string()),
    paymentStatus: v.optional(v.string()),
    placedOn: v.string(),
    paymentMethod: v.string(),
    totalPrice: v.number(),
    subtotalPrice: v.optional(v.number()),
    totalShipping: v.optional(v.number()),
    totalTax: v.optional(v.number()),
    totalDiscounts: v.optional(v.number()),
    customerName: v.optional(v.string()),
    customerEmail: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
    shippingAddress: v.optional(v.any()),
    billingAddress: v.optional(v.any()),
    items: v.array(v.any()),
    shippingLines: v.optional(v.array(v.any())),
    taxLines: v.optional(v.array(v.any())),
    discountCodes: v.optional(v.array(v.any())),
    shopDomain: v.optional(v.string()),
    currency: v.optional(v.string()),
    // Open package detection fields
    customerNote: v.optional(v.string()),
    noteAttributes: v.optional(v.array(v.any())),
    openPackageRequested: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }
    
    const { token, ...orderData } = args;
    
    const existing = await ctx.db
      .query("shopifyOrders")
      .withIndex("by_userId_shopifyOrderId", q => 
        q.eq("userId", user._id).eq("shopifyOrderId", args.shopifyOrderId)
      )
      .first();
    
    if (existing) {
      const preserveStatus =
        existing.status === "cancelled" || existing.status === "returned";
      await ctx.db.patch(existing._id, {
        ...orderData,
        // Preserve local status if order was cancelled/returned locally
        status: preserveStatus ? existing.status : orderData.status,
        previousStatus: existing.previousStatus,
        // Preserve local-only fields
        notes: existing.notes,
        activityHistory: existing.activityHistory,
        trackingNumber: existing.trackingNumber,
        invoiceNumber: existing.invoiceNumber,
        invoiceSeries: existing.invoiceSeries,
        invoiceStatus: existing.invoiceStatus,
        invoiceCreatedAt: existing.invoiceCreatedAt,
        // Preserve worked/returned flags
        isWorked: existing.isWorked,
        workedAt: existing.workedAt,
        workedBy: existing.workedBy,
        workedByName: existing.workedByName,
        stockDeducted: existing.stockDeducted,
        stockDeductedAt: existing.stockDeductedAt,
        isReturned: existing.isReturned,
        returnedAt: existing.returnedAt,
        returnId: existing.returnId,
        // Preserve print flags
        printedAwb: existing.printedAwb,
        printedInvoice: existing.printedInvoice,
        lastPrintedAt: existing.lastPrintedAt,
        lastPrintedBy: existing.lastPrintedBy,
        updatedAt: Date.now(),
      });
      return existing._id;
    }
    
    // Create new order
    const id = await ctx.db.insert("shopifyOrders", {
      userId: user._id,
      ...orderData,
      activityHistory: [{
        timestamp: new Date().toISOString(),
        action: "created",
        description: "Order synced from Shopify",
      }],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    
    return id;
  },
});

// Upsert from webhook (no auth token - uses userId directly)
export const upsertFromWebhook = mutation({
  args: {
    userId: v.id("profiles"),
    shopifyOrderId: v.string(),
    orderNumber: v.string(),
    status: v.string(),
    fulfillmentStatus: v.optional(v.string()),
    paymentStatus: v.optional(v.string()),
    placedOn: v.string(),
    paymentMethod: v.string(),
    totalPrice: v.number(),
    subtotalPrice: v.optional(v.number()),
    totalShipping: v.optional(v.number()),
    totalTax: v.optional(v.number()),
    totalDiscounts: v.optional(v.number()),
    customerName: v.optional(v.string()),
    customerEmail: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
    shippingAddress: v.optional(v.any()),
    billingAddress: v.optional(v.any()),
    items: v.array(v.any()),
    shippingLines: v.optional(v.array(v.any())),
    taxLines: v.optional(v.array(v.any())),
    discountCodes: v.optional(v.array(v.any())),
    shopDomain: v.optional(v.string()),
    currency: v.optional(v.string()),
    // Open package detection fields
    customerNote: v.optional(v.string()),
    noteAttributes: v.optional(v.array(v.any())),
    openPackageRequested: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId, ...orderData } = args;
    
    const existing = await ctx.db
      .query("shopifyOrders")
      .withIndex("by_userId_shopifyOrderId", q => 
        q.eq("userId", userId).eq("shopifyOrderId", args.shopifyOrderId)
      )
      .first();
    
    if (existing) {
      // Preserve local-only fields when updating from webhook
      // CRITICAL: Don't let webhook overwrite locally-set statuses (e.g. "cancelled")
      const preserveStatus = existing.status === "cancelled" || existing.status === "returned";
      const { changedFields, labeled } = summarizeWebhookChanges(existing, orderData);
      const statusPreserved =
        preserveStatus && normalizeStatus(existing.status) !== normalizeStatus(orderData.status);
      const activityHistory = [...(existing.activityHistory || [])] as ActivityEntry[];
      if (changedFields.length > 0 || statusPreserved) {
        const displayFields =
          labeled.length > 5
            ? `${labeled.slice(0, 5).join(", ")} +${labeled.length - 5} more`
            : labeled.join(", ");
        const webhookDetails =
          normalizeStatus(existing.status) !== normalizeStatus(orderData.status)
            ? {
                oldStatus: existing.status,
                newStatus: orderData.status,
              }
            : undefined;
        appendActivityIfNotDuplicate(
          activityHistory,
          {
            timestamp: new Date().toISOString(),
            action: "webhook_update",
            description: `Webhook update: ${displayFields || "no tracked field changes"}${statusPreserved ? ` (kept local status: ${existing.status})` : ""}`,
            details: webhookDetails,
          },
          180000
        );
      }
      
      await ctx.db.patch(existing._id, {
        ...orderData,
        // Preserve local status if order was cancelled/returned locally
        status: preserveStatus ? existing.status : orderData.status,
        previousStatus: existing.previousStatus,
        // Preserve all local-only fields
        notes: existing.notes,
        activityHistory,
        trackingNumber: existing.trackingNumber,
        invoiceNumber: existing.invoiceNumber,
        invoiceSeries: existing.invoiceSeries,
        invoiceStatus: existing.invoiceStatus,
        invoiceCreatedAt: existing.invoiceCreatedAt,
        // Preserve worked/returned flags
        isWorked: existing.isWorked,
        workedAt: existing.workedAt,
        workedBy: existing.workedBy,
        workedByName: existing.workedByName,
        stockDeducted: existing.stockDeducted,
        stockDeductedAt: existing.stockDeductedAt,
        isReturned: existing.isReturned,
        returnedAt: existing.returnedAt,
        returnId: existing.returnId,
        // Preserve print flags
        printedAwb: existing.printedAwb,
        printedInvoice: existing.printedInvoice,
        lastPrintedAt: existing.lastPrintedAt,
        lastPrintedBy: existing.lastPrintedBy,
        updatedAt: Date.now(),
      });
      return existing._id;
    }
    
    // Create new order from webhook
    const id = await ctx.db.insert("shopifyOrders", {
      userId,
      ...orderData,
      activityHistory: [{
        timestamp: new Date().toISOString(),
        action: "webhook_created",
        description: "Order created via Shopify webhook",
      }],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    
    return id;
  },
});

export const updateNotes = mutation({
  args: {
    token: v.string(),
    orderId: v.id("shopifyOrders"),
    notes: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }
    
    const order = await ctx.db.get(args.orderId);
    if (!order || order.userId !== user._id) {
      throw new ConvexError("Comanda nu a fost găsită.");
    }
    
    const activityHistory = order.activityHistory || [];
    activityHistory.push({
      timestamp: new Date().toISOString(),
      action: "notes_updated",
      description: "Notes updated",
      userId: user._id,
    });
    
    await ctx.db.patch(args.orderId, {
      notes: args.notes,
      activityHistory,
      updatedAt: Date.now(),
    });
    
    return { success: true };
  },
});

export const updatePhone = mutation({
  args: {
    token: v.string(),
    orderId: v.id("shopifyOrders"),
    phone: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }
    
    const order = await ctx.db.get(args.orderId);
    if (!order || order.userId !== user._id) {
      throw new ConvexError("Comanda nu a fost găsită.");
    }
    
    const activityHistory = order.activityHistory || [];
    activityHistory.push({
      timestamp: new Date().toISOString(),
      action: "phone_updated",
      description: `Phone updated from ${order.customerPhone || 'empty'} to ${args.phone}`,
      userId: user._id,
    });
    
    await ctx.db.patch(args.orderId, {
      customerPhone: args.phone,
      activityHistory,
      updatedAt: Date.now(),
    });
    
    return { success: true };
  },
});

export const updateAddress = mutation({
  args: {
    token: v.string(),
    orderId: v.id("shopifyOrders"),
    shippingAddress: v.any(),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }
    
    const order = await ctx.db.get(args.orderId);
    if (!order || order.userId !== user._id) {
      throw new ConvexError("Comanda nu a fost găsită.");
    }
    
    const activityHistory = order.activityHistory || [];
    activityHistory.push({
      timestamp: new Date().toISOString(),
      action: "address_updated",
      description: "Shipping address updated",
      userId: user._id,
    });
    
    await ctx.db.patch(args.orderId, {
      shippingAddress: args.shippingAddress,
      activityHistory,
      updatedAt: Date.now(),
    });
    
    return { success: true };
  },
});

export const updateShippingCity = mutation({
  args: {
    token: v.string(),
    orderId: v.id("shopifyOrders"),
    city: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    const order = await ctx.db.get(args.orderId);
    if (!order || order.userId !== user._id) {
      throw new ConvexError("Comanda nu a fost găsită.");
    }

    const shippingAddress = (order.shippingAddress as Record<string, any>) || {};
    const updatedAddress = { ...shippingAddress, city: args.city };

    const activityHistory = (order.activityHistory as any[]) || [];
    activityHistory.push({
      timestamp: new Date().toISOString(),
      action: "shipping_city_updated",
      description: `Shipping city updated to "${args.city}"`,
      userId: user._id,
    });

    await ctx.db.patch(args.orderId, {
      shippingAddress: updatedAddress,
      activityHistory,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const updateStatus = mutation({
  args: {
    token: v.string(),
    orderId: v.id("shopifyOrders"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }
    
    const order = await ctx.db.get(args.orderId);
    if (!order || order.userId !== user._id) {
      throw new ConvexError("Comanda nu a fost găsită.");
    }
    
    const activityHistory = order.activityHistory || [];
    activityHistory.push({
      timestamp: new Date().toISOString(),
      action: "status_changed",
      description: `Status changed from ${order.status} to ${args.status}`,
      userId: user._id,
    });
    
    await ctx.db.patch(args.orderId, {
      status: args.status,
      activityHistory,
      updatedAt: Date.now(),
    });
    
    return { success: true };
  },
});

export const updateTracking = mutation({
  args: {
    orderId: v.id("shopifyOrders"),
    trackingNumber: v.string(),
    fulfillmentStatus: v.optional(v.string()),
    trackingCompany: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    const activityHistory = (order?.activityHistory as any[] | undefined) || [];
    appendActivityIfNotDuplicate(activityHistory as ActivityEntry[], {
      timestamp: new Date().toISOString(),
      action: "awb_generated",
      description: `AWB ${args.trackingNumber} generat${args.trackingCompany ? ` via ${args.trackingCompany}` : ""}`,
      details: { awbNumber: args.trackingNumber, trackingCompany: args.trackingCompany },
    });

    await ctx.db.patch(args.orderId, {
      trackingNumber: args.trackingNumber,
      awbGeneratedAt: Date.now(),
      fulfillmentStatus: args.fulfillmentStatus || "fulfilled",
      activityHistory,
      updatedAt: Date.now(),
    });
    
    return { success: true };
  },
});

export const updateInvoice = mutation({
  args: {
    orderId: v.id("shopifyOrders"),
    invoiceNumber: v.string(),
    invoiceSeries: v.optional(v.string()),
    invoiceStatus: v.optional(v.string()),
    source: v.optional(v.string()), // "created" | "storno" | etc.
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    const activityHistory = (order?.activityHistory as any[] | undefined) || [];
    const isStorno = args.invoiceStatus === "storno" || args.source === "storno";
    const invoiceLabel = `${args.invoiceSeries || ""}${args.invoiceNumber}`;
    
    activityHistory.push({
      timestamp: new Date().toISOString(),
      action: isStorno ? "invoice_stornoed" : "invoice_created",
      description: isStorno
        ? `Factură ${invoiceLabel} stornată`
        : `Factură ${invoiceLabel} generată`,
      details: { invoiceNumber: args.invoiceNumber, invoiceSeries: args.invoiceSeries, invoiceStatus: args.invoiceStatus },
    });

    await ctx.db.patch(args.orderId, {
      invoiceNumber: args.invoiceNumber,
      invoiceSeries: args.invoiceSeries,
      invoiceStatus: args.invoiceStatus || "unpaid",
      invoiceCreatedAt: Date.now(),
      activityHistory,
      updatedAt: Date.now(),
    });
    
    return { success: true };
  },
});

export const clearTracking = mutation({
  args: {
    orderId: v.id("shopifyOrders"),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) {
      throw new ConvexError("Comanda nu a fost găsită.");
    }

    const activityHistory = order.activityHistory || [];
    activityHistory.push({
      timestamp: new Date().toISOString(),
      action: "awb_cancelled",
      description: `AWB ${order.trackingNumber} a fost anulat`,
    });

    await ctx.db.patch(args.orderId, {
      trackingNumber: undefined,
      fulfillmentStatus: "unfulfilled",
      activityHistory,
      updatedAt: Date.now(),
    });
    
    return { success: true };
  },
});

export const updateCustomerDetails = mutation({
  args: {
    token: v.string(),
    orderId: v.id("shopifyOrders"),
    customerName: v.optional(v.string()),
    customerEmail: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
    notes: v.optional(v.string()),
    shippingAddress: v.optional(v.object({
      line1: v.optional(v.string()),
      line2: v.optional(v.string()),
      city: v.optional(v.string()),
      state: v.optional(v.string()),
      stateCode: v.optional(v.string()),
      stateEdited: v.optional(v.boolean()),
      postalCode: v.optional(v.string()),
      zipCode: v.optional(v.string()),
      zip: v.optional(v.string()),
      country: v.optional(v.string()),
      countryCode: v.optional(v.string()),
    })),
    billingAddress: v.optional(v.object({
      line1: v.optional(v.string()),
      line2: v.optional(v.string()),
      city: v.optional(v.string()),
      state: v.optional(v.string()),
      postalCode: v.optional(v.string()),
      country: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }
    
    const order = await ctx.db.get(args.orderId);
    if (!order || order.userId !== user._id) {
      throw new ConvexError("Comanda nu a fost găsită.");
    }
    
    const updates: Record<string, unknown> = {
      updatedAt: Date.now(),
    };
    
    if (args.customerName !== undefined) updates.customerName = args.customerName;
    if (args.customerEmail !== undefined) updates.customerEmail = args.customerEmail;
    if (args.customerPhone !== undefined) updates.customerPhone = args.customerPhone;
    if (args.notes !== undefined) updates.notes = args.notes;
    
    if (args.shippingAddress !== undefined) {
      // Merge with existing shipping address
      const existingAddress = (order.shippingAddress || {}) as Record<string, unknown>;
      updates.shippingAddress = {
        ...existingAddress,
        ...args.shippingAddress,
      };
    }
    
    if (args.billingAddress !== undefined) {
      // Merge with existing billing address
      const existingAddress = (order.billingAddress || {}) as Record<string, unknown>;
      updates.billingAddress = {
        ...existingAddress,
        ...args.billingAddress,
      };
    }
    
    // Add to activity history
    const activityHistory = order.activityHistory || [];
    activityHistory.push({
      timestamp: new Date().toISOString(),
      action: "customer_details_updated",
      description: "Detaliile clientului au fost actualizate manual",
      userId: user._id,
    });
    updates.activityHistory = activityHistory;
    
    await ctx.db.patch(args.orderId, updates);
    
    return { success: true };
  },
});

export const cancel = mutation({
  args: {
    token: v.string(),
    orderId: v.id("shopifyOrders"),
    restock: v.optional(v.boolean()), // If true, add items back to local stock
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }
    
    const order = await ctx.db.get(args.orderId);
    if (!order || order.userId !== user._id) {
      throw new ConvexError("Comanda nu a fost găsită.");
    }

    // Restock local inventory if requested
    let stockRestored = false;
    if (args.restock) {
      const settings = await ctx.db
        .query("userSettings")
        .withIndex("by_userId", (q: any) => q.eq("userId", user._id))
        .first();
      
      const stockManagement = settings?.stockManagement || "shopify";
      
      if (stockManagement === "local") {
        const items = order.items as OrderItemStock[];
        const bundleCache = new Map<string, string[] | null>();
        
        for (const item of items) {
          const entries = await getStockAdjustmentEntriesForItem(ctx, user._id, item, bundleCache);
          for (const entry of entries) {
            const skuRecord = await ctx.db
              .query("skus")
              .withIndex("by_userId_sku", (q: any) =>
                q.eq("userId", user._id).eq("sku", entry.sku)
              )
              .first();
            
            if (skuRecord) {
              const newStock = skuRecord.currentStock + entry.quantity;
              console.log(`[Cancel+Restock] Restoring ${entry.quantity} to SKU ${entry.sku}, new stock: ${newStock}`);
              
              await ctx.db.patch(skuRecord._id, {
                currentStock: newStock,
                updatedAt: Date.now(),
              });
            }
          }
        }
        stockRestored = true;
      }
    }
    
    const activityHistory = order.activityHistory || [];
    activityHistory.push({
      timestamp: new Date().toISOString(),
      action: "cancelled",
      description: `Order cancelled (was: ${order.status})${stockRestored ? ' — stock restored' : ''}`,
      userId: user._id,
    });
    
    await ctx.db.patch(args.orderId, {
      previousStatus: order.status, // Save for undo
      status: "cancelled",
      activityHistory,
      updatedAt: Date.now(),
    });
    
    return { success: true, previousStatus: order.status, stockRestored };
  },
});

// Revert cancelled order to previous status
export const revertCancel = mutation({
  args: {
    token: v.string(),
    orderId: v.id("shopifyOrders"),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }
    
    const order = await ctx.db.get(args.orderId);
    if (!order || order.userId !== user._id) {
      throw new ConvexError("Comanda nu a fost găsită.");
    }
    
    if (order.status !== "cancelled") {
      throw new ConvexError("Comanda nu este anulată.");
    }
    
    const newStatus = order.previousStatus || "ready";
    
    const activityHistory = order.activityHistory || [];
    activityHistory.push({
      timestamp: new Date().toISOString(),
      action: "cancel_reverted",
      description: `Cancel reverted, status restored to: ${newStatus}`,
      userId: user._id,
    });
    
    await ctx.db.patch(args.orderId, {
      status: newStatus,
      previousStatus: undefined,
      activityHistory,
      updatedAt: Date.now(),
    });
    
    return { success: true, newStatus };
  },
});

// Get active orders by phone number (for multiple orders indicator)
export const getByPhone = query({
  args: {
    token: v.string(),
    phone: v.string(),
    excludeOrderId: v.optional(v.id("shopifyOrders")),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }
    
    if (!args.phone) return [];
    
    // Use customerPhone index for efficient lookup
    const orders = await ctx.db
      .query("shopifyOrders")
      .withIndex("by_userId_customerPhone", q =>
        q.eq("userId", user._id).eq("customerPhone", args.phone)
      )
      .collect();
    
    // Also try normalized variants
    const normalizedPhone = args.phone.replace(/\s/g, "").replace(/^\+40/, "0");
    let allMatches = orders;
    
    // If phone was provided in a different format, also query that
    if (args.phone !== normalizedPhone) {
      const normalizedOrders = await ctx.db
        .query("shopifyOrders")
        .withIndex("by_userId_customerPhone", q =>
          q.eq("userId", user._id).eq("customerPhone", normalizedPhone)
        )
        .collect();
      
      const seenIds = new Set(allMatches.map(o => o._id));
      for (const o of normalizedOrders) {
        if (!seenIds.has(o._id)) allMatches.push(o);
      }
    }
    
    // Filter active orders (not cancelled, no AWB)
    return allMatches.filter(o => {
      if (args.excludeOrderId && o._id === args.excludeOrderId) return false;
      if (o.status === "cancelled") return false;
      if (o.trackingNumber) return false; // Has AWB = not active
      if (o.deliveryStatus === "delivered") return false;
      return true;
    });
  },
});

// Update delivery status from Sameday
export const updateDeliveryStatus = mutation({
  args: {
    token: v.string(),
    orderId: v.id("shopifyOrders"),
    deliveryStatus: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    const order = await ctx.db.get(args.orderId);
    if (!order) {
      throw new ConvexError("Comanda nu a fost găsită.");
    }
    if (order.userId !== user._id) {
      throw new ConvexError("Nu ai acces la această comandă.");
    }

    const oldStatus = order.deliveryStatus;
    if (normalizeStatus(oldStatus) === normalizeStatus(args.deliveryStatus)) {
      await ctx.db.patch(args.orderId, {
        deliveryStatus: args.deliveryStatus,
        deliveryStatusUpdatedAt: Date.now(),
      });
      return { success: true, skipped: true };
    }

    const activityHistory = (order.activityHistory as any[] | undefined) || [];
    appendActivityIfNotDuplicate(activityHistory as ActivityEntry[], {
      timestamp: new Date().toISOString(),
      action: "delivery_status_changed",
      description: `Status livrare: ${oldStatus || "—"} → ${args.deliveryStatus}`,
      details: { oldStatus, newStatus: args.deliveryStatus },
    });
    
    await ctx.db.patch(args.orderId, {
      deliveryStatus: args.deliveryStatus,
      deliveryStatusUpdatedAt: Date.now(),
      activityHistory,
      updatedAt: Date.now(),
    });
    
    return { success: true };
  },
});

export const updateDeliveryStatusInternal = internalMutation({
  args: {
    orderId: v.id("shopifyOrders"),
    deliveryStatus: v.string(),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) {
      throw new ConvexError("Comanda nu a fost găsită.");
    }

    const oldStatus = order.deliveryStatus;
    if (normalizeStatus(oldStatus) === normalizeStatus(args.deliveryStatus)) {
      await ctx.db.patch(args.orderId, {
        deliveryStatus: args.deliveryStatus,
        deliveryStatusUpdatedAt: Date.now(),
      });
      return { success: true, skipped: true };
    }

    const activityHistory = (order.activityHistory as any[] | undefined) || [];
    appendActivityIfNotDuplicate(activityHistory as ActivityEntry[], {
      timestamp: new Date().toISOString(),
      action: "delivery_status_changed",
      description: `Status livrare: ${oldStatus || "—"} → ${args.deliveryStatus}`,
      details: { oldStatus, newStatus: args.deliveryStatus },
    });

    await ctx.db.patch(args.orderId, {
      deliveryStatus: args.deliveryStatus,
      deliveryStatusUpdatedAt: Date.now(),
      activityHistory,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

// Update order items (for adding/removing SKUs)
export const updateItems = mutation({
  args: {
    token: v.string(),
    orderId: v.id("shopifyOrders"),
    items: v.array(v.any()),
    totalPrice: v.number(),
    subtotalPrice: v.optional(v.number()),
    totalDiscounts: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }
    
    const order = await ctx.db.get(args.orderId);
    if (!order || order.userId !== user._id) {
      throw new ConvexError("Comanda nu a fost găsită.");
    }
    
    const activityHistory = order.activityHistory || [];
    activityHistory.push({
      timestamp: new Date().toISOString(),
      action: "items_updated",
      description: "Order items updated",
      userId: user._id,
    });
    
    const patch: Record<string, unknown> = {
      items: args.items,
      totalPrice: args.totalPrice,
      subtotalPrice: args.subtotalPrice,
      activityHistory,
      updatedAt: Date.now(),
    };
    if (args.totalDiscounts !== undefined) {
      patch.totalDiscounts = args.totalDiscounts;
    }
    
    await ctx.db.patch(args.orderId, patch);
    
    return { success: true };
  },
});

// Helper function to calculate revenue by currency
function calculateRevenueByCurrency(orders: Array<{ totalPrice: number; currency?: string }>) {
  const byCurrency: Record<string, number> = {};
  for (const order of orders) {
    const currency = order.currency || "RON";
    byCurrency[currency] = (byCurrency[currency] || 0) + order.totalPrice;
  }
  // Determine primary currency (most common)
  const primaryCurrency = Object.entries(byCurrency)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || "RON";
  
  return {
    total: byCurrency[primaryCurrency] || 0,
    currency: primaryCurrency,
    byCurrency,
  };
}

export const getStatsAuthUser = internalQuery({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    return await getUserFromToken(ctx, args.token);
  },
});

export const getStatsDailySalesRows = internalQuery({
  args: {
    userId: v.id("profiles"),
    shopDomain: v.optional(v.string()),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    return args.shopDomain
      ? await ctx.db
          .query("dailySales")
          .withIndex("by_userId_shopDomain_date", (q: any) =>
            q.eq("userId", args.userId).eq("shopDomain", args.shopDomain!).gte("date", args.startDate).lte("date", args.endDate)
          )
          .collect()
      : await ctx.db
          .query("dailySales")
          .withIndex("by_userId_date", (q: any) =>
            q.eq("userId", args.userId).gte("date", args.startDate).lte("date", args.endDate)
          )
          .filter((q: any) => q.eq(q.field("shopDomain"), undefined))
          .collect();
  },
});

export const getStatsOrdersPage = internalQuery({
  args: {
    userId: v.id("profiles"),
    shopDomain: v.optional(v.string()),
    startDate: v.string(),
    endDate: v.optional(v.string()),
    fulfillmentStatus: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    let result;
    if (args.shopDomain && args.fulfillmentStatus) {
      result = await ctx.db
        .query("shopifyOrders")
        .withIndex("by_userId_shopDomain_fulfillmentStatus_placedOn", (q: any) => {
          const base = q
            .eq("userId", args.userId)
            .eq("shopDomain", args.shopDomain!)
            .eq("fulfillmentStatus", args.fulfillmentStatus!)
            .gte("placedOn", args.startDate);
          if (args.endDate) return base.lte("placedOn", args.endDate);
          return base;
        })
        .order("desc")
        .paginate(args.paginationOpts);
    } else if (args.shopDomain) {
      result = await ctx.db
        .query("shopifyOrders")
        .withIndex("by_userId_shopDomain_placedOn", (q: any) => {
          const base = q.eq("userId", args.userId).eq("shopDomain", args.shopDomain!).gte("placedOn", args.startDate);
          if (args.endDate) return base.lte("placedOn", args.endDate);
          return base;
        })
        .order("desc")
        .paginate(args.paginationOpts);
    } else if (args.fulfillmentStatus) {
      result = await ctx.db
        .query("shopifyOrders")
        .withIndex("by_userId_fulfillmentStatus_placedOn", (q: any) => {
          const base = q
            .eq("userId", args.userId)
            .eq("fulfillmentStatus", args.fulfillmentStatus!)
            .gte("placedOn", args.startDate);
          if (args.endDate) return base.lte("placedOn", args.endDate);
          return base;
        })
        .order("desc")
        .paginate(args.paginationOpts);
    } else {
      result = await ctx.db
        .query("shopifyOrders")
        .withIndex("by_userId_placedOn", (q: any) => {
          const base = q.eq("userId", args.userId).gte("placedOn", args.startDate);
          if (args.endDate) return base.lte("placedOn", args.endDate);
          return base;
        })
        .order("desc")
        .paginate(args.paginationOpts);
    }

    return {
      ...result,
      page: result.page.map((order: any) => ({
        placedOn: order.placedOn,
        fulfillmentStatus: order.fulfillmentStatus,
        status: order.status,
        totalPrice: order.totalPrice,
        currency: order.currency,
      })),
    };
  },
});

// Dashboard stats
export const getStats: any = action({
  args: {
    token: v.string(),
    shopDomain: v.optional(v.string()), // Filter by store
  },
  handler: async (ctx, args): Promise<any> => {
    const user = await ctx.runQuery("orders:getStatsAuthUser" as any, { token: args.token });
    if (!user) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    const today = new Date().toISOString().split("T")[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const pendingCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const PAGE_SIZE = 400;

    const dailySales = await ctx.runQuery("orders:getStatsDailySalesRows" as any, {
      userId: user._id,
      shopDomain: args.shopDomain,
      startDate: monthAgo,
      endDate: today,
    });

    if (dailySales.length > 0) {
      const pendingScan: Array<{ status?: string; totalPrice: number }> = [];
      let pendingCursor: string | null = null;
      let pendingDone = false;
      while (!pendingDone) {
        const pageResult: any = await ctx.runQuery("orders:getStatsOrdersPage" as any, {
          userId: user._id,
          shopDomain: args.shopDomain,
          startDate: pendingCutoff,
          endDate: today,
          fulfillmentStatus: "unfulfilled",
          paginationOpts: { numItems: PAGE_SIZE, cursor: pendingCursor },
        });
        pendingScan.push(...pageResult.page);
        pendingDone = pageResult.isDone;
        pendingCursor = pageResult.continueCursor;
      }

      const todayRows = dailySales.filter((d: any) => d.date === today);
      const weekRows = dailySales.filter((d: any) => d.date >= weekAgo);
      const monthRows = dailySales;
      const pendingOrders = pendingScan.filter((o: any) => o.status !== "cancelled");

      const sumCount = (rows: any[]) => rows.reduce((sum, r) => sum + (r.totalOrders || 0), 0);
      const sumRevenue = (rows: any[]) => rows.reduce((sum, r) => sum + (r.totalRevenue || 0), 0);
      const pendingRevenue = pendingOrders.reduce((sum, o) => sum + o.totalPrice, 0);

      return {
        today: {
          count: sumCount(todayRows),
          revenue: sumRevenue(todayRows),
          currency: "RON",
          revenueByCurrency: { RON: sumRevenue(todayRows) },
        },
        thisWeek: {
          count: sumCount(weekRows),
          revenue: sumRevenue(weekRows),
          currency: "RON",
          revenueByCurrency: { RON: sumRevenue(weekRows) },
        },
        thisMonth: {
          count: sumCount(monthRows),
          revenue: sumRevenue(monthRows),
          currency: "RON",
          revenueByCurrency: { RON: sumRevenue(monthRows) },
        },
        pending: {
          count: pendingOrders.length,
          revenue: pendingRevenue,
          currency: "RON",
          revenueByCurrency: { RON: pendingRevenue },
        },
        total: {
          count: sumCount(monthRows),
          revenue: sumRevenue(monthRows),
          currency: "RON",
          revenueByCurrency: { RON: sumRevenue(monthRows) },
        },
      };
    }

    // Fallback when daily aggregates are not available yet: paginate through
    // all month orders to keep exact totals without hitting single-execution
    // read limits.
    const monthOrders: Array<{
      placedOn: string;
      fulfillmentStatus?: string;
      status?: string;
      totalPrice: number;
      currency?: string;
    }> = [];
    let monthCursor: string | null = null;
    let monthDone = false;
    while (!monthDone) {
      const pageResult: any = await ctx.runQuery("orders:getStatsOrdersPage" as any, {
        userId: user._id,
        shopDomain: args.shopDomain,
        startDate: monthAgo,
        endDate: today,
        paginationOpts: { numItems: PAGE_SIZE, cursor: monthCursor },
      });
      monthOrders.push(...pageResult.page);
      monthDone = pageResult.isDone;
      monthCursor = pageResult.continueCursor;
    }

    const ordersToday = monthOrders.filter((o) => o.placedOn === today);
    const ordersThisWeek = monthOrders.filter((o) => o.placedOn >= weekAgo);
    const ordersThisMonth = monthOrders;
    const pendingOrders = monthOrders.filter((o) => o.fulfillmentStatus === "unfulfilled" && o.status !== "cancelled");

    const todayRevenue = calculateRevenueByCurrency(ordersToday);
    const weekRevenue = calculateRevenueByCurrency(ordersThisWeek);
    const monthRevenue = calculateRevenueByCurrency(ordersThisMonth);
    const pendingRevenue = calculateRevenueByCurrency(pendingOrders);

    return {
      today: {
        count: ordersToday.length,
        revenue: todayRevenue.total,
        currency: todayRevenue.currency,
        revenueByCurrency: todayRevenue.byCurrency,
      },
      thisWeek: {
        count: ordersThisWeek.length,
        revenue: weekRevenue.total,
        currency: weekRevenue.currency,
        revenueByCurrency: weekRevenue.byCurrency,
      },
      thisMonth: {
        count: ordersThisMonth.length,
        revenue: monthRevenue.total,
        currency: monthRevenue.currency,
        revenueByCurrency: monthRevenue.byCurrency,
      },
      pending: {
        count: pendingOrders.length,
        revenue: pendingRevenue.total,
        currency: pendingRevenue.currency,
        revenueByCurrency: pendingRevenue.byCurrency,
      },
      total: {
        count: monthOrders.length,
        revenue: monthRevenue.total,
        currency: monthRevenue.currency,
        revenueByCurrency: monthRevenue.byCurrency,
      },
    };
  },
});

// ============================================
// PRINT LOGS
// ============================================

// Log when a document is printed
export const logPrint = mutation({
  args: {
    token: v.string(),
    orderId: v.id("shopifyOrders"),
    documentType: v.string(), // "awb", "invoice", "both"
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }
    
    const order = await ctx.db.get(args.orderId);
    if (!order || order.userId !== user._id) {
      throw new ConvexError("Comanda nu a fost găsită.");
    }

    const docLabel = args.documentType === "both" ? "AWB + Factură" : args.documentType === "awb" ? "AWB" : "Factură";
    const activityHistory = (order.activityHistory as any[] | undefined) || [];
    activityHistory.push({
      timestamp: new Date().toISOString(),
      action: "printed",
      description: `Printat: ${docLabel}`,
      details: { documentType: args.documentType },
      userId: user._id,
      userName: user.name || user.email,
    });
    
    await ctx.db.insert("orderPrintLogs", {
      orderId: args.orderId,
      documentType: args.documentType,
      printedBy: user._id,
      printedByName: user.name || user.email,
      printedAt: new Date().toISOString(),
      createdAt: Date.now(),
    });

    await ctx.db.patch(args.orderId, {
      activityHistory,
      updatedAt: Date.now(),
    });
    
    return { success: true };
  },
});

// Log print for multiple orders (batch)
export const logPrintBatch = mutation({
  args: {
    token: v.string(),
    orderIds: v.array(v.id("shopifyOrders")),
    documentType: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }
    
    const now = Date.now();
    const printedAt = new Date().toISOString();
    const docLabel = args.documentType === "both" ? "AWB + Factură" : args.documentType === "awb" ? "AWB" : "Factură";
    
    for (const orderId of args.orderIds) {
      const order = await ctx.db.get(orderId);
      if (!order || order.userId !== user._id) continue;

      // Activity history entry
      const activityHistory = (order.activityHistory as any[] | undefined) || [];
      activityHistory.push({
        timestamp: printedAt,
        action: "printed",
        description: `Printat: ${docLabel}`,
        details: { documentType: args.documentType },
        userId: user._id,
        userName: user.name || user.email,
      });

      // Update order directly (denormalized for instant UI)
      const printUpdate: Record<string, unknown> = {
        lastPrintedAt: printedAt,
        lastPrintedBy: user._id,
        activityHistory,
        updatedAt: now,
      };
      
      if (args.documentType === "awb" || args.documentType === "both") {
        printUpdate.printedAwb = true;
      }
      if (args.documentType === "invoice" || args.documentType === "both") {
        printUpdate.printedInvoice = true;
      }
      
      await ctx.db.patch(orderId, printUpdate);
      
      // Also keep log for history (optional, can remove later)
      await ctx.db.insert("orderPrintLogs", {
        orderId,
        documentType: args.documentType,
        printedBy: user._id,
        printedByName: user.name || user.email,
        printedAt,
        createdAt: now,
      });
    }
    
    return { success: true, count: args.orderIds.length };
  },
});

// Get print logs for an order
export const getPrintLogs = query({
  args: {
    token: v.string(),
    orderId: v.id("shopifyOrders"),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }
    
    return await ctx.db
      .query("orderPrintLogs")
      .withIndex("by_orderId", q => q.eq("orderId", args.orderId))
      .order("desc")
      .collect();
  },
});

// Get print status for multiple orders (for table display)
export const getPrintStatusBatch = query({
  args: {
    token: v.string(),
    orderIds: v.array(v.id("shopifyOrders")),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }
    
    const result: Record<string, { awb: boolean; invoice: boolean; both: boolean; lastPrintedAt?: string }> = {};
    
    for (const orderId of args.orderIds) {
      const logs = await ctx.db
        .query("orderPrintLogs")
        .withIndex("by_orderId", q => q.eq("orderId", orderId))
        .collect();
      
      const hasAwb = logs.some(l => l.documentType === "awb" || l.documentType === "both");
      const hasInvoice = logs.some(l => l.documentType === "invoice" || l.documentType === "both");
      const hasBoth = logs.some(l => l.documentType === "both");
      const lastLog = logs.sort((a, b) => b.createdAt - a.createdAt)[0];
      
      result[orderId] = {
        awb: hasAwb,
        invoice: hasInvoice,
        both: hasBoth,
        lastPrintedAt: lastLog?.printedAt,
      };
    }
    
    return result;
  },
});

// ============================================
// WORKED STATUS
// ============================================

// Mark order as worked/not worked (manual-only local flag)
// Also deducts/restores stock when stockManagement === "local"
export const setWorkedStatus = mutation({
  args: {
    token: v.string(),
    orderId: v.id("shopifyOrders"),
    isWorked: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }
    
    const order = await ctx.db.get(args.orderId);
    if (!order || order.userId !== user._id) {
      throw new ConvexError("Comanda nu a fost găsită.");
    }

    // Check stock management setting
    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_userId", (q: any) => q.eq("userId", user._id))
      .first();
    const stockManagement = settings?.stockManagement || "shopify";
    let stockDeducted = order.stockDeducted || false;
    const wasWorked = order.isWorked === true;
    const now = Date.now();

    if (stockManagement === "local") {
      const items = order.items as OrderItemStock[];
      const bundleCache = new Map<string, string[] | null>();

      if (args.isWorked && !order.stockDeducted) {
        // Marking as worked → deduct stock
        for (const item of items) {
          const entries = await getStockAdjustmentEntriesForItem(ctx, user._id, item, bundleCache);
          for (const entry of entries) {
            const skuRecord = await ctx.db
              .query("skus")
              .withIndex("by_userId_sku", (q: any) =>
                q.eq("userId", user._id).eq("sku", entry.sku)
              )
              .first();
            if (skuRecord) {
              const newStock = Math.max(0, skuRecord.currentStock - entry.quantity);
              await ctx.db.patch(skuRecord._id, {
                currentStock: newStock,
                updatedAt: now,
              });
            }
          }
        }
        stockDeducted = true;
      } else if (!args.isWorked && order.stockDeducted) {
        // Un-marking as worked → restore stock
        for (const item of items) {
          const entries = await getStockAdjustmentEntriesForItem(ctx, user._id, item, bundleCache);
          for (const entry of entries) {
            const skuRecord = await ctx.db
              .query("skus")
              .withIndex("by_userId_sku", (q: any) =>
                q.eq("userId", user._id).eq("sku", entry.sku)
              )
              .first();
            if (skuRecord) {
              const newStock = skuRecord.currentStock + entry.quantity;
              await ctx.db.patch(skuRecord._id, {
                currentStock: newStock,
                updatedAt: now,
              });
            }
          }
        }
        stockDeducted = false;
      }
    }

    // Activity history
    const activityHistory = (order.activityHistory as any[] | undefined) || [];
    const timestamp = new Date().toISOString();
    activityHistory.push({
      timestamp,
      action: args.isWorked ? "marked_worked" : "unmarked_worked",
      description: args.isWorked
        ? `Marcat ca lucrat${stockDeducted ? " (stoc dedus)" : ""}`
        : `Demarcat ca lucrat${!stockDeducted && order.stockDeducted ? " (stoc restaurat)" : ""}`,
      details: { isWorked: args.isWorked, stockDeducted },
      userId: user._id,
      userName: user.name || user.email,
    });

    // Update directly on the order (denormalized for instant UI updates)
    await ctx.db.patch(args.orderId, {
      isWorked: args.isWorked,
      workedAt: args.isWorked ? timestamp : undefined,
      workedBy: args.isWorked ? user._id : undefined,
      workedByName: args.isWorked ? (user.name || user.email) : undefined,
      stockDeducted,
      stockDeductedAt: stockDeducted ? timestamp : undefined,
      activityHistory,
      updatedAt: now,
    });

    if (!wasWorked && args.isWorked) {
      await addInvoiceWorkedSnapshot(ctx, order, now);
    } else if (wasWorked && !args.isWorked) {
      await removeInvoiceWorkedSnapshot(ctx, args.orderId, now);
    }
    
    return { success: true, stockDeducted };
  },
});

// Legacy - keep for backward compatibility but mark as deprecated
export const setWorkedStatusLegacy = mutation({
  args: {
    token: v.string(),
    orderId: v.id("shopifyOrders"),
    isWorked: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }
    
    const order = await ctx.db.get(args.orderId);
    if (!order || order.userId !== user._id) {
      throw new ConvexError("Comanda nu a fost găsită.");
    }
    
    // Check if status record exists
    const existing = await ctx.db
      .query("orderWorkedStatus")
      .withIndex("by_orderId", q => q.eq("orderId", args.orderId))
      .first();
    
    const now = Date.now();
    const workedAt = new Date().toISOString();
    
    if (existing) {
      await ctx.db.patch(existing._id, {
        isWorked: args.isWorked,
        workedBy: user._id,
        workedByName: user.name || user.email,
        workedAt,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("orderWorkedStatus", {
        orderId: args.orderId,
        isWorked: args.isWorked,
        workedBy: user._id,
        workedByName: user.name || user.email,
        workedAt,
        createdAt: now,
        updatedAt: now,
      });
    }
    
    return { success: true, isWorked: args.isWorked };
  },
});

// Batch set worked status (manual-only local flag)
// Also deducts/restores stock when stockManagement === "local"
export const setWorkedStatusBatch = mutation({
  args: {
    token: v.string(),
    orderIds: v.array(v.id("shopifyOrders")),
    isWorked: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    // Check stock management setting
    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_userId", (q: any) => q.eq("userId", user._id))
      .first();
    const stockManagement = settings?.stockManagement || "shopify";
    const isLocalStock = stockManagement === "local";
    
    const now = Date.now();
    const workedAt = new Date().toISOString();
    
    let updatedCount = 0;
    let stockAdjustedCount = 0;
    for (const orderId of args.orderIds) {
      const order = await ctx.db.get(orderId);
      if (!order || order.userId !== user._id) continue;
      const wasWorked = order.isWorked === true;

      let stockDeducted = order.stockDeducted || false;

      if (isLocalStock) {
        const items = order.items as OrderItemStock[];
        const bundleCache = new Map<string, string[] | null>();

        if (args.isWorked && !order.stockDeducted) {
          // Marking as worked → deduct stock
          for (const item of items) {
            const entries = await getStockAdjustmentEntriesForItem(ctx, user._id, item, bundleCache);
            for (const entry of entries) {
              const skuRecord = await ctx.db
                .query("skus")
                .withIndex("by_userId_sku", (q: any) =>
                  q.eq("userId", user._id).eq("sku", entry.sku)
                )
                .first();
              if (skuRecord) {
                const newStock = Math.max(0, skuRecord.currentStock - entry.quantity);
                await ctx.db.patch(skuRecord._id, {
                  currentStock: newStock,
                  updatedAt: now,
                });
              }
            }
          }
          stockDeducted = true;
          stockAdjustedCount++;
        } else if (!args.isWorked && order.stockDeducted) {
          // Un-marking as worked → restore stock
          for (const item of items) {
            const entries = await getStockAdjustmentEntriesForItem(ctx, user._id, item, bundleCache);
            for (const entry of entries) {
              const skuRecord = await ctx.db
                .query("skus")
                .withIndex("by_userId_sku", (q: any) =>
                  q.eq("userId", user._id).eq("sku", entry.sku)
                )
                .first();
              if (skuRecord) {
                const newStock = skuRecord.currentStock + entry.quantity;
                await ctx.db.patch(skuRecord._id, {
                  currentStock: newStock,
                  updatedAt: now,
                });
              }
            }
          }
          stockDeducted = false;
          stockAdjustedCount++;
        }
      }
      
      // Activity history
      const activityHistory = (order.activityHistory as any[] | undefined) || [];
      activityHistory.push({
        timestamp: workedAt,
        action: args.isWorked ? "marked_worked" : "unmarked_worked",
        description: args.isWorked
          ? `Marcat ca lucrat${stockDeducted ? " (stoc dedus)" : ""}`
          : `Demarcat ca lucrat${!stockDeducted && order.stockDeducted ? " (stoc restaurat)" : ""}`,
        details: { isWorked: args.isWorked, stockDeducted },
        userId: user._id,
        userName: user.name || user.email,
      });

      // Update order directly (denormalized)
      await ctx.db.patch(orderId, {
        isWorked: args.isWorked,
        workedAt: args.isWorked ? workedAt : undefined,
        workedBy: args.isWorked ? user._id : undefined,
        workedByName: args.isWorked ? (user.name || user.email) : undefined,
        stockDeducted,
        stockDeductedAt: stockDeducted ? workedAt : undefined,
        activityHistory,
        updatedAt: now,
      });

      if (!wasWorked && args.isWorked) {
        await addInvoiceWorkedSnapshot(ctx, order, now);
      } else if (wasWorked && !args.isWorked) {
        await removeInvoiceWorkedSnapshot(ctx, orderId, now);
      }
      updatedCount++;
    }
    
    return { success: true, count: updatedCount, stockAdjustedCount };
  },
});

// Get worked status for an order
export const getWorkedStatus = query({
  args: {
    token: v.string(),
    orderId: v.id("shopifyOrders"),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }
    
    return await ctx.db
      .query("orderWorkedStatus")
      .withIndex("by_orderId", q => q.eq("orderId", args.orderId))
      .first();
  },
});

// Get worked status for multiple orders (for table display)
export const getWorkedStatusBatch = query({
  args: {
    token: v.string(),
    orderIds: v.array(v.id("shopifyOrders")),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }
    
    const result: Record<string, { isWorked: boolean; workedAt?: string; workedByName?: string }> = {};
    
    for (const orderId of args.orderIds) {
      const status = await ctx.db
        .query("orderWorkedStatus")
        .withIndex("by_orderId", q => q.eq("orderId", orderId))
        .first();
      
      result[orderId] = {
        isWorked: status?.isWorked || false,
        workedAt: status?.workedAt,
        workedByName: status?.workedByName,
      };
    }
    
    return result;
  },
});

// One-time migration: Set currency for Hungarian orders
export const migrateHungarianOrdersCurrency = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new ConvexError("Sesiune expirată.");
    }
    
    // Get all orders for this user
    const orders = await ctx.db
      .query("shopifyOrders")
      .withIndex("by_userId", q => q.eq("userId", user._id))
      .collect();
    
    let updated = 0;
    
    for (const order of orders) {
      // Check if order is Hungarian (by country or countryCode in shipping address)
      const shippingAddress = order.shippingAddress as {
        country?: string;
        countryCode?: string;
      } | null;
      
      const isHungarian = 
        shippingAddress?.country?.toLowerCase() === "hungary" ||
        shippingAddress?.country?.toLowerCase() === "magyarország" ||
        shippingAddress?.countryCode?.toUpperCase() === "HU";
      
      // If Hungarian and no currency set (or set to RON), update to HUF
      if (isHungarian && (!order.currency || order.currency === "RON")) {
        await ctx.db.patch(order._id, {
          currency: "HUF",
          updatedAt: Date.now(),
        });
        updated++;
      }
    }
    
    return { updated, total: orders.length };
  },
});

// One-time migration: Set currency for all orders belonging to a specific Shopify store alias
// Useful when shippingAddress country/countryCode isn't consistent but shopDomain is.
export const migrateStoreOrdersCurrencyByAlias = mutation({
  args: {
    token: v.string(),
    storeAlias: v.string(), // e.g. "ungaria"
    currency: v.string(), // e.g. "HUF"
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new ConvexError("Sesiune expirată.");
    }

    const stores = await ctx.db
      .query("shopifyStoreConnections")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    const normalizedAlias = args.storeAlias.trim().toLowerCase();
    const store = stores.find((s) => {
      const alias = (s.alias || "").trim().toLowerCase();
      const name = (s.connectionName || "").trim().toLowerCase();
      const domain = (s.shopDomain || "").trim().toLowerCase();
      return alias === normalizedAlias || name === normalizedAlias || domain === normalizedAlias;
    });

    if (!store) {
      throw new ConvexError(
        `Nu am găsit un magazin Shopify cu alias "${args.storeAlias}". Verifică alias-ul în Connections.`
      );
    }

    const orders = await ctx.db
      .query("shopifyOrders")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    let updated = 0;
    const targetCurrency = args.currency.trim().toUpperCase();

    // Normalize domain/host for robust matching across:
    // - "myshop.myshopify.com"
    // - "https://myshop.myshopify.com"
    // - "myshop.myshopify.com/"
    // - accidental whitespace / casing
    const normalizeHost = (value: unknown): string => {
      if (!value) return "";
      const raw = String(value).trim().toLowerCase();
      if (!raw) return "";
      try {
        if (raw.startsWith("http://") || raw.startsWith("https://")) {
          return new URL(raw).host;
        }
      } catch {
        // ignore
      }
      const noProto = raw.replace(/^https?:\/\//, "");
      return noProto.split("/")[0].trim();
    };

    const targetShopHost = normalizeHost(store.shopDomain || store.shopUrl);

    for (const order of orders) {
      const orderHost = normalizeHost(order.shopDomain);
      if (!orderHost || orderHost !== targetShopHost) continue;
      if (order.currency === targetCurrency) continue;

      await ctx.db.patch(order._id, {
        currency: targetCurrency,
        updatedAt: Date.now(),
      });
      updated++;
    }

    return {
      updated,
      total: orders.length,
      shopDomain: store.shopDomain,
      currency: targetCurrency,
      shopHost: targetShopHost,
    };
  },
});

// ============================================
// MIGRATION: Deduct stock for already-worked orders
// ============================================
// One-time migration to fix stock for orders that were marked as worked
// before stock deduction was implemented.
export const migrateDeductStockForWorkedOrders = mutation({
  args: {
    token: v.string(),
    dryRun: v.optional(v.boolean()), // If true, returns what would happen without making changes
    cursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    // Check stock management setting
    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_userId", (q: any) => q.eq("userId", user._id))
      .first();
    const stockManagement = settings?.stockManagement || "shopify";
    
    if (stockManagement !== "local") {
      return {
        success: false,
        error: "Stock management is not set to 'local'. No migration needed.",
        ordersProcessed: 0,
        skuAdjustments: [] as { sku: string; totalDeducted: number; newStock: number }[],
      };
    }

    const dryRun = !!args.dryRun;
    // Keep each execution small to avoid Convex function read limits.
    const batchSize = Math.min(Math.max(Math.floor(args.batchSize ?? 150), 25), 300);

    // Read only one page of orders for this execution.
    const ordersPage = await ctx.db
      .query("shopifyOrders")
      .withIndex("by_userId", (q: any) => q.eq("userId", user._id))
      .paginate({
        numItems: batchSize,
        cursor: args.cursor ?? null,
      });

    const workedNotDeducted = ordersPage.page.filter(
      (o) => o.isWorked === true && !o.stockDeducted && o.status !== "cancelled"
    );

    if (workedNotDeducted.length === 0 && ordersPage.isDone) {
      return {
        success: true,
        message: "No orders to migrate. All worked orders already have stock deducted.",
        dryRun,
        ordersProcessed: 0,
        scannedOrders: 0,
        skuAdjustments: [],
        nextCursor: null,
        isDone: true,
      };
    }

    // Accumulate total deductions per SKU
    const skuDeductions = new Map<string, number>();
    const bundleCache = new Map<string, string[] | null>();
    for (const order of workedNotDeducted) {
      const items = order.items as OrderItemStock[];
      for (const item of items) {
        const entries = await getStockAdjustmentEntriesForItem(ctx, user._id, item, bundleCache);
        for (const entry of entries) {
          skuDeductions.set(entry.sku, (skuDeductions.get(entry.sku) || 0) + entry.quantity);
        }
      }
    }

    const skuAdjustments: { sku: string; totalDeducted: number; newStock: number; oldStock: number }[] = [];
    const now = Date.now();
    const timestamp = new Date().toISOString();

    if (!dryRun) {
      // Deduct stock for each SKU
      for (const [sku, totalQty] of skuDeductions) {
        const skuRecord = await ctx.db
          .query("skus")
          .withIndex("by_userId_sku", (q: any) =>
            q.eq("userId", user._id).eq("sku", sku)
          )
          .first();
        if (skuRecord) {
          const oldStock = skuRecord.currentStock;
          const newStock = Math.max(0, skuRecord.currentStock - totalQty);
          await ctx.db.patch(skuRecord._id, {
            currentStock: newStock,
            updatedAt: now,
          });
          skuAdjustments.push({ sku, totalDeducted: totalQty, newStock, oldStock });
        } else {
          skuAdjustments.push({ sku, totalDeducted: totalQty, newStock: 0, oldStock: 0 });
        }
      }

      // Mark all these orders as stockDeducted
      for (const order of workedNotDeducted) {
        await ctx.db.patch(order._id, {
          stockDeducted: true,
          stockDeductedAt: timestamp,
          updatedAt: now,
        });
      }
    } else {
      // Dry run - just compute what would happen
      for (const [sku, totalQty] of skuDeductions) {
        const skuRecord = await ctx.db
          .query("skus")
          .withIndex("by_userId_sku", (q: any) =>
            q.eq("userId", user._id).eq("sku", sku)
          )
          .first();
        const oldStock = skuRecord?.currentStock ?? 0;
        const newStock = Math.max(0, oldStock - totalQty);
        skuAdjustments.push({ sku, totalDeducted: totalQty, newStock, oldStock });
      }
    }

    return {
      success: true,
      dryRun,
      ordersProcessed: workedNotDeducted.length,
      scannedOrders: ordersPage.page.length,
      skuAdjustments,
      nextCursor: ordersPage.continueCursor,
      isDone: ordersPage.isDone,
    };
  },
});

// ============================================
// MIGRATION: Backfill stockDeducted flags only (no stock movement)
// ============================================
// Safe repair for orders that already had stock deducted but lost the UI flag
// after Shopify upsert/webhook overwrites.
export const backfillStockDeductedFlagsOnly = mutation({
  args: {
    token: v.string(),
    dryRun: v.optional(v.boolean()),
    cursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    const dryRun = !!args.dryRun;
    const batchSize = Math.min(Math.max(Math.floor(args.batchSize ?? 200), 25), 400);
    const ordersPage = await ctx.db
      .query("shopifyOrders")
      .withIndex("by_userId", (q: any) => q.eq("userId", user._id))
      .paginate({
        numItems: batchSize,
        cursor: args.cursor ?? null,
      });

    const workedWithoutFlag = ordersPage.page.filter(
      (o) => o.isWorked === true && !o.stockDeducted && o.status !== "cancelled"
    );

    if (!dryRun && workedWithoutFlag.length > 0) {
      const now = Date.now();
      const timestamp = new Date().toISOString();
      for (const order of workedWithoutFlag) {
        await ctx.db.patch(order._id, {
          stockDeducted: true,
          stockDeductedAt: order.workedAt || timestamp,
          updatedAt: now,
        });
      }
    }

    return {
      success: true,
      dryRun,
      ordersProcessed: workedWithoutFlag.length,
      scannedOrders: ordersPage.page.length,
      nextCursor: ordersPage.continueCursor,
      isDone: ordersPage.isDone,
    };
  },
});
