import { mutation } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import { getUserFromToken } from "../auth";

export const quickStockReturn = mutation({
  args: {
    token: v.string(),
    orderIds: v.array(v.id("shopifyOrders")),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new ConvexError("Sesiune expirată.");
    }

    const results: { orderNumber: string; itemsAdded: number; success: boolean; error?: string }[] = [];
    
    // Batch fetch all orders
    const orders = await Promise.all(
      args.orderIds.map((id) => ctx.db.get(id))
    );

    for (let i = 0; i < args.orderIds.length; i++) {
      const orderId = args.orderIds[i];
      const order = orders[i];
      
      if (!order || order.userId !== user._id) {
        results.push({ orderNumber: "?", itemsAdded: 0, success: false, error: "Comandă negăsită" });
        continue;
      }

      try {
        const items = (order.items as Array<{ sku?: string; quantity?: number }>) || [];
        const adjustments = items.filter((item) => item.sku).map((item) => ({ sku: item.sku!, quantity: item.quantity || 1 }));

        // Batch fetch all skus
        const skus = await Promise.all(
          adjustments.map((adj) => 
            ctx.db
              .query("skus")
              .withIndex("by_userId_sku", (q) => q.eq("userId", user._id).eq("sku", adj.sku))
              .first()
          )
        );

        for (let j = 0; j < adjustments.length; j++) {
          const adj = adjustments[j];
          const sku = skus[j];
          if (sku) {
            await ctx.db.patch(sku._id, {
              currentStock: sku.currentStock + adj.quantity,
              updatedAt: Date.now(),
            });
          }
        }

        const now = Date.now();
        const today = new Date().toISOString().split("T")[0];
        const returnId = await ctx.db.insert("returns", {
          userId: user._id,
          awbNumber: order.trackingNumber || `ORDER-${order.orderNumber}`,
          shopifyOrderId: order.shopifyOrderId,
          shopDomain: order.shopDomain,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          customerEmail: order.customerEmail,
          returnDate: today,
          returnReason: "Quick stock return",
          returnStatus: "processed",
          returnedItems: items,
          notes: `[Quick Stock Return ${new Date().toLocaleString("ro-RO")}] Stock adăugat pentru ${adjustments.length} SKU-uri`,
          createdAt: now,
          updatedAt: now,
        });

        const activityHistory = (order.activityHistory as any[] | undefined) || [];
        const totalUnits = adjustments.reduce((sum, a) => sum + a.quantity, 0);
        activityHistory.push({
          timestamp: new Date().toISOString(),
          action: "return_stock_added",
          description: `Retur rapid: +${totalUnits} unități adăugate în stoc (${adjustments
            .map((a) => `${a.sku} x${a.quantity}`)
            .join(", ")})`,
          details: { adjustments, returnId },
          userId: user._id,
          userName: user.name || user.email,
        });

        await ctx.db.patch(orderId, {
          isReturned: true,
          returnedAt: new Date().toISOString(),
          returnId: returnId,
          activityHistory,
          updatedAt: now,
        });

        results.push({ orderNumber: order.orderNumber || "?", itemsAdded: totalUnits, success: true });
      } catch (error) {
        results.push({
          orderNumber: order.orderNumber || "?",
          itemsAdded: 0,
          success: false,
          error: error instanceof Error ? error.message : "Eroare necunoscută",
        });
      }
    }

    return {
      success: results.every((r) => r.success),
      results,
      totalItemsAdded: results.reduce((sum, r) => sum + r.itemsAdded, 0),
    };
  },
});

export const create = mutation({
  args: {
    token: v.string(),
    awbNumber: v.string(),
    shopifyOrderId: v.optional(v.string()),
    shopDomain: v.optional(v.string()),
    orderNumber: v.optional(v.string()),
    customerName: v.optional(v.string()),
    customerEmail: v.optional(v.string()),
    returnReason: v.optional(v.string()),
    notes: v.optional(v.string()),
    returnStatus: v.optional(v.union(v.literal("pending"), v.literal("processed"))),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new ConvexError("Sesiune expirată.");
    }

    const existing = await ctx.db.query("returns").withIndex("by_awbNumber", (q) => q.eq("awbNumber", args.awbNumber)).first();
    if (existing && existing.userId === user._id) {
      throw new ConvexError("Un retur cu acest AWB există deja.");
    }

    const now = Date.now();
    const today = new Date().toISOString().split("T")[0];
    let resolvedShopDomain = args.shopDomain;
    if (!resolvedShopDomain && args.shopifyOrderId) {
      const linkedOrder = await ctx.db
        .query("shopifyOrders")
        .withIndex("by_userId_shopifyOrderId", (q: any) => q.eq("userId", user._id).eq("shopifyOrderId", args.shopifyOrderId!))
        .first();
      resolvedShopDomain = linkedOrder?.shopDomain;
    }

    const returnId = await ctx.db.insert("returns", {
      userId: user._id,
      awbNumber: args.awbNumber,
      shopifyOrderId: args.shopifyOrderId,
      shopDomain: resolvedShopDomain,
      orderNumber: args.orderNumber,
      customerName: args.customerName,
      customerEmail: args.customerEmail,
      returnDate: today,
      returnReason: args.returnReason,
      returnStatus: args.returnStatus ?? "processed",
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    });

    return { returnId, success: true };
  },
});

export const update = mutation({
  args: {
    token: v.string(),
    returnId: v.id("returns"),
    orderNumber: v.optional(v.string()),
    customerName: v.optional(v.string()),
    returnReason: v.optional(v.string()),
    notes: v.optional(v.string()),
    returnedItems: v.optional(v.array(v.any())),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new ConvexError("Sesiune expirată.");
    }

    const returnDoc = await ctx.db.get(args.returnId);
    if (!returnDoc || returnDoc.userId !== user._id) {
      throw new ConvexError("Returul nu a fost găsit.");
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.orderNumber !== undefined) updates.orderNumber = args.orderNumber;
    if (args.customerName !== undefined) updates.customerName = args.customerName;
    if (args.returnReason !== undefined) updates.returnReason = args.returnReason;
    if (args.notes !== undefined) updates.notes = args.notes;
    if (args.returnedItems !== undefined) updates.returnedItems = args.returnedItems;

    await ctx.db.patch(args.returnId, updates);
    return { success: true };
  },
});

export const linkToOrder = mutation({
  args: {
    token: v.string(),
    returnId: v.id("returns"),
    orderId: v.id("shopifyOrders"),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new ConvexError("Sesiune expirată.");
    }

    const returnDoc = await ctx.db.get(args.returnId);
    if (!returnDoc || returnDoc.userId !== user._id) {
      throw new ConvexError("Returul nu a fost găsit.");
    }

    const order = await ctx.db.get(args.orderId);
    if (!order || order.userId !== user._id) {
      throw new ConvexError("Comanda nu a fost găsită.");
    }

    await ctx.db.patch(args.returnId, {
      shopifyOrderId: order.shopifyOrderId,
      shopDomain: order.shopDomain,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      returnedItems: order.items,
      updatedAt: Date.now(),
    });

    await ctx.db.patch(args.orderId, {
      isReturned: true,
      returnedAt: new Date().toISOString(),
      returnId: args.returnId,
      updatedAt: Date.now(),
    });

    return {
      success: true,
      order: {
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        hasInvoice: !!order.invoiceNumber && order.invoiceStatus !== "storno",
        invoiceNumber: order.invoiceNumber,
        invoiceSeries: order.invoiceSeries,
        items: order.items,
      },
    };
  },
});

export const markAsProcessed = mutation({
  args: {
    token: v.string(),
    returnId: v.id("returns"),
    stockAdded: v.boolean(),
    invoiceStornoed: v.boolean(),
    invoiceSource: v.string(),
    processNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new ConvexError("Sesiune expirată.");
    const returnDoc = await ctx.db.get(args.returnId);
    if (!returnDoc || returnDoc.userId !== user._id) throw new ConvexError("Returul nu a fost găsit.");

    const existingNotes = returnDoc.notes || "";
    const processInfo = `\n[Procesat ${new Date().toLocaleString("ro-RO")}] Stock: ${
      args.stockAdded ? "Da" : "Nu"
    }, Invoice storno: ${args.invoiceStornoed ? "Da" : "Nu"} (${args.invoiceSource})`;
    const additionalNotes = args.processNotes ? `\n${args.processNotes}` : "";

    await ctx.db.patch(args.returnId, {
      returnStatus: "processed",
      notes: existingNotes + processInfo + additionalNotes,
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});

export const cancel = mutation({
  args: {
    token: v.string(),
    returnId: v.id("returns"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new ConvexError("Sesiune expirată.");
    const returnDoc = await ctx.db.get(args.returnId);
    if (!returnDoc || returnDoc.userId !== user._id) throw new ConvexError("Returul nu a fost găsit.");

    const existingNotes = returnDoc.notes || "";
    const cancelInfo = `\n[Anulat ${new Date().toLocaleString("ro-RO")}]${args.reason ? ` Motiv: ${args.reason}` : ""}`;
    await ctx.db.patch(args.returnId, {
      returnStatus: "cancelled",
      notes: existingNotes + cancelInfo,
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});

export const deleteReturn = mutation({
  args: {
    token: v.string(),
    returnId: v.id("returns"),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new ConvexError("Sesiune expirată.");
    const returnDoc = await ctx.db.get(args.returnId);
    if (!returnDoc || returnDoc.userId !== user._id) throw new ConvexError("Returul nu a fost găsit.");
    if (returnDoc.returnStatus === "processed") throw new ConvexError("Nu poți șterge un retur procesat.");
    await ctx.db.delete(args.returnId);
    return { success: true };
  },
});

export const markOrderAsReturned = mutation({
  args: {
    token: v.string(),
    orderId: v.id("shopifyOrders"),
    returnId: v.id("returns"),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new ConvexError("Sesiune expirată.");
    const order = await ctx.db.get(args.orderId);
    if (!order || order.userId !== user._id) throw new ConvexError("Comanda nu a fost găsită.");

    const activityHistory = (order.activityHistory as any[] | undefined) || [];
    activityHistory.push({
      timestamp: new Date().toISOString(),
      action: "order_marked_returned",
      description: "Comanda marcată ca returnată",
      details: { returnId: args.returnId },
      userId: user._id,
      userName: user.name || user.email,
    });

    await ctx.db.patch(args.orderId, {
      isReturned: true,
      returnedAt: new Date().toISOString(),
      returnId: args.returnId,
      activityHistory,
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});

export const unmarkOrderAsReturned = mutation({
  args: {
    token: v.string(),
    orderId: v.id("shopifyOrders"),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new ConvexError("Sesiune expirată.");
    const order = await ctx.db.get(args.orderId);
    if (!order || order.userId !== user._id) throw new ConvexError("Comanda nu a fost găsită.");

    const activityHistory = (order.activityHistory as any[] | undefined) || [];
    activityHistory.push({
      timestamp: new Date().toISOString(),
      action: "return_unmarked",
      description: "Retur anulat — comanda nu mai este marcată ca returnată",
      userId: user._id,
      userName: user.name || user.email,
    });

    await ctx.db.patch(args.orderId, {
      isReturned: false,
      returnedAt: undefined,
      returnId: undefined,
      activityHistory,
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});
