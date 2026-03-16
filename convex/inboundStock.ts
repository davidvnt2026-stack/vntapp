import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { Doc } from "./_generated/dataModel";

// ============================================
// QUERIES
// ============================================

// List all inbound stock records
export const list = query({
  args: {
    token: v.string(),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    
    if (!session || session.expiresAt < Date.now()) {
      throw new Error("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    let records;
    
    const statusFilter = args.status;
    if (statusFilter) {
      records = await ctx.db
        .query("inboundStock")
        .withIndex("by_userId_status", (q) => 
          q.eq("userId", (session.impersonatingUserId || session.userId)).eq("status", statusFilter)
        )
        .collect();
    } else {
      records = await ctx.db
        .query("inboundStock")
        .withIndex("by_userId", (q) => q.eq("userId", (session.impersonatingUserId || session.userId)))
        .collect();
    }

    // Sort by date descending
    return records.sort((a, b) => b.date.localeCompare(a.date));
  },
});

// Get records by date range
export const getByDateRange = query({
  args: {
    token: v.string(),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    
    if (!session || session.expiresAt < Date.now()) {
      throw new Error("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    const records = await ctx.db
      .query("inboundStock")
      .withIndex("by_userId", (q) => q.eq("userId", (session.impersonatingUserId || session.userId)))
      .collect();

    return records.filter(
      (r) => r.date >= args.startDate && r.date <= args.endDate
    );
  },
});

// Get records by SKU
export const getBySku = query({
  args: {
    token: v.string(),
    sku: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    
    if (!session || session.expiresAt < Date.now()) {
      throw new Error("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    return await ctx.db
      .query("inboundStock")
      .withIndex("by_userId_sku", (q) => 
        q.eq("userId", (session.impersonatingUserId || session.userId)).eq("sku", args.sku)
      )
      .collect();
  },
});

// Get pending inbound (not yet received)
export const getPending = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    
    if (!session || session.expiresAt < Date.now()) {
      throw new Error("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    return await ctx.db
      .query("inboundStock")
      .withIndex("by_userId_status", (q) => 
        q.eq("userId", (session.impersonatingUserId || session.userId)).eq("status", "pending")
      )
      .collect();
  },
});

// Get suppliers list
export const getSuppliers = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    
    if (!session || session.expiresAt < Date.now()) {
      throw new Error("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    const records = await ctx.db
      .query("inboundStock")
      .withIndex("by_userId", (q) => q.eq("userId", (session.impersonatingUserId || session.userId)))
      .collect();

    // Extract unique suppliers
    const suppliers = new Set<string>();
    records.forEach((r) => {
      if (r.supplier) suppliers.add(r.supplier);
    });

    return Array.from(suppliers).sort();
  },
});

// ============================================
// MUTATIONS
// ============================================

// Create inbound stock record
export const create = mutation({
  args: {
    token: v.string(),
    date: v.string(),
    sku: v.string(),
    quantity: v.number(),
    supplier: v.optional(v.string()),
    purchaseOrderNumber: v.optional(v.string()),
    unitCost: v.optional(v.float64()),
    notes: v.optional(v.string()),
    status: v.optional(v.string()), // "pending" | "received"
    autoUpdateStock: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    
    if (!session || session.expiresAt < Date.now()) {
      throw new Error("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    const now = Date.now();
    const status = args.status ?? "received";
    const totalCost = args.unitCost ? args.unitCost * args.quantity : undefined;

    // Create inbound record
    const inboundId = await ctx.db.insert("inboundStock", {
      userId: (session.impersonatingUserId || session.userId),
      date: args.date,
      sku: args.sku,
      quantity: args.quantity,
      supplier: args.supplier,
      purchaseOrderNumber: args.purchaseOrderNumber,
      unitCost: args.unitCost,
      totalCost,
      notes: args.notes,
      status,
      createdAt: now,
      updatedAt: now,
    });

    // Auto-update SKU stock if received and flag is set
    if (status === "received" && args.autoUpdateStock !== false) {
      const sku = await ctx.db
        .query("skus")
        .withIndex("by_userId_sku", (q) => 
          q.eq("userId", (session.impersonatingUserId || session.userId)).eq("sku", args.sku)
        )
        .first();

      if (sku) {
        await ctx.db.patch(sku._id, {
          currentStock: sku.currentStock + args.quantity,
          updatedAt: now,
        });
      }
    }

    return inboundId;
  },
});

// Update inbound record
export const update = mutation({
  args: {
    token: v.string(),
    inboundId: v.id("inboundStock"),
    date: v.optional(v.string()),
    quantity: v.optional(v.number()),
    supplier: v.optional(v.string()),
    purchaseOrderNumber: v.optional(v.string()),
    unitCost: v.optional(v.float64()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    
    if (!session || session.expiresAt < Date.now()) {
      throw new Error("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    const record = await ctx.db.get(args.inboundId);
    
    if (!record || record.userId !== (session.impersonatingUserId || session.userId)) {
      throw new Error("Înregistrarea nu a fost găsită.");
    }

    const updates: Partial<Doc<"inboundStock">> = {
      updatedAt: Date.now(),
    };

    if (args.date !== undefined) updates.date = args.date;
    if (args.quantity !== undefined) updates.quantity = args.quantity;
    if (args.supplier !== undefined) updates.supplier = args.supplier;
    if (args.purchaseOrderNumber !== undefined) updates.purchaseOrderNumber = args.purchaseOrderNumber;
    if (args.unitCost !== undefined) {
      updates.unitCost = args.unitCost;
      updates.totalCost = args.unitCost * (args.quantity ?? record.quantity);
    }
    if (args.notes !== undefined) updates.notes = args.notes;

    await ctx.db.patch(args.inboundId, updates);
    return args.inboundId;
  },
});

// Mark as received (and update stock)
export const markReceived = mutation({
  args: {
    token: v.string(),
    inboundId: v.id("inboundStock"),
    receivedBy: v.optional(v.string()),
    adjustQuantity: v.optional(v.number()), // If actual received differs
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    
    if (!session || session.expiresAt < Date.now()) {
      throw new Error("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    const record = await ctx.db.get(args.inboundId);
    
    if (!record || record.userId !== (session.impersonatingUserId || session.userId)) {
      throw new Error("Înregistrarea nu a fost găsită.");
    }

    if (record.status === "received") {
      throw new Error("Stocul a fost deja recepționat.");
    }

    const now = Date.now();
    const quantity = args.adjustQuantity ?? record.quantity;

    // Update inbound record
    await ctx.db.patch(args.inboundId, {
      status: "received",
      quantity,
      receivedBy: args.receivedBy,
      updatedAt: now,
    });

    // Update SKU stock
    const sku = await ctx.db
      .query("skus")
      .withIndex("by_userId_sku", (q) => 
        q.eq("userId", (session.impersonatingUserId || session.userId)).eq("sku", record.sku)
      )
      .first();

    if (sku) {
      await ctx.db.patch(sku._id, {
        currentStock: sku.currentStock + quantity,
        updatedAt: now,
      });
    }

    return { inboundId: args.inboundId, quantityReceived: quantity };
  },
});

// Cancel inbound (only if pending or in_transfer)
export const cancel = mutation({
  args: {
    token: v.string(),
    inboundId: v.id("inboundStock"),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    
    if (!session || session.expiresAt < Date.now()) {
      throw new Error("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    const record = await ctx.db.get(args.inboundId);
    
    if (!record || record.userId !== (session.impersonatingUserId || session.userId)) {
      throw new Error("Înregistrarea nu a fost găsită.");
    }

    if (record.status === "received" || record.status === "transferred") {
      throw new Error("Nu se poate anula stocul deja finalizat.");
    }

    const now = Date.now();
    await ctx.db.patch(args.inboundId, {
      status: "cancelled",
      updatedAt: now,
    });

    // In-transfer stock may have been deducted at creation; restore it on cancel.
    if (record.status === "in_transfer" && !!record.transferStockDeductedAt) {
      const ownerUserId = session.impersonatingUserId || session.userId;
      const sku = await ctx.db
        .query("skus")
        .withIndex("by_userId_sku", (q) => q.eq("userId", ownerUserId).eq("sku", record.sku))
        .first();
      if (sku) {
        await ctx.db.patch(sku._id, {
          currentStock: sku.currentStock + record.quantity,
          updatedAt: now,
        });
      }
    }

    return args.inboundId;
  },
});

// Create a transfer record (deduct stock immediately from source warehouse)
export const createTransfer = mutation({
  args: {
    token: v.string(),
    date: v.string(),
    sku: v.string(),
    quantity: v.number(),
    destination: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    
    if (!session || session.expiresAt < Date.now()) {
      throw new Error("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    const now = Date.now();
    const ownerUserId = session.impersonatingUserId || session.userId;

    const sku = await ctx.db
      .query("skus")
      .withIndex("by_userId_sku", (q) => q.eq("userId", ownerUserId).eq("sku", args.sku))
      .first();

    if (!sku) {
      throw new Error("SKU-ul selectat nu a fost găsit.");
    }
    if (args.quantity <= 0) {
      throw new Error("Cantitatea de transfer trebuie să fie mai mare decât 0.");
    }
    if (sku.currentStock < args.quantity) {
      throw new Error(`Stoc insuficient pentru transfer. Disponibil: ${sku.currentStock}, cerut: ${args.quantity}.`);
    }

    const inboundId = await ctx.db.insert("inboundStock", {
      userId: ownerUserId,
      date: args.date,
      sku: args.sku,
      quantity: args.quantity,
      notes: args.notes,
      status: "transferred",
      transferDestination: args.destination,
      transferStartedAt: now,
      transferReceivedAt: now,
      transferStockDeductedAt: now,
      transferType: "inbound_transfer",
      createdAt: now,
      updatedAt: now,
    });

    // Transfer means stock leaves current warehouse right now.
    await ctx.db.patch(sku._id, {
      currentStock: sku.currentStock - args.quantity,
      updatedAt: now,
    });

    return inboundId;
  },
});

// Mark transfer as received (stock was already deducted at transfer start)
export const markTransferReceived = mutation({
  args: {
    token: v.string(),
    inboundId: v.id("inboundStock"),
    receivedBy: v.optional(v.string()),
    adjustQuantity: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    
    if (!session || session.expiresAt < Date.now()) {
      throw new Error("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    const record = await ctx.db.get(args.inboundId);
    
    if (!record || record.userId !== (session.impersonatingUserId || session.userId)) {
      throw new Error("Înregistrarea nu a fost găsită.");
    }

    if (record.status !== "in_transfer") {
      throw new Error("Doar transferurile în tranzit pot fi marcate ca recepționate.");
    }

    const now = Date.now();
    const quantity = args.adjustQuantity ?? record.quantity;
    if (quantity <= 0) {
      throw new Error("Cantitatea recepționată trebuie să fie mai mare decât 0.");
    }

    // Reconcile stock depending on whether this transfer already deducted stock at creation.
    const ownerUserId = session.impersonatingUserId || session.userId;
    const wasAlreadyDeducted = !!record.transferStockDeductedAt;
    const originalQuantity = record.quantity;
    const neededDeduction = wasAlreadyDeducted ? quantity - originalQuantity : quantity;
    if (neededDeduction !== 0) {
      const sku = await ctx.db
        .query("skus")
        .withIndex("by_userId_sku", (q) => q.eq("userId", ownerUserId).eq("sku", record.sku))
        .first();
      if (sku) {
        if (neededDeduction > 0 && sku.currentStock < neededDeduction) {
          throw new Error(
            `Stoc insuficient pentru ajustare transfer. Disponibil: ${sku.currentStock}, necesar: ${neededDeduction}.`
          );
        }
        await ctx.db.patch(sku._id, {
          currentStock: sku.currentStock - neededDeduction,
          updatedAt: now,
        });
      }
    }

    // Update transfer record state only; quantity impact already accounted for.
    await ctx.db.patch(args.inboundId, {
      status: "transferred",
      quantity,
      receivedBy: args.receivedBy,
      transferReceivedAt: now,
      transferStockDeductedAt: record.transferStockDeductedAt || now,
      updatedAt: now,
    });

    return { inboundId: args.inboundId, quantityReceived: quantity };
  },
});

// Get transfers in transit
export const getInTransfer = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    
    if (!session || session.expiresAt < Date.now()) {
      throw new Error("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    return await ctx.db
      .query("inboundStock")
      .withIndex("by_userId_status", (q) => 
        q.eq("userId", (session.impersonatingUserId || session.userId)).eq("status", "in_transfer")
      )
      .collect();
  },
});

// Delete inbound record (with stock adjustment if received - defaults to true for undo)
export const remove = mutation({
  args: {
    token: v.string(),
    inboundId: v.id("inboundStock"),
    adjustStock: v.optional(v.boolean()), // Whether to reduce stock (defaults to true)
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    
    if (!session || session.expiresAt < Date.now()) {
      throw new Error("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    const record = await ctx.db.get(args.inboundId);
    
    if (!record || record.userId !== (session.impersonatingUserId || session.userId)) {
      throw new Error("Înregistrarea nu a fost găsită.");
    }

    const shouldAdjustStock = args.adjustStock !== false; // Default to true
    let stockAdjusted = false;
    let adjustedQuantity = 0;

    // If received and adjustStock, undo based on record type:
    // - standard inbound received => subtract stock
    // - transfer received:
    //   - if stock had been deducted for transfer => add back
    //   - otherwise (legacy record) => no stock undo needed
    if (record.status === "received" && shouldAdjustStock) {
      const sku = await ctx.db
        .query("skus")
        .withIndex("by_userId_sku", (q) => 
          q.eq("userId", (session.impersonatingUserId || session.userId)).eq("sku", record.sku)
        )
        .first();

      if (sku) {
        const isTransferRecord = record.transferType === "inbound_transfer";
        const transferWasDeducted = !!record.transferStockDeductedAt;
        const newStock = isTransferRecord
          ? transferWasDeducted
            ? sku.currentStock + record.quantity
            : sku.currentStock
          : Math.max(0, sku.currentStock - record.quantity);
        await ctx.db.patch(sku._id, {
          currentStock: newStock,
          updatedAt: Date.now(),
        });
        stockAdjusted = true;
        adjustedQuantity = record.quantity;
      }
    }

    // If transfer is still in transit and adjustStock, restore previously deducted stock.
    if (record.status === "in_transfer" && shouldAdjustStock && !!record.transferStockDeductedAt) {
      const sku = await ctx.db
        .query("skus")
        .withIndex("by_userId_sku", (q) =>
          q.eq("userId", (session.impersonatingUserId || session.userId)).eq("sku", record.sku)
        )
        .first();
      if (sku) {
        await ctx.db.patch(sku._id, {
          currentStock: sku.currentStock + record.quantity,
          updatedAt: Date.now(),
        });
        stockAdjusted = true;
        adjustedQuantity = record.quantity;
      }
    }

    // If transfer is already finalized and adjustStock, restore deducted stock on delete.
    if (record.status === "transferred" && shouldAdjustStock && !!record.transferStockDeductedAt) {
      const sku = await ctx.db
        .query("skus")
        .withIndex("by_userId_sku", (q) =>
          q.eq("userId", (session.impersonatingUserId || session.userId)).eq("sku", record.sku)
        )
        .first();
      if (sku) {
        await ctx.db.patch(sku._id, {
          currentStock: sku.currentStock + record.quantity,
          updatedAt: Date.now(),
        });
        stockAdjusted = true;
        adjustedQuantity = record.quantity;
      }
    }

    await ctx.db.delete(args.inboundId);
    return { 
      deleted: true, 
      stockAdjusted, 
      adjustedQuantity,
      sku: record.sku,
    };
  },
});

// Bulk create inbound records
export const bulkCreate = mutation({
  args: {
    token: v.string(),
    records: v.array(v.object({
      date: v.string(),
      sku: v.string(),
      quantity: v.number(),
      supplier: v.optional(v.string()),
      purchaseOrderNumber: v.optional(v.string()),
      unitCost: v.optional(v.float64()),
      notes: v.optional(v.string()),
    })),
    status: v.optional(v.string()),
    autoUpdateStock: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    
    if (!session || session.expiresAt < Date.now()) {
      throw new Error("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    const now = Date.now();
    const status = args.status ?? "received";
    const created = [];

    // Track stock updates by SKU
    const stockUpdates: Record<string, number> = {};

    for (const recordData of args.records) {
      const totalCost = recordData.unitCost 
        ? recordData.unitCost * recordData.quantity 
        : undefined;

      const id = await ctx.db.insert("inboundStock", {
        userId: (session.impersonatingUserId || session.userId),
        date: recordData.date,
        sku: recordData.sku,
        quantity: recordData.quantity,
        supplier: recordData.supplier,
        purchaseOrderNumber: recordData.purchaseOrderNumber,
        unitCost: recordData.unitCost,
        totalCost,
        notes: recordData.notes,
        status,
        createdAt: now,
        updatedAt: now,
      });

      created.push(id);

      // Track stock updates
      if (status === "received" && args.autoUpdateStock !== false) {
        stockUpdates[recordData.sku] = (stockUpdates[recordData.sku] || 0) + recordData.quantity;
      }
    }

    // Apply stock updates
    for (const [sku, quantity] of Object.entries(stockUpdates)) {
      const skuRecord = await ctx.db
        .query("skus")
        .withIndex("by_userId_sku", (q) => 
          q.eq("userId", (session.impersonatingUserId || session.userId)).eq("sku", sku)
        )
        .first();

      if (skuRecord) {
        await ctx.db.patch(skuRecord._id, {
          currentStock: skuRecord.currentStock + quantity,
          updatedAt: now,
        });
      }
    }

    return { created: created.length, stockUpdates };
  },
});
