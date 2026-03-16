import { mutation, query, action, internalMutation, internalQuery } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import { getUserFromToken } from "./auth";

// Environment variables (set in Convex Dashboard)
// SHOPIFY_CLIENT_ID - Your Shopify app's Client ID
// SHOPIFY_CLIENT_SECRET - Your Shopify app's Client Secret

const SHOPIFY_SCOPES = [
  "read_orders",
  "write_orders", 
  "read_products",
  "read_inventory",
  "read_fulfillments",
  "write_fulfillments",
  "read_customers",
].join(",");

// Generate a random state token for CSRF protection
function generateState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, "0")).join("");
}

// Normalize shop domain
function normalizeShopDomain(input: string): string {
  let domain = input.trim().toLowerCase();
  // Remove protocol
  domain = domain.replace(/^https?:\/\//, "");
  // Remove trailing slash
  domain = domain.replace(/\/$/, "");
  // Add .myshopify.com if not present
  if (!domain.includes(".myshopify.com")) {
    domain = `${domain}.myshopify.com`;
  }
  return domain;
}

// ============================================
// SHOPIFY APP CONFIG
// ============================================

// Get the user's Shopify app configuration
export const getAppConfig = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");

    const config = await ctx.db
      .query("shopifyAppConfig")
      .withIndex("by_userId", q => q.eq("userId", user._id))
      .first();

    if (!config) return null;

    // Return config without exposing full secret
    return {
      _id: config._id,
      clientId: config.clientId,
      clientSecretSet: !!config.clientSecret,
      clientSecretPreview: config.clientSecret ? `****${config.clientSecret.slice(-4)}` : null,
      appName: config.appName,
      createdAt: config.createdAt,
    };
  },
});

// Save Shopify app configuration
export const saveAppConfig = mutation({
  args: {
    token: v.string(),
    clientId: v.string(),
    clientSecret: v.string(),
    appName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");

    const existing = await ctx.db
      .query("shopifyAppConfig")
      .withIndex("by_userId", q => q.eq("userId", user._id))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        clientId: args.clientId,
        clientSecret: args.clientSecret,
        appName: args.appName,
        updatedAt: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert("shopifyAppConfig", {
      userId: user._id,
      clientId: args.clientId,
      clientSecret: args.clientSecret,
      appName: args.appName,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

// Delete Shopify app configuration
export const deleteAppConfig = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");

    const config = await ctx.db
      .query("shopifyAppConfig")
      .withIndex("by_userId", q => q.eq("userId", user._id))
      .first();

    if (config) {
      await ctx.db.delete(config._id);
    }
  },
});

// Internal query to get app credentials (for OAuth actions)
export const internalGetAppConfig = internalQuery({
  args: { userId: v.id("profiles") },
  handler: async (ctx, args) => {
    const config = await ctx.db
      .query("shopifyAppConfig")
      .withIndex("by_userId", q => q.eq("userId", args.userId))
      .first();

    return config;
  },
});

// ============================================
// DIRECT TOKEN CONNECTION (No OAuth needed!)
// ============================================

// Connect a store using an access token directly (from Custom App)
export const connectWithToken = mutation({
  args: {
    token: v.string(),
    shopDomain: v.string(),
    accessToken: v.string(),
    storeName: v.optional(v.string()),
    // Per-store app credentials (optional)
    clientId: v.optional(v.string()),
    clientSecret: v.optional(v.string()),
    appName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");

    const normalizedDomain = normalizeShopDomain(args.shopDomain);
    const shopUrl = `https://${normalizedDomain}`;

    // Check if this store is already connected
    const existing = await ctx.db
      .query("shopifyStoreConnections")
      .withIndex("by_shopDomain", q => q.eq("shopDomain", normalizedDomain))
      .first();

    if (existing) {
      // Update existing connection
      await ctx.db.patch(existing._id, {
        accessToken: args.accessToken,
        connectionName: args.storeName || normalizedDomain.replace(".myshopify.com", ""),
        ...(args.clientId && { clientId: args.clientId }),
        ...(args.clientSecret && { clientSecret: args.clientSecret }),
        ...(args.appName && { appName: args.appName }),
        isActive: true,
        updatedAt: Date.now(),
      });
      return { success: true, storeId: existing._id, message: "Store connection updated" };
    }

    // Check if user has any stores - first one becomes primary
    const userStores = await ctx.db
      .query("shopifyStoreConnections")
      .withIndex("by_userId", q => q.eq("userId", user._id))
      .collect();

    const isPrimary = userStores.length === 0;

    // Create new connection with per-store credentials
    const storeId = await ctx.db.insert("shopifyStoreConnections", {
      userId: user._id,
      shopDomain: normalizedDomain,
      shopUrl,
      accessToken: args.accessToken,
      scopes: "custom_app",
      connectionType: "access_token",
      connectionName: args.storeName || normalizedDomain.replace(".myshopify.com", ""),
      // Per-store app credentials
      clientId: args.clientId,
      clientSecret: args.clientSecret,
      appName: args.appName,
      isActive: true,
      isPrimary,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { success: true, storeId, message: "Store connected successfully" };
  },
});

// Verify a store connection by making a test API call
export const verifyConnection = action({
  args: {
    token: v.string(),
    shopDomain: v.string(),
    accessToken: v.string(),
  },
  handler: async (_ctx, args): Promise<{ valid: boolean; shopName?: string; error?: string }> => {
    const normalizedDomain = normalizeShopDomain(args.shopDomain);

    try {
      // Make a test API call to verify the token works
      const response = await fetch(`https://${normalizedDomain}/admin/api/2024-01/shop.json`, {
        headers: {
          "X-Shopify-Access-Token": args.accessToken,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          return { valid: false, error: "Invalid access token" };
        }
        return { valid: false, error: `API error: ${response.status}` };
      }

      const data = await response.json();
      return { valid: true, shopName: data.shop?.name };
    } catch (error: any) {
      return { valid: false, error: error.message || "Connection failed" };
    }
  },
});

// ============================================
// QUERIES
// ============================================

// Get all connected Shopify stores for a user
export const getStores = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");

    const stores = await ctx.db
      .query("shopifyStoreConnections")
      .withIndex("by_userId", q => q.eq("userId", user._id))
      .collect();

    // Don't return the actual access tokens or full secrets to the frontend
    return stores.map(store => ({
      _id: store._id,
      shopDomain: store.shopDomain,
      shopUrl: store.shopUrl,
      connectionName: store.connectionName,
      alias: store.alias, // User-friendly alias
      displayName: store.alias || store.connectionName || store.shopDomain.replace(".myshopify.com", ""),
      isActive: store.isActive,
      isPrimary: store.isPrimary,
      scopes: store.scopes,
      // Per-store app credentials info (masked)
      hasAppCredentials: !!(store.clientId && store.clientSecret),
      clientId: store.clientId,
      clientSecretPreview: store.clientSecret ? `****${store.clientSecret.slice(-4)}` : null,
      appName: store.appName,
      createdAt: store.createdAt,
    }));
  },
});

// Get a specific store connection
export const getStore = query({
  args: { 
    token: v.string(),
    shopDomain: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");

    const store = await ctx.db
      .query("shopifyStoreConnections")
      .withIndex("by_shopDomain", q => q.eq("shopDomain", args.shopDomain))
      .first();

    if (!store || store.userId !== user._id) {
      return null;
    }

    return {
      _id: store._id,
      shopDomain: store.shopDomain,
      shopUrl: store.shopUrl,
      connectionName: store.connectionName,
      isActive: store.isActive,
      isPrimary: store.isPrimary,
      scopes: store.scopes,
      createdAt: store.createdAt,
    };
  },
});

// Get store access token (for API calls from other files)
export const getStoreAccessToken = query({
  args: {
    token: v.string(),
    shopDomain: v.optional(v.string()), // If not provided, use primary store
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");

    let store;
    if (args.shopDomain) {
      const shopDomain = args.shopDomain;
      store = await ctx.db
        .query("shopifyStoreConnections")
        .withIndex("by_shopDomain", q => q.eq("shopDomain", shopDomain))
        .first();
      
      if (store && store.userId !== user._id) {
        throw new ConvexError("Nu ai acces la acest magazin.");
      }
    } else {
      // Get primary store
      const stores = await ctx.db
        .query("shopifyStoreConnections")
        .withIndex("by_userId", q => q.eq("userId", user._id))
        .collect();
      
      store = stores.find(s => s.isPrimary) || stores[0];
    }

    if (!store) {
      return null;
    }

    return {
      shopDomain: store.shopDomain,
      shopUrl: store.shopUrl,
      accessToken: store.accessToken,
      currency: store.currency,
    };
  },
});

// Get store by domain (for webhooks - no auth required)
export const getStoreByDomain = query({
  args: {
    shopDomain: v.string(),
  },
  handler: async (ctx, args) => {
    const store = await ctx.db
      .query("shopifyStoreConnections")
      .withIndex("by_shopDomain", q => q.eq("shopDomain", args.shopDomain))
      .first();

    if (!store) {
      return null;
    }

    return {
      userId: store.userId,
      shopDomain: store.shopDomain,
      shopUrl: store.shopUrl,
      currency: store.currency,
    };
  },
});

// ============================================
// INTERNAL QUERIES (for use within actions)
// ============================================

export const internalGetOAuthState = internalQuery({
  args: { state: v.string() },
  handler: async (ctx, args) => {
    const oauthState = await ctx.db
      .query("shopifyOauthStates")
      .withIndex("by_state", q => q.eq("state", args.state))
      .first();

    if (!oauthState) return null;
    
    // Check if expired
    if (new Date(oauthState.expiresAt) < new Date()) {
      return null;
    }

    return oauthState;
  },
});

// ============================================
// MUTATIONS
// ============================================

// Create OAuth state (called before redirect)
export const createOAuthState = mutation({
  args: {
    token: v.string(),
    shopDomain: v.string(),
    // Per-store app credentials
    clientId: v.optional(v.string()),
    clientSecret: v.optional(v.string()),
    appName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");

    const normalizedDomain = normalizeShopDomain(args.shopDomain);
    const state = generateState();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

    // Clean up any existing states for this user/shop
    const existingStates = await ctx.db
      .query("shopifyOauthStates")
      .withIndex("by_userId", q => q.eq("userId", user._id))
      .collect();

    for (const existing of existingStates) {
      if (existing.shopDomain === normalizedDomain) {
        await ctx.db.delete(existing._id);
      }
    }

    // Create new state with optional per-store credentials
    await ctx.db.insert("shopifyOauthStates", {
      userId: user._id,
      shopDomain: normalizedDomain,
      state,
      clientId: args.clientId,
      clientSecret: args.clientSecret,
      appName: args.appName,
      expiresAt,
      createdAt: Date.now(),
    });

    return { state, shopDomain: normalizedDomain, userId: user._id, clientId: args.clientId };
  },
});

// Set a store as primary
export const setPrimaryStore = mutation({
  args: {
    token: v.string(),
    storeId: v.id("shopifyStoreConnections"),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");

    const store = await ctx.db.get(args.storeId);
    if (!store || store.userId !== user._id) {
      throw new ConvexError("Magazinul nu a fost găsit.");
    }

    // Remove primary from all other stores
    const userStores = await ctx.db
      .query("shopifyStoreConnections")
      .withIndex("by_userId", q => q.eq("userId", user._id))
      .collect();

    for (const s of userStores) {
      if (s.isPrimary && s._id !== args.storeId) {
        await ctx.db.patch(s._id, { isPrimary: false, updatedAt: Date.now() });
      }
    }

    // Set this store as primary
    await ctx.db.patch(args.storeId, { isPrimary: true, updatedAt: Date.now() });
  },
});

// Disconnect a store
export const disconnectStore = mutation({
  args: {
    token: v.string(),
    storeId: v.id("shopifyStoreConnections"),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");

    const store = await ctx.db.get(args.storeId);
    if (!store || store.userId !== user._id) {
      throw new ConvexError("Magazinul nu a fost găsit.");
    }

    await ctx.db.delete(args.storeId);

    // If this was the primary store, make another one primary
    if (store.isPrimary) {
      const remainingStores = await ctx.db
        .query("shopifyStoreConnections")
        .withIndex("by_userId", q => q.eq("userId", user._id))
        .first();

      if (remainingStores) {
        await ctx.db.patch(remainingStores._id, { isPrimary: true, updatedAt: Date.now() });
      }
    }
  },
});

// Update store name
export const updateStoreName = mutation({
  args: {
    token: v.string(),
    storeId: v.id("shopifyStoreConnections"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");

    const store = await ctx.db.get(args.storeId);
    if (!store || store.userId !== user._id) {
      throw new ConvexError("Magazinul nu a fost găsit.");
    }

    await ctx.db.patch(args.storeId, { 
      connectionName: args.name,
      updatedAt: Date.now(),
    });
  },
});

// Update store alias (user-friendly name)
export const updateStoreAlias = mutation({
  args: {
    token: v.string(),
    storeId: v.id("shopifyStoreConnections"),
    alias: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");

    const store = await ctx.db.get(args.storeId);
    if (!store || store.userId !== user._id) {
      throw new ConvexError("Magazinul nu a fost găsit.");
    }

    await ctx.db.patch(args.storeId, { 
      alias: args.alias,
      updatedAt: Date.now(),
    });
    
    return { success: true };
  },
});

// Update store app credentials
export const updateStoreCredentials = mutation({
  args: {
    token: v.string(),
    storeId: v.id("shopifyStoreConnections"),
    clientId: v.string(),
    clientSecret: v.optional(v.string()), // Optional - keep existing if not provided
    appName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");

    const store = await ctx.db.get(args.storeId);
    if (!store || store.userId !== user._id) {
      throw new ConvexError("Magazinul nu a fost găsit.");
    }

    const updates: any = {
      clientId: args.clientId,
      updatedAt: Date.now(),
    };

    if (args.clientSecret) {
      updates.clientSecret = args.clientSecret;
    }

    if (args.appName !== undefined) {
      updates.appName = args.appName;
    }

    await ctx.db.patch(args.storeId, updates);
    
    return { success: true };
  },
});

// ============================================
// INTERNAL MUTATIONS (for use within actions)
// ============================================

export const internalSaveStoreConnection = internalMutation({
  args: {
    userId: v.id("profiles"),
    shopDomain: v.string(),
    accessToken: v.string(),
    scopes: v.optional(v.string()),
    // Per-store app credentials
    clientId: v.optional(v.string()),
    clientSecret: v.optional(v.string()),
    appName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const normalizedDomain = normalizeShopDomain(args.shopDomain);
    const shopUrl = `https://${normalizedDomain}`;

    // Check if this store is already connected
    const existing = await ctx.db
      .query("shopifyStoreConnections")
      .withIndex("by_shopDomain", q => q.eq("shopDomain", normalizedDomain))
      .first();

    if (existing) {
      // Update existing connection (including credentials if provided)
      await ctx.db.patch(existing._id, {
        accessToken: args.accessToken,
        scopes: args.scopes,
        ...(args.clientId && { clientId: args.clientId }),
        ...(args.clientSecret && { clientSecret: args.clientSecret }),
        ...(args.appName && { appName: args.appName }),
        isActive: true,
        updatedAt: Date.now(),
      });

      // Auto-setup: re-register webhooks + sync on reconnect
      await ctx.scheduler.runAfter(0, internal.shopify.autoSetupNewStore, {
        userId: args.userId,
        shopDomain: normalizedDomain,
      });

      return existing._id;
    }

    // Check if user has any stores - first one becomes primary
    const userStores = await ctx.db
      .query("shopifyStoreConnections")
      .withIndex("by_userId", q => q.eq("userId", args.userId))
      .collect();

    const isPrimary = userStores.length === 0;

    // Create new connection with per-store credentials
    const storeId = await ctx.db.insert("shopifyStoreConnections", {
      userId: args.userId,
      shopDomain: normalizedDomain,
      shopUrl,
      accessToken: args.accessToken,
      scopes: args.scopes,
      connectionType: "oauth",
      connectionName: normalizedDomain.replace(".myshopify.com", ""),
      // Per-store app credentials
      clientId: args.clientId,
      clientSecret: args.clientSecret,
      appName: args.appName,
      isActive: true,
      isPrimary,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Auto-setup: register webhooks + sync orders & products
    await ctx.scheduler.runAfter(0, internal.shopify.autoSetupNewStore, {
      userId: args.userId,
      shopDomain: normalizedDomain,
    });

    return storeId;
  },
});

// Internal query to get store auth without user token (for auto-setup actions)
export const internalGetStoreAuth = internalQuery({
  args: {
    userId: v.id("profiles"),
    shopDomain: v.string(),
  },
  handler: async (ctx, args) => {
    const store = await ctx.db
      .query("shopifyStoreConnections")
      .withIndex("by_shopDomain", q => q.eq("shopDomain", args.shopDomain))
      .first();

    if (!store || store.userId !== args.userId) return null;

    return {
      shopDomain: store.shopDomain,
      shopUrl: store.shopUrl,
      accessToken: store.accessToken,
      currency: store.currency,
    };
  },
});

export const internalDeleteOAuthState = internalMutation({
  args: { state: v.string() },
  handler: async (ctx, args) => {
    const oauthState = await ctx.db
      .query("shopifyOauthStates")
      .withIndex("by_state", q => q.eq("state", args.state))
      .first();

    if (oauthState) {
      await ctx.db.delete(oauthState._id);
    }
  },
});

// ============================================
// ACTIONS (for external API calls)
// ============================================

// Initialize OAuth flow - returns authorization URL
export const initOAuth = action({
  args: {
    token: v.string(),
    shopDomain: v.string(),
    redirectUri: v.string(), // The callback URL
    // Per-store app credentials (optional - falls back to global config or env vars)
    clientId: v.optional(v.string()),
    clientSecret: v.optional(v.string()),
    appName: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ authorizationUrl: string; state: string; shopDomain: string }> => {
    // We need to import api here for this call
    const { api } = await import("./_generated/api");
    
    // Create state in database with per-store credentials
    const result = await ctx.runMutation(api.shopifyOauth.createOAuthState, {
      token: args.token,
      shopDomain: args.shopDomain,
      clientId: args.clientId,
      clientSecret: args.clientSecret,
      appName: args.appName,
    });

    const { state, shopDomain, userId } = result;

    // Determine which client ID to use (priority: per-store > global config > env var)
    let clientId = args.clientId;
    
    if (!clientId) {
      // Try to get client ID from user's global app config
      const appConfig = await ctx.runQuery(internal.shopifyOauth.internalGetAppConfig, { userId });
      clientId = appConfig?.clientId;
    }
    
    if (!clientId) {
      // Fall back to environment variable
      clientId = process.env.SHOPIFY_CLIENT_ID;
    }
    
    if (!clientId) {
      throw new ConvexError("Shopify OAuth nu este configurat. Introdu Client ID și Client Secret pentru acest magazin.");
    }

    // Build authorization URL
    const authorizationUrl = new URL(`https://${shopDomain}/admin/oauth/authorize`);
    authorizationUrl.searchParams.set("client_id", clientId);
    authorizationUrl.searchParams.set("scope", SHOPIFY_SCOPES);
    authorizationUrl.searchParams.set("redirect_uri", args.redirectUri);
    authorizationUrl.searchParams.set("state", state);

    return {
      authorizationUrl: authorizationUrl.toString(),
      state,
      shopDomain,
    };
  },
});

// Exchange authorization code for access token
export const exchangeCodeForToken = action({
  args: {
    code: v.string(),
    shop: v.string(),
    state: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    // Verify state using internal query
    const oauthState = await ctx.runQuery(internal.shopifyOauth.internalGetOAuthState, {
      state: args.state,
    });

    if (!oauthState) {
      return { success: false, error: "Invalid or expired OAuth state" };
    }

    const normalizedShop = normalizeShopDomain(args.shop);
    if (oauthState.shopDomain !== normalizedShop) {
      return { success: false, error: "Shop domain mismatch" };
    }

    // Get app credentials (priority: per-store from OAuth state > global config > env vars)
    let clientId = oauthState.clientId;
    let clientSecret = oauthState.clientSecret;
    let appName = oauthState.appName;

    // If not in OAuth state, try global app config
    if (!clientId || !clientSecret) {
      const appConfig = await ctx.runQuery(internal.shopifyOauth.internalGetAppConfig, {
        userId: oauthState.userId,
      });
      clientId = clientId || appConfig?.clientId;
      clientSecret = clientSecret || appConfig?.clientSecret;
      appName = appName || appConfig?.appName;
    }

    // Fall back to environment variables
    clientId = clientId || process.env.SHOPIFY_CLIENT_ID;
    clientSecret = clientSecret || process.env.SHOPIFY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return { success: false, error: "Shopify OAuth not configured. Please provide Client ID and Client Secret for this store." };
    }

    // Exchange code for token
    const tokenUrl = `https://${normalizedShop}/admin/oauth/access_token`;
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: args.code,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Token exchange failed:", errorText);
      return { success: false, error: "Failed to exchange code for token" };
    }

    const tokenData = await response.json();
    const { access_token, scope } = tokenData;

    // Save the connection with per-store credentials
    await ctx.runMutation(internal.shopifyOauth.internalSaveStoreConnection, {
      userId: oauthState.userId,
      shopDomain: normalizedShop,
      accessToken: access_token,
      scopes: scope,
      // Include per-store app credentials if provided
      clientId: oauthState.clientId,
      clientSecret: oauthState.clientSecret,
      appName: oauthState.appName,
    });

    // Clean up OAuth state using internal mutation
    await ctx.runMutation(internal.shopifyOauth.internalDeleteOAuthState, {
      state: args.state,
    });

    return { success: true };
  },
});
