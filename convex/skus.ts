import { v, ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";

type BundleDoc = Doc<"productBundles">;

async function getActiveBundlesByUserId(ctx: any, userId: Id<"profiles">) {
  const bundles = await ctx.db
    .query("productBundles")
    .withIndex("by_userId", (q: any) => q.eq("userId", userId))
    .collect();

  return bundles.filter((b: BundleDoc) => b.isActive);
}

function buildBundleMap(bundles: BundleDoc[]) {
  const bundleBySku = new Map<string, BundleDoc>();
  for (const bundle of bundles) {
    bundleBySku.set(bundle.bundleSku, bundle);
  }
  return bundleBySku;
}

function getEffectiveStock(
  skuCode: string,
  stockBySku: Map<string, number>,
  bundleBySku: Map<string, BundleDoc>
) {
  const bundle = bundleBySku.get(skuCode);
  if (!bundle) {
    return stockBySku.get(skuCode) ?? 0;
  }

  const component1Stock = stockBySku.get(bundle.componentSku1) ?? 0;
  const component2Stock = stockBySku.get(bundle.componentSku2) ?? 0;
  return Math.max(0, Math.min(component1Stock, component2Stock));
}

async function getSessionOrThrow(ctx: any, token: string) {
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q: any) => q.eq("token", token))
    .first();

  if (!session || session.expiresAt < Date.now()) {
    throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
  }

  return session;
}

// ============================================
// QUERIES
// ============================================

// List all SKUs for a user
export const list = query({
  args: {
    token: v.string(),
    includeInactive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Validate session
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    
    if (!session || session.expiresAt < Date.now()) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    // Use impersonated user if set, otherwise real user
    const targetUserId = (session.impersonatingUserId || session.userId);

    let skusQuery = ctx.db
      .query("skus")
      .withIndex("by_userId", (q) => q.eq("userId", targetUserId));

    const skus = await skusQuery.collect();

    // Filter inactive if needed
    if (!args.includeInactive) {
      return skus.filter((s) => s.isActive);
    }

    return skus;
  },
});

// Get single SKU by ID
export const getById = query({
  args: {
    token: v.string(),
    skuId: v.id("skus"),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    
    if (!session || session.expiresAt < Date.now()) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    const sku = await ctx.db.get(args.skuId);
    
    // Use impersonated user if set
    const targetUserId = (session.impersonatingUserId || session.userId);
    
    if (!sku || sku.userId !== targetUserId) {
      return null;
    }

    return sku;
  },
});

// Get SKU by code
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
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    // Use impersonated user if set
    const targetUserId = (session.impersonatingUserId || session.userId);
    
    return await ctx.db
      .query("skus")
      .withIndex("by_userId_sku", (q) => 
        q.eq("userId", targetUserId).eq("sku", args.sku)
      )
      .first();
  },
});

// Get stock for multiple SKUs at once (for order edit modal)
export const getStockForSkus = query({
  args: {
    token: v.string(),
    skuCodes: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const session = await getSessionOrThrow(ctx, args.token);
    const targetUserId = session.impersonatingUserId || session.userId;

    const result: Record<string, number> = {};
    const bundles = await getActiveBundlesByUserId(ctx, targetUserId);
    const bundleBySku = buildBundleMap(bundles);
    const stockCache = new Map<string, number>();

    const readSkuStock = async (skuCode: string) => {
      if (stockCache.has(skuCode)) {
        return stockCache.get(skuCode) ?? 0;
      }
      const sku = await ctx.db
        .query("skus")
        .withIndex("by_userId_sku", (q: any) =>
          q.eq("userId", targetUserId).eq("sku", skuCode)
        )
        .first();
      const stock = sku?.currentStock ?? 0;
      stockCache.set(skuCode, stock);
      return stock;
    };

    for (const skuCode of args.skuCodes) {
      const bundle = bundleBySku.get(skuCode);
      if (!bundle) {
        result[skuCode] = await readSkuStock(skuCode);
        continue;
      }

      const component1Stock = await readSkuStock(bundle.componentSku1);
      const component2Stock = await readSkuStock(bundle.componentSku2);
      result[skuCode] = Math.max(0, Math.min(component1Stock, component2Stock));
    }
    
    return result;
  },
});

// Get all SKUs with stock > 0 (for SKU picker dropdown)
export const getWithStock = query({
  args: {
    token: v.string(),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const session = await getSessionOrThrow(ctx, args.token);
    const targetUserId = session.impersonatingUserId || session.userId;

    let skus = await ctx.db
      .query("skus")
      .withIndex("by_userId", (q) => q.eq("userId", targetUserId))
      .collect();

    const bundles = await getActiveBundlesByUserId(ctx, targetUserId);
    const bundleBySku = buildBundleMap(bundles);
    const stockBySku = new Map(skus.map((s) => [s.sku, s.currentStock]));
    
    // Filter active and with effective stock
    skus = skus.filter((s) => s.isActive && getEffectiveStock(s.sku, stockBySku, bundleBySku) > 0);
    
    // Apply search if provided
    if (args.search) {
      const searchLower = args.search.toLowerCase();
      skus = skus.filter(s => 
        s.sku.toLowerCase().includes(searchLower) ||
        s.name.toLowerCase().includes(searchLower)
      );
    }
    
    // Sort by name
    skus.sort((a, b) => a.name.localeCompare(b.name));
    
    return skus.slice(0, 50); // Limit to 50 for dropdown
  },
});

// Get low stock SKUs
export const getLowStock = query({
  args: {
    token: v.string(),
    threshold: v.optional(v.number()), // Override threshold
  },
  handler: async (ctx, args) => {
    const session = await getSessionOrThrow(ctx, args.token);
    const targetUserId = session.impersonatingUserId || session.userId;

    const skus = await ctx.db
      .query("skus")
      .withIndex("by_userId", (q) => q.eq("userId", targetUserId))
      .collect();
    const bundles = await getActiveBundlesByUserId(ctx, targetUserId);
    const bundleBySku = buildBundleMap(bundles);
    const stockBySku = new Map(skus.map((s) => [s.sku, s.currentStock]));

    // Filter SKUs below their threshold (or provided threshold)
    return skus
      .filter((s) => {
        if (!s.isActive) return false;
        const threshold = args.threshold ?? s.lowStockThreshold;
        const effectiveStock = getEffectiveStock(s.sku, stockBySku, bundleBySku);
        return effectiveStock < threshold;
      })
      .map((s) => ({
        ...s,
        effectiveStock: getEffectiveStock(s.sku, stockBySku, bundleBySku),
        isBundle: bundleBySku.has(s.sku),
      }));
  },
});

// Get SKUs by category
export const getByCategory = query({
  args: {
    token: v.string(),
    category: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    
    if (!session || session.expiresAt < Date.now()) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    return await ctx.db
      .query("skus")
      .withIndex("by_userId_category", (q) => 
        q.eq("userId", (session.impersonatingUserId || session.userId)).eq("category", args.category)
      )
      .collect();
  },
});

// Get all categories
export const getCategories = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    
    if (!session || session.expiresAt < Date.now()) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    const skus = await ctx.db
      .query("skus")
      .withIndex("by_userId", (q) => q.eq("userId", (session.impersonatingUserId || session.userId)))
      .collect();

    // Extract unique categories
    const categories = new Set<string>();
    skus.forEach((s) => {
      if (s.category) categories.add(s.category);
    });

    return Array.from(categories).sort();
  },
});

// ============================================
// MUTATIONS
// ============================================

// Create new SKU
export const create = mutation({
  args: {
    token: v.string(),
    sku: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    costPrice: v.optional(v.float64()),
    sellPrice: v.optional(v.float64()),
    currentStock: v.optional(v.number()),
    lowStockThreshold: v.optional(v.number()),
    imageUrl: v.optional(v.string()),
    barcode: v.optional(v.string()),
    weight: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    
    if (!session || session.expiresAt < Date.now()) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    // Check if SKU already exists
    const existing = await ctx.db
      .query("skus")
      .withIndex("by_userId_sku", (q) => 
        q.eq("userId", (session.impersonatingUserId || session.userId)).eq("sku", args.sku)
      )
      .first();

    if (existing) {
      // If it exists but is inactive, reactivate it with the new data
      if (!existing.isActive) {
        await ctx.db.patch(existing._id, {
          name: args.name,
          description: args.description,
          category: args.category,
          costPrice: args.costPrice,
          sellPrice: args.sellPrice,
          currentStock: args.currentStock ?? existing.currentStock,
          lowStockThreshold: args.lowStockThreshold ?? existing.lowStockThreshold,
          imageUrl: args.imageUrl,
          barcode: args.barcode,
          weight: args.weight,
          isActive: true,
          updatedAt: Date.now(),
        });
        return existing._id;
      }
      throw new ConvexError(`SKU ${args.sku} există deja.`);
    }

    const now = Date.now();

    return await ctx.db.insert("skus", {
      userId: (session.impersonatingUserId || session.userId),
      sku: args.sku,
      name: args.name,
      description: args.description,
      category: args.category,
      costPrice: args.costPrice,
      sellPrice: args.sellPrice,
      currentStock: args.currentStock ?? 0,
      lowStockThreshold: args.lowStockThreshold ?? 50,
      isActive: true,
      imageUrl: args.imageUrl,
      barcode: args.barcode,
      weight: args.weight,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Update SKU details
export const update = mutation({
  args: {
    token: v.string(),
    skuId: v.id("skus"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    costPrice: v.optional(v.float64()),
    sellPrice: v.optional(v.float64()),
    lowStockThreshold: v.optional(v.number()),
    imageUrl: v.optional(v.string()),
    barcode: v.optional(v.string()),
    weight: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    
    if (!session || session.expiresAt < Date.now()) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    const sku = await ctx.db.get(args.skuId);
    
    if (!sku || sku.userId !== (session.impersonatingUserId || session.userId)) {
      throw new ConvexError("SKU nu a fost găsit.");
    }

    const updates: Partial<Doc<"skus">> = {
      updatedAt: Date.now(),
    };

    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;
    if (args.category !== undefined) updates.category = args.category;
    if (args.costPrice !== undefined) updates.costPrice = args.costPrice;
    if (args.sellPrice !== undefined) updates.sellPrice = args.sellPrice;
    if (args.lowStockThreshold !== undefined) updates.lowStockThreshold = args.lowStockThreshold;
    if (args.imageUrl !== undefined) updates.imageUrl = args.imageUrl;
    if (args.barcode !== undefined) updates.barcode = args.barcode;
    if (args.weight !== undefined) updates.weight = args.weight;

    await ctx.db.patch(args.skuId, updates);

    return args.skuId;
  },
});

// Update stock level (add or subtract)
export const updateStock = mutation({
  args: {
    token: v.string(),
    skuId: v.id("skus"),
    adjustment: v.number(), // Positive to add, negative to subtract
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    
    if (!session || session.expiresAt < Date.now()) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    const sku = await ctx.db.get(args.skuId);
    
    if (!sku || sku.userId !== (session.impersonatingUserId || session.userId)) {
      throw new ConvexError("SKU nu a fost găsit.");
    }

    const newStock = sku.currentStock + args.adjustment;

    if (newStock < 0) {
      throw new ConvexError("Stocul nu poate fi negativ.");
    }

    await ctx.db.patch(args.skuId, {
      currentStock: newStock,
      updatedAt: Date.now(),
    });

    return { skuId: args.skuId, newStock };
  },
});

// Set absolute stock level
export const setStock = mutation({
  args: {
    token: v.string(),
    skuId: v.id("skus"),
    stock: v.number(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    
    if (!session || session.expiresAt < Date.now()) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    const sku = await ctx.db.get(args.skuId);
    
    if (!sku || sku.userId !== (session.impersonatingUserId || session.userId)) {
      throw new ConvexError("SKU nu a fost găsit.");
    }

    if (args.stock < 0) {
      throw new ConvexError("Stocul nu poate fi negativ.");
    }

    await ctx.db.patch(args.skuId, {
      currentStock: args.stock,
      updatedAt: Date.now(),
    });

    return { skuId: args.skuId, newStock: args.stock };
  },
});

// Deactivate SKU (soft delete)
export const deactivate = mutation({
  args: {
    token: v.string(),
    skuId: v.id("skus"),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    
    if (!session || session.expiresAt < Date.now()) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    const sku = await ctx.db.get(args.skuId);
    
    if (!sku || sku.userId !== (session.impersonatingUserId || session.userId)) {
      throw new ConvexError("SKU nu a fost găsit.");
    }

    await ctx.db.patch(args.skuId, {
      isActive: false,
      updatedAt: Date.now(),
    });

    return args.skuId;
  },
});

// Reactivate SKU
export const reactivate = mutation({
  args: {
    token: v.string(),
    skuId: v.id("skus"),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    
    if (!session || session.expiresAt < Date.now()) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    const sku = await ctx.db.get(args.skuId);
    
    if (!sku || sku.userId !== (session.impersonatingUserId || session.userId)) {
      throw new ConvexError("SKU nu a fost găsit.");
    }

    await ctx.db.patch(args.skuId, {
      isActive: true,
      updatedAt: Date.now(),
    });

    return args.skuId;
  },
});

// Upsert SKU from Shopify (create or update)
export const upsertFromShopify = mutation({
  args: {
    token: v.string(),
    sku: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    costPrice: v.optional(v.float64()),
    sellPrice: v.optional(v.float64()),
    currentStock: v.optional(v.number()),
    barcode: v.optional(v.string()),
    weight: v.optional(v.float64()),
    imageUrl: v.optional(v.string()),
    shopifyProductId: v.optional(v.string()),
    shopifyVariantId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    
    if (!session || session.expiresAt < Date.now()) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    const now = Date.now();

    // Check if SKU already exists
    const existing = await ctx.db
      .query("skus")
      .withIndex("by_userId_sku", (q) => 
        q.eq("userId", (session.impersonatingUserId || session.userId)).eq("sku", args.sku)
      )
      .first();

    if (existing) {
      // Update existing SKU
      await ctx.db.patch(existing._id, {
        name: args.name,
        description: args.description ?? existing.description,
        category: args.category ?? existing.category,
        costPrice: args.costPrice ?? existing.costPrice,
        sellPrice: args.sellPrice ?? existing.sellPrice,
        currentStock: args.currentStock ?? existing.currentStock,
        barcode: args.barcode ?? existing.barcode,
        weight: args.weight ?? existing.weight,
        imageUrl: args.imageUrl ?? existing.imageUrl,
        shopifyProductId: args.shopifyProductId,
        shopifyVariantId: args.shopifyVariantId,
        updatedAt: now,
      });
      return existing._id;
    }

    // Create new SKU
    return await ctx.db.insert("skus", {
      userId: (session.impersonatingUserId || session.userId),
      sku: args.sku,
      name: args.name,
      description: args.description,
      category: args.category,
      costPrice: args.costPrice,
      sellPrice: args.sellPrice,
      currentStock: args.currentStock ?? 0,
      lowStockThreshold: 50,
      isActive: true,
      imageUrl: args.imageUrl,
      barcode: args.barcode,
      weight: args.weight,
      shopifyProductId: args.shopifyProductId,
      shopifyVariantId: args.shopifyVariantId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Batch upsert from Shopify - memory efficient
export const upsertBatchFromShopify = mutation({
  args: {
    token: v.string(),
    skus: v.array(v.object({
      sku: v.string(),
      name: v.string(),
      description: v.optional(v.string()),
      category: v.optional(v.string()),
      costPrice: v.optional(v.float64()),
      sellPrice: v.optional(v.float64()),
      currentStock: v.number(),
      barcode: v.optional(v.string()),
      weight: v.optional(v.float64()),
      imageUrl: v.optional(v.string()),
      shopifyProductId: v.string(),
      shopifyVariantId: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    
    if (!session || session.expiresAt < Date.now()) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    const now = Date.now();
    let synced = 0;

    for (const skuData of args.skus) {
      const existing = await ctx.db
        .query("skus")
        .withIndex("by_userId_sku", (q) => 
          q.eq("userId", (session.impersonatingUserId || session.userId)).eq("sku", skuData.sku)
        )
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          name: skuData.name,
          description: skuData.description ?? existing.description,
          category: skuData.category ?? existing.category,
          costPrice: skuData.costPrice ?? existing.costPrice,
          sellPrice: skuData.sellPrice ?? existing.sellPrice,
          currentStock: skuData.currentStock,
          barcode: skuData.barcode ?? existing.barcode,
          weight: skuData.weight ?? existing.weight,
          imageUrl: skuData.imageUrl ?? existing.imageUrl,
          shopifyProductId: skuData.shopifyProductId,
          shopifyVariantId: skuData.shopifyVariantId,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("skus", {
          userId: (session.impersonatingUserId || session.userId),
          sku: skuData.sku,
          name: skuData.name,
          description: skuData.description,
          category: skuData.category,
          costPrice: skuData.costPrice,
          sellPrice: skuData.sellPrice,
          currentStock: skuData.currentStock,
          lowStockThreshold: 50,
          isActive: true,
          imageUrl: skuData.imageUrl,
          barcode: skuData.barcode,
          weight: skuData.weight,
          shopifyProductId: skuData.shopifyProductId,
          shopifyVariantId: skuData.shopifyVariantId,
          createdAt: now,
          updatedAt: now,
        });
      }
      synced++;
    }

    return { synced };
  },
});

// Bulk create SKUs
export const bulkCreate = mutation({
  args: {
    token: v.string(),
    skus: v.array(v.object({
      sku: v.string(),
      name: v.string(),
      description: v.optional(v.string()),
      category: v.optional(v.string()),
      costPrice: v.optional(v.float64()),
      sellPrice: v.optional(v.float64()),
      currentStock: v.optional(v.number()),
      lowStockThreshold: v.optional(v.number()),
    })),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    
    if (!session || session.expiresAt < Date.now()) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    const now = Date.now();
    const created: Id<"skus">[] = [];
    const errors: { sku: string; error: string }[] = [];

    for (const skuData of args.skus) {
      // Check if SKU already exists
      const existing = await ctx.db
        .query("skus")
        .withIndex("by_userId_sku", (q) => 
          q.eq("userId", (session.impersonatingUserId || session.userId)).eq("sku", skuData.sku)
        )
        .first();

      if (existing) {
        errors.push({ sku: skuData.sku, error: "Already exists" });
        continue;
      }

      const id = await ctx.db.insert("skus", {
        userId: (session.impersonatingUserId || session.userId),
        sku: skuData.sku,
        name: skuData.name,
        description: skuData.description,
        category: skuData.category,
        costPrice: skuData.costPrice,
        sellPrice: skuData.sellPrice,
        currentStock: skuData.currentStock ?? 0,
        lowStockThreshold: skuData.lowStockThreshold ?? 50,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });

      created.push(id);
    }

    return { created, errors };
  },
});

// Upsert SKU from webhook (no auth token - uses userId directly)
export const upsertFromWebhook = mutation({
  args: {
    userId: v.id("profiles"),
    sku: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    costPrice: v.optional(v.float64()),
    sellPrice: v.optional(v.float64()),
    currentStock: v.optional(v.number()),
    barcode: v.optional(v.string()),
    weight: v.optional(v.float64()),
    imageUrl: v.optional(v.string()),
    shopifyProductId: v.optional(v.string()),
    shopifyVariantId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, ...skuData } = args;
    const now = Date.now();

    // Check if SKU already exists
    const existing = await ctx.db
      .query("skus")
      .withIndex("by_userId_sku", (q) => 
        q.eq("userId", userId).eq("sku", args.sku)
      )
      .first();

    if (existing) {
      // Update existing SKU
      await ctx.db.patch(existing._id, {
        name: skuData.name,
        description: skuData.description ?? existing.description,
        category: skuData.category ?? existing.category,
        costPrice: skuData.costPrice ?? existing.costPrice,
        sellPrice: skuData.sellPrice ?? existing.sellPrice,
        barcode: skuData.barcode ?? existing.barcode,
        weight: skuData.weight ?? existing.weight,
        imageUrl: skuData.imageUrl ?? existing.imageUrl,
        shopifyProductId: skuData.shopifyProductId,
        shopifyVariantId: skuData.shopifyVariantId,
        isActive: true, // Reactivate if it was deactivated
        updatedAt: now,
      });
      return existing._id;
    }

    // Create new SKU
    return await ctx.db.insert("skus", {
      userId,
      sku: skuData.sku,
      name: skuData.name,
      description: skuData.description,
      category: skuData.category,
      costPrice: skuData.costPrice,
      sellPrice: skuData.sellPrice,
      currentStock: skuData.currentStock ?? 0,
      lowStockThreshold: 50,
      isActive: true,
      imageUrl: skuData.imageUrl,
      barcode: skuData.barcode,
      weight: skuData.weight,
      shopifyProductId: skuData.shopifyProductId,
      shopifyVariantId: skuData.shopifyVariantId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// ============================================
// STORE OVERRIDES (per-store names, prices, currencies)
// ============================================

// Get all store overrides for a user's SKUs
export const getStoreOverrides = query({
  args: {
    token: v.string(),
    sku: v.optional(v.string()),         // Filter by specific SKU
    shopDomain: v.optional(v.string()),  // Filter by specific store
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    
    if (!session || session.expiresAt < Date.now()) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    const targetUserId = session.impersonatingUserId || session.userId;

    if (args.sku && args.shopDomain) {
      // Specific SKU + store combination
      const override = await ctx.db
        .query("skuStoreOverrides")
        .withIndex("by_userId_sku_shopDomain", (q) =>
          q.eq("userId", targetUserId).eq("sku", args.sku!).eq("shopDomain", args.shopDomain!)
        )
        .first();
      return override ? [override] : [];
    }

    if (args.sku) {
      return await ctx.db
        .query("skuStoreOverrides")
        .withIndex("by_userId_sku", (q) =>
          q.eq("userId", targetUserId).eq("sku", args.sku!)
        )
        .collect();
    }

    if (args.shopDomain) {
      return await ctx.db
        .query("skuStoreOverrides")
        .withIndex("by_userId_shopDomain", (q) =>
          q.eq("userId", targetUserId).eq("shopDomain", args.shopDomain!)
        )
        .collect();
    }

    // All overrides
    return await ctx.db
      .query("skuStoreOverrides")
      .withIndex("by_userId", (q) => q.eq("userId", targetUserId))
      .collect();
  },
});

// List SKUs with their store overrides included
export const listWithOverrides = query({
  args: {
    token: v.string(),
    includeInactive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const session = await getSessionOrThrow(ctx, args.token);

    const targetUserId = session.impersonatingUserId || session.userId;

    let skus = await ctx.db
      .query("skus")
      .withIndex("by_userId", (q) => q.eq("userId", targetUserId))
      .collect();

    if (!args.includeInactive) {
      skus = skus.filter((s) => s.isActive);
    }

    // Get all overrides for this user
    const allOverrides = await ctx.db
      .query("skuStoreOverrides")
      .withIndex("by_userId", (q) => q.eq("userId", targetUserId))
      .collect();
    const bundles = await getActiveBundlesByUserId(ctx, targetUserId);
    const bundleBySku = buildBundleMap(bundles);
    const stockBySku = new Map(skus.map((s) => [s.sku, s.currentStock]));

    // Group overrides by SKU
    const overridesBySku: Record<string, typeof allOverrides> = {};
    for (const override of allOverrides) {
      if (!overridesBySku[override.sku]) {
        overridesBySku[override.sku] = [];
      }
      overridesBySku[override.sku].push(override);
    }

    // Combine SKUs with their overrides
    return skus.map((sku) => ({
      ...sku,
      storeOverrides: overridesBySku[sku.sku] || [],
      effectiveStock: getEffectiveStock(sku.sku, stockBySku, bundleBySku),
      isBundle: bundleBySku.has(sku.sku),
      bundleComponents: bundleBySku.has(sku.sku)
        ? [bundleBySku.get(sku.sku)!.componentSku1, bundleBySku.get(sku.sku)!.componentSku2]
        : [],
    }));
  },
});

// Get bundle definitions for user
export const getBundles = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await getSessionOrThrow(ctx, args.token);
    const targetUserId = session.impersonatingUserId || session.userId;

    return await ctx.db
      .query("productBundles")
      .withIndex("by_userId", (q: any) => q.eq("userId", targetUserId))
      .collect();
  },
});

// Create/update bundle configuration for a bundle SKU
export const upsertBundle = mutation({
  args: {
    token: v.string(),
    bundleSku: v.string(),
    componentSku1: v.string(),
    componentSku2: v.string(),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const session = await getSessionOrThrow(ctx, args.token);
    const targetUserId = session.impersonatingUserId || session.userId;
    const now = Date.now();

    if (args.bundleSku === args.componentSku1 || args.bundleSku === args.componentSku2) {
      throw new ConvexError("Bundle SKU nu poate fi același cu unul dintre componente.");
    }
    if (args.componentSku1 === args.componentSku2) {
      throw new ConvexError("Componentele bundle-ului trebuie să fie diferite.");
    }

    const [bundleSku, component1, component2] = await Promise.all([
      ctx.db
        .query("skus")
        .withIndex("by_userId_sku", (q: any) =>
          q.eq("userId", targetUserId).eq("sku", args.bundleSku)
        )
        .first(),
      ctx.db
        .query("skus")
        .withIndex("by_userId_sku", (q: any) =>
          q.eq("userId", targetUserId).eq("sku", args.componentSku1)
        )
        .first(),
      ctx.db
        .query("skus")
        .withIndex("by_userId_sku", (q: any) =>
          q.eq("userId", targetUserId).eq("sku", args.componentSku2)
        )
        .first(),
    ]);

    if (!bundleSku) throw new ConvexError("Bundle SKU nu există în listă.");
    if (!component1 || !component2) {
      throw new ConvexError("Ambele SKU-uri componente trebuie să existe.");
    }

    const existing = await ctx.db
      .query("productBundles")
      .withIndex("by_userId_bundleSku", (q: any) =>
        q.eq("userId", targetUserId).eq("bundleSku", args.bundleSku)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        componentSku1: args.componentSku1,
        componentSku2: args.componentSku2,
        isActive: args.isActive ?? true,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("productBundles", {
      userId: targetUserId,
      bundleSku: args.bundleSku,
      bundleName: bundleSku.name,
      componentSku1: args.componentSku1,
      componentSku2: args.componentSku2,
      isActive: args.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Disable bundle behavior for a SKU
export const removeBundle = mutation({
  args: {
    token: v.string(),
    bundleSku: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await getSessionOrThrow(ctx, args.token);
    const targetUserId = session.impersonatingUserId || session.userId;

    const existing = await ctx.db
      .query("productBundles")
      .withIndex("by_userId_bundleSku", (q: any) =>
        q.eq("userId", targetUserId).eq("bundleSku", args.bundleSku)
      )
      .first();

    if (!existing) {
      return { success: true, removed: false };
    }

    await ctx.db.patch(existing._id, {
      isActive: false,
      updatedAt: Date.now(),
    });
    return { success: true, removed: true };
  },
});

// Upsert a store override for a SKU
export const upsertStoreOverride = mutation({
  args: {
    token: v.string(),
    sku: v.string(),
    shopDomain: v.string(),
    displayName: v.optional(v.string()),
    sellPrice: v.optional(v.float64()),
    costPrice: v.optional(v.float64()),
    currency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    
    if (!session || session.expiresAt < Date.now()) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    const targetUserId = session.impersonatingUserId || session.userId;
    const now = Date.now();

    // Check if override already exists
    const existing = await ctx.db
      .query("skuStoreOverrides")
      .withIndex("by_userId_sku_shopDomain", (q) =>
        q.eq("userId", targetUserId).eq("sku", args.sku).eq("shopDomain", args.shopDomain)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...(args.displayName !== undefined && { displayName: args.displayName }),
        ...(args.sellPrice !== undefined && { sellPrice: args.sellPrice }),
        ...(args.costPrice !== undefined && { costPrice: args.costPrice }),
        ...(args.currency !== undefined && { currency: args.currency }),
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("skuStoreOverrides", {
      userId: targetUserId,
      sku: args.sku,
      shopDomain: args.shopDomain,
      displayName: args.displayName,
      sellPrice: args.sellPrice,
      costPrice: args.costPrice,
      currency: args.currency,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Upsert store override from webhook (no auth token - uses userId directly)
export const upsertStoreOverrideFromWebhook = mutation({
  args: {
    userId: v.id("profiles"),
    sku: v.string(),
    shopDomain: v.string(),
    displayName: v.optional(v.string()),
    sellPrice: v.optional(v.float64()),
    costPrice: v.optional(v.float64()),
    currency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const existing = await ctx.db
      .query("skuStoreOverrides")
      .withIndex("by_userId_sku_shopDomain", (q) =>
        q.eq("userId", args.userId).eq("sku", args.sku).eq("shopDomain", args.shopDomain)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...(args.displayName !== undefined && { displayName: args.displayName }),
        ...(args.sellPrice !== undefined && { sellPrice: args.sellPrice }),
        ...(args.costPrice !== undefined && { costPrice: args.costPrice }),
        ...(args.currency !== undefined && { currency: args.currency }),
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("skuStoreOverrides", {
      userId: args.userId,
      sku: args.sku,
      shopDomain: args.shopDomain,
      displayName: args.displayName,
      sellPrice: args.sellPrice,
      costPrice: args.costPrice,
      currency: args.currency,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Delete a store override
export const deleteStoreOverride = mutation({
  args: {
    token: v.string(),
    overrideId: v.id("skuStoreOverrides"),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    
    if (!session || session.expiresAt < Date.now()) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    const override = await ctx.db.get(args.overrideId);
    if (!override || override.userId !== (session.impersonatingUserId || session.userId)) {
      throw new ConvexError("Override not found.");
    }

    await ctx.db.delete(args.overrideId);
    return { success: true };
  },
});

// ============================================
// STOCK MUTATIONS
// ============================================

// Deduct stock by SKU code (for order processing)
export const deductStockBySku = mutation({
  args: {
    userId: v.id("profiles"),
    sku: v.string(),
    quantity: v.number(),
  },
  handler: async (ctx, args) => {
    const skuRecord = await ctx.db
      .query("skus")
      .withIndex("by_userId_sku", (q) =>
        q.eq("userId", args.userId).eq("sku", args.sku)
      )
      .first();

    if (!skuRecord) {
      console.log(`SKU ${args.sku} not found for stock deduction`);
      return { success: false, error: "SKU not found" };
    }

    const newStock = Math.max(0, skuRecord.currentStock - args.quantity);
    
    await ctx.db.patch(skuRecord._id, {
      currentStock: newStock,
      updatedAt: Date.now(),
    });

    return { success: true, newStock, skuId: skuRecord._id };
  },
});

// Add stock back by SKU code (for order cancellation or quantity reduction)
export const addStockBySku = mutation({
  args: {
    token: v.string(),
    sku: v.string(),
    quantity: v.number(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    
    if (!session || session.expiresAt < Date.now()) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    const skuRecord = await ctx.db
      .query("skus")
      .withIndex("by_userId_sku", (q) =>
        q.eq("userId", (session.impersonatingUserId || session.userId)).eq("sku", args.sku)
      )
      .first();

    if (!skuRecord) {
      console.log(`SKU ${args.sku} not found for stock addition`);
      return { success: false, error: "SKU not found" };
    }

    const newStock = skuRecord.currentStock + args.quantity;
    
    await ctx.db.patch(skuRecord._id, {
      currentStock: newStock,
      updatedAt: Date.now(),
    });

    return { success: true, newStock, skuId: skuRecord._id };
  },
});

// Adjust stock for multiple SKUs at once (for order modification)
export const adjustStockBatch = mutation({
  args: {
    token: v.string(),
    adjustments: v.array(v.object({
      sku: v.string(),
      quantity: v.number(), // Positive to add, negative to deduct
    })),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    
    if (!session || session.expiresAt < Date.now()) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    const results: { sku: string; success: boolean; newStock?: number; error?: string }[] = [];
    
    for (const adj of args.adjustments) {
      const skuRecord = await ctx.db
        .query("skus")
        .withIndex("by_userId_sku", (q) =>
          q.eq("userId", (session.impersonatingUserId || session.userId)).eq("sku", adj.sku)
        )
        .first();

      if (!skuRecord) {
        results.push({ sku: adj.sku, success: false, error: "SKU not found" });
        continue;
      }

      const newStock = Math.max(0, skuRecord.currentStock + adj.quantity);
      
      await ctx.db.patch(skuRecord._id, {
        currentStock: newStock,
        updatedAt: Date.now(),
      });

      results.push({ sku: adj.sku, success: true, newStock });
    }

    return results;
  },
});

// Cleanup junk SKUs (deactivate SHOPIFY-* and other auto-generated junk)
export const cleanupJunkSkus = mutation({
  args: {
    token: v.string(),
    dryRun: v.optional(v.boolean()), // If true, returns list without deactivating
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    
    if (!session || session.expiresAt < Date.now()) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    const targetUserId = session.impersonatingUserId || session.userId;

    const allSkus = await ctx.db
      .query("skus")
      .withIndex("by_userId", (q) => q.eq("userId", targetUserId))
      .collect();

    // Find junk SKUs: starts with "SHOPIFY-" or has no real SKU code
    const junkSkus = allSkus.filter((s) => 
      s.sku.startsWith("SHOPIFY-") || s.sku.trim() === ""
    );

    if (args.dryRun) {
      return {
        found: junkSkus.length,
        skus: junkSkus.map((s) => ({ id: s._id, sku: s.sku, name: s.name, isActive: s.isActive })),
        deactivated: 0,
      };
    }

    let deactivated = 0;
    for (const sku of junkSkus) {
      if (sku.isActive) {
        await ctx.db.patch(sku._id, {
          isActive: false,
          updatedAt: Date.now(),
        });
        deactivated++;
      }
    }

    return { found: junkSkus.length, deactivated, skus: [] };
  },
});

// Permanently delete junk SKUs (for cleaning up after deactivation)
export const deleteJunkSkus = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    
    if (!session || session.expiresAt < Date.now()) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    const targetUserId = session.impersonatingUserId || session.userId;

    const allSkus = await ctx.db
      .query("skus")
      .withIndex("by_userId", (q) => q.eq("userId", targetUserId))
      .collect();

    // Only delete inactive junk SKUs
    const junkSkus = allSkus.filter((s) => 
      !s.isActive && (s.sku.startsWith("SHOPIFY-") || s.sku.trim() === "")
    );

    let deleted = 0;
    for (const sku of junkSkus) {
      await ctx.db.delete(sku._id);
      deleted++;
    }

    return { deleted };
  },
});

// Deactivate all SKUs linked to a Shopify product (for product deletion)
export const deactivateByShopifyProduct = mutation({
  args: {
    userId: v.id("profiles"),
    shopifyProductId: v.string(),
  },
  handler: async (ctx, args) => {
    const skus = await ctx.db
      .query("skus")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();

    const toDeactivate = skus.filter(
      (s) => s.shopifyProductId === args.shopifyProductId
    );

    for (const sku of toDeactivate) {
      await ctx.db.patch(sku._id, {
        isActive: false,
        updatedAt: Date.now(),
      });
    }

    return { deactivated: toDeactivate.length };
  },
});
