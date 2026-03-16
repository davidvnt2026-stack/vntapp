import { v, ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getUserFromToken } from "./auth";

function normalizeAddressForMatch(value?: string): string {
  return (value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeCurrency(value?: string): string {
  const c = (value || "RON").trim().toUpperCase();
  return c || "RON";
}

async function getUserPreferredCurrency(ctx: any, userId: string): Promise<string> {
  const stores = await ctx.db
    .query("shopifyStoreConnections")
    .withIndex("by_userId", (q: any) => q.eq("userId", userId))
    .collect();
  const firstWithCurrency = stores.find((s: any) => !!s.currency);
  return normalizeCurrency(firstWithCurrency?.currency);
}

// ============================================
// QUERIES
// ============================================

// Get revenue data for a specific date
export const getByDate = query({
  args: {
    token: v.string(),
    date: v.string(), // "YYYY-MM-DD"
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");

    const records = await ctx.db
      .query("courierRevenue")
      .withIndex("by_userId_recordDate", (q) => q.eq("userId", user._id).eq("recordDate", args.date))
      .collect();

    const totalsByCurrency: Record<string, number> = {};
    for (const r of records) {
      const currency = normalizeCurrency((r as any).currency);
      totalsByCurrency[currency] = (totalsByCurrency[currency] || 0) + r.totalCodAmount;
    }
    const grandTotal = totalsByCurrency.RON ?? 0;

    return {
      records: records.map((r) => ({
        _id: r._id,
        address: r.address,
        totalCodAmount: r.totalCodAmount,
        currency: normalizeCurrency((r as any).currency),
        notes: r.notes,
      })),
      grandTotal,
      totalsByCurrency,
      date: args.date,
    };
  },
});

// Get revenue data for today
export const getToday = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");

    const today = new Date().toISOString().split("T")[0];

    const records = await ctx.db
      .query("courierRevenue")
      .withIndex("by_userId_recordDate", (q) => q.eq("userId", user._id).eq("recordDate", today))
      .collect();

    const totalsByCurrency: Record<string, number> = {};
    for (const r of records) {
      const currency = normalizeCurrency((r as any).currency);
      totalsByCurrency[currency] = (totalsByCurrency[currency] || 0) + r.totalCodAmount;
    }
    const grandTotal = totalsByCurrency.RON ?? 0;

    return {
      records: records.map((r) => ({
        _id: r._id,
        address: r.address,
        totalCodAmount: r.totalCodAmount,
        currency: normalizeCurrency((r as any).currency),
        notes: r.notes,
      })),
      grandTotal,
      totalsByCurrency,
      date: today,
    };
  },
});

// Get historical revenue (last N days) - impersonation handled at session level
export const getHistory = query({
  args: {
    token: v.string(),
    days: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");

    const daysBack = args.days || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    const startDateStr = startDate.toISOString().split("T")[0];

    const records = await ctx.db
      .query("courierRevenue")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .filter((q) => q.gte(q.field("recordDate"), startDateStr))
      .collect();

    // Group by date
    const byDate = new Map<string, { total: number; addresses: number; totalsByCurrency: Record<string, number> }>();
    for (const r of records) {
      const existing = byDate.get(r.recordDate) || { total: 0, addresses: 0, totalsByCurrency: {} as Record<string, number> };
      existing.total += r.totalCodAmount;
      existing.addresses += 1;
      const currency = normalizeCurrency((r as any).currency);
      existing.totalsByCurrency[currency] = (existing.totalsByCurrency[currency] || 0) + r.totalCodAmount;
      byDate.set(r.recordDate, existing);
    }

    // Sort by date descending
    const history = Array.from(byDate.entries())
      .map(([date, data]) => ({
        date,
        totalCod: data.totalsByCurrency.RON ?? 0,
        totalsByCurrency: data.totalsByCurrency,
        addressCount: data.addresses,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    return history;
  },
});

// Get recent revenue for dashboard (with address details)
export const getRecentForDashboard = query({
  args: {
    token: v.string(),
    days: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");

    const daysBack = args.days || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    const startDateStr = startDate.toISOString().split("T")[0];

    const records = await ctx.db
      .query("courierRevenue")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .filter((q) => q.gte(q.field("recordDate"), startDateStr))
      .collect();

    // Calculate total
    const grandTotalsByCurrency: Record<string, number> = {};
    for (const r of records) {
      const currency = normalizeCurrency((r as any).currency);
      grandTotalsByCurrency[currency] = (grandTotalsByCurrency[currency] || 0) + r.totalCodAmount;
    }
    const grandTotal = grandTotalsByCurrency.RON ?? 0;

    // Group by date with details
    const byDate = new Map<string, Array<{
      address: string;
      totalCodAmount: number;
      currency: string;
      notes: string | undefined;
      createdAt: number;
    }>>();
    
    for (const r of records) {
      if (!byDate.has(r.recordDate)) {
        byDate.set(r.recordDate, []);
      }
      byDate.get(r.recordDate)!.push({
        address: r.address,
        totalCodAmount: r.totalCodAmount,
        currency: normalizeCurrency((r as any).currency),
        notes: r.notes,
        createdAt: r.createdAt,
      });
    }

    // Sort by date descending and format
    const history = Array.from(byDate.entries())
      .map(([date, items]) => ({
        date,
        totalCod: items.filter((i) => i.currency === "RON").reduce((sum, i) => sum + i.totalCodAmount, 0),
        totalsByCurrency: items.reduce((acc, i) => {
          acc[i.currency] = (acc[i.currency] || 0) + i.totalCodAmount;
          return acc;
        }, {} as Record<string, number>),
        items,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    return {
      grandTotal,
      grandTotalsByCurrency,
      history,
    };
  },
});

// Admin: Get all users with their pickup addresses
export const getAllUsersWithPickupAddress = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    if (!user.isAdmin) throw new ConvexError("Access denied");

    // Get all user settings with pickup addresses
    const allSettings = await ctx.db
      .query("userSettings")
      .collect();

    const usersWithAddresses: Array<{
      userId: string;
      email: string;
      name?: string;
      pickupAddress: string;
    }> = [];
    
    for (const settings of allSettings) {
      if (settings.courierPickupAddress) {
        const profile = await ctx.db
          .query("profiles")
          .filter((q) => q.eq(q.field("_id"), settings.userId))
          .first();
        if (profile) {
          usersWithAddresses.push({
            userId: settings.userId,
            email: profile.email,
            name: profile.name,
            pickupAddress: settings.courierPickupAddress,
          });
        }
      }
    }

    return usersWithAddresses;
  },
});

// ============================================
// MUTATIONS
// ============================================

// Save daily revenue data (replaces existing data for the date)
export const saveDailyRevenue = mutation({
  args: {
    token: v.string(),
    date: v.string(), // "YYYY-MM-DD"
    groups: v.array(
      v.object({
        address: v.string(),
        total: v.number(),
        orderCount: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");

    // Delete existing records for this date
    const existingRecords = await ctx.db
      .query("courierRevenue")
      .withIndex("by_userId_recordDate", (q) => q.eq("userId", user._id).eq("recordDate", args.date))
      .collect();

    for (const record of existingRecords) {
      await ctx.db.delete(record._id);
    }

    // Insert new records
    const now = Date.now();
    const userCurrency = await getUserPreferredCurrency(ctx, user._id as any);
    const insertedIds: string[] = [];

    for (const group of args.groups) {
      const id = await ctx.db.insert("courierRevenue", {
        userId: user._id,
        recordDate: args.date,
        address: group.address,
        totalCodAmount: group.total,
        currency: userCurrency,
        notes: `${group.orderCount} orders processed`,
        createdAt: now,
        updatedAt: now,
      });
      insertedIds.push(id);
    }

    const grandTotal = args.groups.reduce((sum, g) => sum + g.total, 0);

    return {
      success: true,
      recordsInserted: insertedIds.length,
      grandTotal,
    };
  },
});

// Delete revenue data for a specific date
export const deleteByDate = mutation({
  args: {
    token: v.string(),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");

    const records = await ctx.db
      .query("courierRevenue")
      .withIndex("by_userId_recordDate", (q) => q.eq("userId", user._id).eq("recordDate", args.date))
      .collect();

    for (const record of records) {
      await ctx.db.delete(record._id);
    }

    return { success: true, recordsDeleted: records.length };
  },
});

// Admin: Save revenue data matched to users by pickup address
export const adminSaveRevenueForUsers = mutation({
  args: {
    token: v.string(),
    date: v.string(), // "YYYY-MM-DD"
    groups: v.array(
      v.object({
        address: v.string(),
        total: v.number(),
        orderCount: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    if (!user.isAdmin) throw new ConvexError("Access denied");

    const now = Date.now();
    const results: Array<{
      address: string;
      matchedUser: string | null;
      total: number;
      orderCount: number;
      updated: boolean;
    }> = [];

    // Get all user settings to build address -> userId map
    const allSettings = await ctx.db.query("userSettings").collect();
    const addressToUserIds = new Map<string, string[]>();
    
    for (const settings of allSettings) {
      if (settings.courierPickupAddress) {
        const key = normalizeAddressForMatch(settings.courierPickupAddress);
        const existing = addressToUserIds.get(key) || [];
        existing.push(settings.userId as any);
        addressToUserIds.set(key, existing);
      }
    }

    const currencyCache = new Map<string, string>();
    const getCachedUserCurrency = async (uid: string) => {
      const cached = currencyCache.get(uid);
      if (cached) return cached;
      const currency = await getUserPreferredCurrency(ctx, uid);
      currencyCache.set(uid, currency);
      return currency;
    };

    for (const group of args.groups) {
      const matchedUserIds = addressToUserIds.get(normalizeAddressForMatch(group.address)) || [];
      
      if (matchedUserIds.length > 0) {
        for (const matchedUserId of matchedUserIds) {
        // Check if record already exists for this user+date+address
        const existingRecord = await ctx.db
          .query("courierRevenue")
          .withIndex("by_userId", (q) => q.eq("userId", matchedUserId as any))
          .filter((q) => 
            q.and(
              q.eq(q.field("recordDate"), args.date),
              q.eq(q.field("address"), group.address)
            )
          )
          .first();

        // Get user email for result
        const profile = await ctx.db
          .query("profiles")
          .filter((q) => q.eq(q.field("_id"), matchedUserId as any))
          .first();

        if (existingRecord) {
          // Record exists - UPDATE with new total (latest upload wins)
          const currency = await getCachedUserCurrency(matchedUserId);
          await ctx.db.patch(existingRecord._id, {
            totalCodAmount: group.total,
            currency,
            notes: `${group.orderCount} orders processed`,
            updatedAt: now,
          });

          results.push({
            address: group.address,
            matchedUser: profile?.email || matchedUserId,
            total: group.total,
            orderCount: group.orderCount,
            updated: true,
          });
        } else {
          // Insert new record
          const currency = await getCachedUserCurrency(matchedUserId);
          await ctx.db.insert("courierRevenue", {
            userId: matchedUserId as any,
            recordDate: args.date,
            address: group.address,
            totalCodAmount: group.total,
            currency,
            notes: `${group.orderCount} orders processed`,
            createdAt: now,
            updatedAt: now,
          });

          results.push({
            address: group.address,
            matchedUser: profile?.email || matchedUserId,
            total: group.total,
            orderCount: group.orderCount,
            updated: false,
          });
        }
        }
      } else {
        results.push({
          address: group.address,
          matchedUser: null,
          total: group.total,
          orderCount: group.orderCount,
          updated: false,
        });
      }
    }

    const newCount = results.filter(r => r.matchedUser && !r.updated).length;
    const updatedCount = results.filter(r => r.matchedUser && r.updated).length;
    const unmatchedCount = results.filter(r => !r.matchedUser).length;

    return {
      success: true,
      newCount,
      updatedCount,
      unmatchedCount,
      results,
    };
  },
});

// ============================================
// WEBHOOK MUTATION (no auth required - called from internal action)
// ============================================

// Save revenue data from webhook (Make automation) - matches addresses to users
// Same logic as adminSaveRevenueForUsers but without token auth
export const adminSaveRevenueFromWebhook = mutation({
  args: {
    date: v.string(), // "YYYY-MM-DD"
    groups: v.array(
      v.object({
        address: v.string(),
        total: v.number(),
        orderCount: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const results: Array<{
      address: string;
      matchedUser: string | null;
      total: number;
      orderCount: number;
      updated: boolean;
    }> = [];

    // Get all user settings to build address -> userId map
    const allSettings = await ctx.db.query("userSettings").collect();
    const addressToUserIds = new Map<string, string[]>();
    
    for (const settings of allSettings) {
      if (settings.courierPickupAddress) {
        const key = normalizeAddressForMatch(settings.courierPickupAddress);
        const existing = addressToUserIds.get(key) || [];
        existing.push(settings.userId as any);
        addressToUserIds.set(key, existing);
      }
    }

    const currencyCache = new Map<string, string>();
    const getCachedUserCurrency = async (uid: string) => {
      const cached = currencyCache.get(uid);
      if (cached) return cached;
      const currency = await getUserPreferredCurrency(ctx, uid);
      currencyCache.set(uid, currency);
      return currency;
    };

    for (const group of args.groups) {
      const matchedUserIds = addressToUserIds.get(normalizeAddressForMatch(group.address)) || [];
      
      if (matchedUserIds.length > 0) {
        for (const matchedUserId of matchedUserIds) {
        // Check if record already exists for this user+date+address
        const existingRecord = await ctx.db
          .query("courierRevenue")
          .withIndex("by_userId", (q) => q.eq("userId", matchedUserId as any))
          .filter((q) => 
            q.and(
              q.eq(q.field("recordDate"), args.date),
              q.eq(q.field("address"), group.address)
            )
          )
          .first();

        // Get user email for result
        const profile = await ctx.db
          .query("profiles")
          .filter((q) => q.eq(q.field("_id"), matchedUserId as any))
          .first();

        if (existingRecord) {
          const currency = await getCachedUserCurrency(matchedUserId);
          await ctx.db.patch(existingRecord._id, {
            totalCodAmount: group.total,
            currency,
            notes: `${group.orderCount} orders processed (via Make webhook)`,
            updatedAt: now,
          });

          results.push({
            address: group.address,
            matchedUser: profile?.email || matchedUserId,
            total: group.total,
            orderCount: group.orderCount,
            updated: true,
          });
        } else {
          const currency = await getCachedUserCurrency(matchedUserId);
          await ctx.db.insert("courierRevenue", {
            userId: matchedUserId as any,
            recordDate: args.date,
            address: group.address,
            totalCodAmount: group.total,
            currency,
            notes: `${group.orderCount} orders processed (via Make webhook)`,
            createdAt: now,
            updatedAt: now,
          });

          results.push({
            address: group.address,
            matchedUser: profile?.email || matchedUserId,
            total: group.total,
            orderCount: group.orderCount,
            updated: false,
          });
        }
        }
      } else {
        results.push({
          address: group.address,
          matchedUser: null,
          total: group.total,
          orderCount: group.orderCount,
          updated: false,
        });
      }
    }

    const newCount = results.filter(r => r.matchedUser && !r.updated).length;
    const updatedCount = results.filter(r => r.matchedUser && r.updated).length;
    const unmatchedCount = results.filter(r => !r.matchedUser).length;

    return {
      success: true,
      newCount,
      updatedCount,
      unmatchedCount,
      results,
    };
  },
});
