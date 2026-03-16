import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { Doc } from "./_generated/dataModel";

function normalizeSku(value?: string): string {
  return (value || "").trim().toUpperCase();
}

// ============================================
// QUERIES
// ============================================

// Get all records for a month and SKU
export const getByMonthAndSku = query({
  args: {
    token: v.string(),
    month: v.string(), // "YYYY-MM"
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

    const records = await ctx.db
      .query("dailyStockRecords")
      .withIndex("by_userId_month_sku", (q) => 
        q.eq("userId", (session.impersonatingUserId || session.userId)).eq("month", args.month).eq("sku", args.sku)
      )
      .collect();

    // Sort by day of month
    return records.sort((a, b) => a.dayOfMonth - b.dayOfMonth);
  },
});

// Get all daily stock records for a month (all SKUs)
export const getByMonthAll = query({
  args: {
    token: v.string(),
    month: v.string(), // "YYYY-MM"
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!session || session.expiresAt < Date.now()) {
      throw new Error("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    const userId = session.impersonatingUserId || session.userId;
    const records = await ctx.db
      .query("dailyStockRecords")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("month"), args.month))
      .collect();

    // Stable order for CSV export
    return records.sort((a, b) => {
      if (a.sku !== b.sku) return a.sku.localeCompare(b.sku);
      return a.dayOfMonth - b.dayOfMonth;
    });
  },
});

// Get aggregated summary for a month
export const getMonthSummary = query({
  args: {
    token: v.string(),
    month: v.string(), // "YYYY-MM"
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

    const userId = session.impersonatingUserId || session.userId;

    const records = await ctx.db
      .query("dailyStockRecords")
      .withIndex("by_userId_month_sku", (q) => 
        q.eq("userId", userId).eq("month", args.month).eq("sku", args.sku)
      )
      .collect();

    // Get current stock from SKU table
    const skuRecord = await ctx.db
      .query("skus")
      .withIndex("by_userId_sku", (q) => 
        q.eq("userId", userId).eq("sku", args.sku)
      )
      .first();

    // Get return data from the returns table (source of truth)
    const allReturns = await ctx.db
      .query("returns")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    // Filter returns to the selected month
    const monthStart = `${args.month}-01`;
    const [yearStr, monthStr] = args.month.split("-");
    const yr = parseInt(yearStr);
    const mo = parseInt(monthStr);
    const lastDay = new Date(yr, mo, 0).getDate();
    const monthEnd = `${args.month}-${String(lastDay).padStart(2, "0")}`;

    const monthReturns = allReturns.filter(
      (r) => r.returnDate >= monthStart && r.returnDate <= monthEnd
    );

    // Count return units and return orders only for the selected SKU.
    let returnUnits = 0;
    let orderReturns = 0;
    const selectedSkuNormalized = normalizeSku(args.sku);

    for (const ret of monthReturns) {
      const items = (ret.returnedItems as Array<{ sku?: string; quantity?: number }>) || [];
      let hasSelectedSkuInReturn = false;

      for (const item of items) {
        if (normalizeSku(item.sku) === selectedSkuNormalized) {
          returnUnits += item.quantity || 1;
          hasSelectedSkuInReturn = true;
        }
      }

      if (hasSelectedSkuInReturn) {
        orderReturns += 1;
      }
    }

    // Aggregate from dailyStockRecords (orders, revenue, outbound)
    const summary = {
      currentStock: skuRecord?.currentStock ?? 0,
      totalRevenue: 0,
      totalOrders: 0,
      totalOutbound: 0,
      returnUnits,
      orderReturns,
      monthlyReturnRateUnits: 0,
      monthlyReturnRateOrders: 0,
    };

    for (const record of records) {
      summary.totalRevenue += record.revenue;
      summary.totalOrders += record.orders;
      summary.totalOutbound += record.outboundUnits;
    }

    // Calculate return rates
    if (summary.totalOutbound > 0) {
      summary.monthlyReturnRateUnits = (summary.returnUnits / summary.totalOutbound) * 100;
    }
    if (summary.totalOrders > 0) {
      summary.monthlyReturnRateOrders = (summary.orderReturns / summary.totalOrders) * 100;
    }

    return summary;
  },
});

// Get single day record
export const getDailyRecord = query({
  args: {
    token: v.string(),
    date: v.string(), // "YYYY-MM-DD"
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
      .query("dailyStockRecords")
      .withIndex("by_userId_date_sku", (q) => 
        q.eq("userId", (session.impersonatingUserId || session.userId)).eq("date", args.date).eq("sku", args.sku)
      )
      .first();
  },
});

// Get all SKU records for a date range (for reports)
export const getByDateRange = query({
  args: {
    token: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    sku: v.optional(v.string()),
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
    
    const skuFilter = args.sku;
    if (skuFilter) {
      records = await ctx.db
        .query("dailyStockRecords")
        .withIndex("by_userId_sku", (q) => 
          q.eq("userId", (session.impersonatingUserId || session.userId)).eq("sku", skuFilter)
        )
        .collect();
    } else {
      records = await ctx.db
        .query("dailyStockRecords")
        .withIndex("by_userId", (q) => q.eq("userId", (session.impersonatingUserId || session.userId)))
        .collect();
    }

    // Filter by date range
    return records.filter(r => r.date >= args.startDate && r.date <= args.endDate);
  },
});

// ============================================
// MUTATIONS
// ============================================

// Create or update daily record
export const upsertRecord = mutation({
  args: {
    token: v.string(),
    date: v.string(), // "YYYY-MM-DD"
    sku: v.string(),
    outboundUnits: v.optional(v.number()),
    returnUnits: v.optional(v.number()),
    orders: v.optional(v.number()),
    orderReturns: v.optional(v.number()),
    revenue: v.optional(v.float64()),
    notes: v.optional(v.string()),
    stockBalance: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    
    if (!session || session.expiresAt < Date.now()) {
      throw new Error("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    // Parse date
    const dateParts = args.date.split("-");
    const year = parseInt(dateParts[0]);
    const monthNum = parseInt(dateParts[1]);
    const day = parseInt(dateParts[2]);
    const month = `${year}-${String(monthNum).padStart(2, "0")}`;

    // Check if record exists
    const existing = await ctx.db
      .query("dailyStockRecords")
      .withIndex("by_userId_date_sku", (q) => 
        q.eq("userId", (session.impersonatingUserId || session.userId)).eq("date", args.date).eq("sku", args.sku)
      )
      .first();

    const now = Date.now();

    if (existing) {
      // Update existing record
      const updates: Partial<Doc<"dailyStockRecords">> = {
        updatedAt: now,
      };

      if (args.outboundUnits !== undefined) updates.outboundUnits = args.outboundUnits;
      if (args.returnUnits !== undefined) updates.returnUnits = args.returnUnits;
      if (args.orders !== undefined) updates.orders = args.orders;
      if (args.orderReturns !== undefined) updates.orderReturns = args.orderReturns;
      if (args.revenue !== undefined) updates.revenue = args.revenue;
      if (args.notes !== undefined) updates.notes = args.notes;
      if (args.stockBalance !== undefined) updates.stockBalance = args.stockBalance;

      await ctx.db.patch(existing._id, updates);
      return existing._id;
    } else {
      // Create new record
      return await ctx.db.insert("dailyStockRecords", {
        userId: (session.impersonatingUserId || session.userId),
        date: args.date,
        dayOfMonth: day,
        month,
        sku: args.sku,
        outboundUnits: args.outboundUnits ?? 0,
        returnUnits: args.returnUnits ?? 0,
        orders: args.orders ?? 0,
        orderReturns: args.orderReturns ?? 0,
        revenue: args.revenue ?? 0,
        notes: args.notes,
        stockBalance: args.stockBalance ?? 0,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

// Update single field (for inline editing)
export const updateField = mutation({
  args: {
    token: v.string(),
    recordId: v.id("dailyStockRecords"),
    field: v.string(),
    value: v.union(v.number(), v.float64(), v.string()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    
    if (!session || session.expiresAt < Date.now()) {
      throw new Error("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    const record = await ctx.db.get(args.recordId);
    
    if (!record || record.userId !== (session.impersonatingUserId || session.userId)) {
      throw new Error("Înregistrarea nu a fost găsită.");
    }

    const validFields = ["outboundUnits", "returnUnits", "orders", "orderReturns", "revenue", "notes", "stockBalance"];
    
    if (!validFields.includes(args.field)) {
      throw new Error("Câmp invalid.");
    }

    const updates: Record<string, number | string> = {
      [args.field]: args.value,
      updatedAt: Date.now(),
    };

    await ctx.db.patch(args.recordId, updates);
    return args.recordId;
  },
});

// Initialize month records (create empty records for all days)
export const initializeMonth = mutation({
  args: {
    token: v.string(),
    month: v.string(), // "YYYY-MM"
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

    // Parse month
    const [yearStr, monthStr] = args.month.split("-");
    const year = parseInt(yearStr);
    const monthNum = parseInt(monthStr);

    // Get days in month
    const daysInMonth = new Date(year, monthNum, 0).getDate();

    const now = Date.now();
    const created = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${year}-${String(monthNum).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

      // Check if record already exists
      const existing = await ctx.db
        .query("dailyStockRecords")
        .withIndex("by_userId_date_sku", (q) => 
          q.eq("userId", (session.impersonatingUserId || session.userId)).eq("date", date).eq("sku", args.sku)
        )
        .first();

      if (!existing) {
        const id = await ctx.db.insert("dailyStockRecords", {
          userId: (session.impersonatingUserId || session.userId),
          date,
          dayOfMonth: day,
          month: args.month,
          sku: args.sku,
          outboundUnits: 0,
          returnUnits: 0,
          orders: 0,
          orderReturns: 0,
          revenue: 0,
          stockBalance: 0,
          createdAt: now,
          updatedAt: now,
        });
        created.push(id);
      }
    }

    return { created: created.length };
  },
});

// Bulk update records (for batch saves)
export const bulkUpdate = mutation({
  args: {
    token: v.string(),
    records: v.array(v.object({
      recordId: v.id("dailyStockRecords"),
      outboundUnits: v.optional(v.number()),
      returnUnits: v.optional(v.number()),
      orders: v.optional(v.number()),
      orderReturns: v.optional(v.number()),
      revenue: v.optional(v.float64()),
      notes: v.optional(v.string()),
      stockBalance: v.optional(v.number()),
    })),
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
    let updated = 0;

    for (const recordData of args.records) {
      const record = await ctx.db.get(recordData.recordId);
      
      if (!record || record.userId !== (session.impersonatingUserId || session.userId)) {
        continue;
      }

      const updates: Partial<Doc<"dailyStockRecords">> = {
        updatedAt: now,
      };

      if (recordData.outboundUnits !== undefined) updates.outboundUnits = recordData.outboundUnits;
      if (recordData.returnUnits !== undefined) updates.returnUnits = recordData.returnUnits;
      if (recordData.orders !== undefined) updates.orders = recordData.orders;
      if (recordData.orderReturns !== undefined) updates.orderReturns = recordData.orderReturns;
      if (recordData.revenue !== undefined) updates.revenue = recordData.revenue;
      if (recordData.notes !== undefined) updates.notes = recordData.notes;
      if (recordData.stockBalance !== undefined) updates.stockBalance = recordData.stockBalance;

      await ctx.db.patch(recordData.recordId, updates);
      updated++;
    }

    return { updated };
  },
});

// Recalculate running stock balances
export const recalculateBalances = mutation({
  args: {
    token: v.string(),
    month: v.string(),
    sku: v.string(),
    openingStock: v.number(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    
    if (!session || session.expiresAt < Date.now()) {
      throw new Error("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    // Get all records for the month, sorted by day
    const records = await ctx.db
      .query("dailyStockRecords")
      .withIndex("by_userId_month_sku", (q) => 
        q.eq("userId", (session.impersonatingUserId || session.userId)).eq("month", args.month).eq("sku", args.sku)
      )
      .collect();

    const sortedRecords = records.sort((a, b) => a.dayOfMonth - b.dayOfMonth);

    let runningBalance = args.openingStock;
    const now = Date.now();

    for (const record of sortedRecords) {
      // Calculate: balance = previous + inbound - outbound + returns
      // For simplicity: balance = previous - outbound + returns
      runningBalance = runningBalance - record.outboundUnits + record.returnUnits;

      await ctx.db.patch(record._id, {
        stockBalance: runningBalance,
        updatedAt: now,
      });
    }

    // Also update the SKU's current stock
    const skuRecord = await ctx.db
      .query("skus")
      .withIndex("by_userId_sku", (q) => 
        q.eq("userId", (session.impersonatingUserId || session.userId)).eq("sku", args.sku)
      )
      .first();

    if (skuRecord) {
      await ctx.db.patch(skuRecord._id, {
        currentStock: runningBalance,
        updatedAt: now,
      });
    }

    return { finalBalance: runningBalance };
  },
});
