# VNT Dash Logistics → Convex Porting Guide

This document provides a comprehensive guide for porting the VNT Dash Logistics application from Supabase to Convex. It covers the database schema, API patterns, authentication, and key business logic.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Database Schema](#database-schema)
3. [Authentication](#authentication)
4. [Edge Functions → Convex Actions/HTTP](#edge-functions--convex-actionshttp)
5. [Frontend Integration Patterns](#frontend-integration-patterns)
6. [External API Integrations](#external-api-integrations)
7. [Migration Strategy](#migration-strategy)

---

## Architecture Overview

### Current Stack (Supabase)
- **Frontend**: React + Vite + TypeScript + TailwindCSS + shadcn/ui
- **Backend**: Supabase Edge Functions (Deno)
- **Database**: PostgreSQL (Supabase)
- **Auth**: Supabase Auth
- **State Management**: React Query + local state

### Target Stack (Convex)
- **Frontend**: React + Vite + TypeScript + TailwindCSS + shadcn/ui (unchanged)
- **Backend**: Convex Functions (queries, mutations, actions)
- **Database**: Convex (Document-based)
- **Auth**: Convex Auth or custom token-based
- **State Management**: Convex React hooks (real-time by default)

### Key Differences
| Feature | Supabase | Convex |
|---------|----------|--------|
| Database | PostgreSQL (relational) | Document-based (NoSQL-like) |
| Real-time | Subscriptions via channels | Built-in, automatic |
| Functions | Edge Functions (Deno) | Queries/Mutations/Actions |
| Auth | Supabase Auth | Convex Auth or custom |
| File Storage | Supabase Storage | Convex File Storage |

---

## Database Schema

### Core Tables → Convex Tables

Below is the complete schema mapping. Each Supabase table becomes a Convex table.

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ============================================
  // USER & AUTH
  // ============================================
  
  profiles: defineTable({
    userId: v.string(), // Auth user ID
    email: v.string(),
    name: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_email", ["email"]),

  userSettings: defineTable({
    userId: v.string(),
    woocommerceUrl: v.optional(v.string()),
    consumerKey: v.optional(v.string()),
    consumerSecret: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"]),

  userConnections: defineTable({
    userId: v.string(),
    connectionType: v.string(), // "sameday", "shopify", "shopify_oauth", "fgo"
    connectionName: v.string(),
    credentials: v.any(), // JSON object with connection-specific creds
    authToken: v.optional(v.string()),
    authTokenExpiresAt: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_type", ["userId", "connectionType"]),

  userBillingRates: defineTable({
    userId: v.string(),
    pricePerOrder: v.number(),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"]),

  userPackagingRates: defineTable({
    userId: v.string(),
    sku: v.optional(v.string()),
    packagingType: v.string(),
    packagingCost: v.number(),
    quantityThreshold: v.number(),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"]),

  // ============================================
  // ORDERS
  // ============================================

  shopifyOrders: defineTable({
    userId: v.string(),
    shopifyOrderId: v.string(),
    orderNumber: v.string(),
    status: v.string(), // "on_hold", "ready", "cancelled"
    fulfillmentStatus: v.optional(v.string()),
    paymentStatus: v.optional(v.string()),
    placedOn: v.string(), // Date string YYYY-MM-DD
    paymentMethod: v.string(),
    
    // Pricing
    totalPrice: v.number(),
    subtotalPrice: v.optional(v.number()),
    totalShipping: v.optional(v.number()),
    totalTax: v.optional(v.number()),
    totalDiscounts: v.optional(v.number()),
    
    // Customer
    customerName: v.optional(v.string()),
    customerEmail: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
    
    // Addresses (nested objects)
    shippingAddress: v.optional(v.any()),
    billingAddress: v.optional(v.any()),
    
    // Line items
    items: v.array(v.any()),
    shippingLines: v.optional(v.array(v.any())),
    taxLines: v.optional(v.array(v.any())),
    discountCodes: v.optional(v.array(v.any())),
    
    // Tracking & Invoicing
    trackingNumber: v.optional(v.string()),
    invoiceNumber: v.optional(v.string()),
    invoiceSeries: v.optional(v.string()),
    invoiceStatus: v.optional(v.string()),
    invoicePaidAmount: v.optional(v.number()),
    invoicePaidDate: v.optional(v.string()),
    
    // Internal
    notes: v.optional(v.string()),
    activityHistory: v.optional(v.array(v.any())),
    shopDomain: v.optional(v.string()),
    
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_shopifyOrderId", ["userId", "shopifyOrderId"])
    .index("by_userId_placedOn", ["userId", "placedOn"])
    .index("by_userId_status", ["userId", "status"])
    .index("by_trackingNumber", ["trackingNumber"]),

  // ============================================
  // AWB & SHIPPING
  // ============================================

  awbTracking: defineTable({
    userId: v.string(),
    orderId: v.optional(v.id("shopifyOrders")),
    awbNumber: v.string(),
    shopifyOrderId: v.optional(v.string()),
    orderNumber: v.optional(v.string()),
    customerName: v.optional(v.string()),
    customerEmail: v.optional(v.string()),
    shippingAddress: v.optional(v.any()),
    serviceId: v.optional(v.number()),
    serviceName: v.optional(v.string()),
    pickupPointId: v.optional(v.string()),
    contactPersonId: v.optional(v.string()),
    packageWeight: v.optional(v.number()),
    packageLength: v.optional(v.number()),
    packageWidth: v.optional(v.number()),
    packageHeight: v.optional(v.number()),
    codAmount: v.optional(v.number()),
    declaredValue: v.optional(v.number()),
    currentStatus: v.optional(v.string()),
    statusHistory: v.optional(v.array(v.any())),
    samedayResponse: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_awbNumber", ["awbNumber"])
    .index("by_orderId", ["orderId"]),

  // ============================================
  // PICKING LISTS
  // ============================================

  pickingLists: defineTable({
    userId: v.string(),
    name: v.string(),
    status: v.string(), // "pending", "in_progress", "awb_generated", "completed"
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_status", ["userId", "status"]),

  pickingListItems: defineTable({
    pickingListId: v.id("pickingLists"),
    orderId: v.id("shopifyOrders"),
    createdAt: v.number(),
  })
    .index("by_pickingListId", ["pickingListId"])
    .index("by_orderId", ["orderId"]),

  orderWorkStatus: defineTable({
    orderId: v.id("shopifyOrders"),
    pickingListId: v.optional(v.id("pickingLists")),
    markedBy: v.string(),
    markedAt: v.string(),
    createdAt: v.number(),
  })
    .index("by_orderId", ["orderId"])
    .index("by_pickingListId", ["pickingListId"]),

  orderPrintLogs: defineTable({
    orderId: v.id("shopifyOrders"),
    pickingListId: v.optional(v.id("pickingLists")),
    documentType: v.string(), // "awb", "invoice", "picking_list"
    printedBy: v.string(),
    printedAt: v.string(),
    createdAt: v.number(),
  })
    .index("by_orderId", ["orderId"])
    .index("by_pickingListId", ["pickingListId"]),

  // ============================================
  // INVENTORY & STOCK
  // ============================================

  items: defineTable({
    userId: v.string(),
    sku: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_sku", ["userId", "sku"]),

  dailyStockData: defineTable({
    userId: v.string(),
    sku: v.string(),
    date: v.string(),
    year: v.number(),
    month: v.number(),
    orders: v.number(),
    outboundUnits: v.number(),
    returns: v.number(),
    orderReturns: v.number(),
    revenue: v.number(),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_date", ["userId", "date"])
    .index("by_userId_sku", ["userId", "sku"]),

  monthlyOpeningStock: defineTable({
    userId: v.string(),
    sku: v.optional(v.string()),
    year: v.number(),
    month: v.number(),
    openingStock: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_year_month", ["userId", "year", "month"]),

  inboundRecords: defineTable({
    userId: v.string(),
    sku: v.string(),
    date: v.string(),
    units: v.number(),
    notes: v.optional(v.string()),
    completed: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_date", ["userId", "date"]),

  stockTransfers: defineTable({
    userId: v.string(),
    sku: v.string(),
    quantity: v.number(),
    destination: v.string(),
    notes: v.optional(v.string()),
    transferredAt: v.string(),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"]),

  productBundles: defineTable({
    userId: v.string(),
    bundleSku: v.string(),
    bundleName: v.optional(v.string()),
    componentSku1: v.string(),
    componentSku2: v.string(),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_bundleSku", ["bundleSku"]),

  skuServiceMappings: defineTable({
    userId: v.string(),
    sku: v.string(),
    serviceName: v.string(),
    description: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_sku", ["sku"]),

  // ============================================
  // WAREHOUSE
  // ============================================

  warehouseLocations: defineTable({
    userId: v.string(),
    locationCode: v.string(),
    zone: v.string(),
    rack: v.string(),
    level: v.string(),
    capacity: v.number(),
    isReturnsZone: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_locationCode", ["locationCode"]),

  warehouseStock: defineTable({
    userId: v.string(),
    locationId: v.id("warehouseLocations"),
    sku: v.string(),
    quantity: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_locationId", ["locationId"])
    .index("by_sku", ["sku"]),

  warehouseMovements: defineTable({
    userId: v.string(),
    sku: v.string(),
    quantity: v.number(),
    movementType: v.string(), // "inbound", "outbound", "transfer"
    fromLocationId: v.optional(v.id("warehouseLocations")),
    toLocationId: v.optional(v.id("warehouseLocations")),
    performedBy: v.string(),
    notes: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_sku", ["sku"]),

  // ============================================
  // RETURNS
  // ============================================

  returns: defineTable({
    userId: v.string(),
    awbNumber: v.string(),
    shopifyOrderId: v.optional(v.string()),
    orderNumber: v.optional(v.string()),
    customerName: v.optional(v.string()),
    customerEmail: v.optional(v.string()),
    returnDate: v.string(),
    returnReason: v.optional(v.string()),
    returnStatus: v.optional(v.string()),
    returnedItems: v.optional(v.array(v.any())),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_awbNumber", ["awbNumber"]),

  // ============================================
  // COURIER & REVENUE
  // ============================================

  courierRevenue: defineTable({
    userId: v.string(),
    recordDate: v.string(),
    address: v.string(),
    totalCodAmount: v.number(),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_recordDate", ["recordDate"]),

  // ============================================
  // GEOLOCATION (Sameday)
  // ============================================

  samedayCounties: defineTable({
    id: v.string(), // Sameday's county ID
    name: v.string(),
    normalizedName: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_normalizedName", ["normalizedName"]),

  samedayCities: defineTable({
    id: v.string(), // Sameday's city ID
    countyId: v.string(),
    name: v.string(),
    normalizedName: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_countyId", ["countyId"])
    .index("by_normalizedName", ["normalizedName"]),

  // ============================================
  // JOB QUEUE (for async processing)
  // ============================================

  jobQueue: defineTable({
    userId: v.string(),
    orderId: v.id("shopifyOrders"),
    jobType: v.string(), // "generate_awb", "create_invoice", "sync_shopify"
    status: v.string(), // "pending", "processing", "completed", "failed"
    priority: v.number(),
    payload: v.any(),
    result: v.optional(v.any()),
    errorMessage: v.optional(v.string()),
    retries: v.number(),
    maxRetries: v.number(),
    startedAt: v.optional(v.string()),
    completedAt: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_userId", ["userId"])
    .index("by_orderId", ["orderId"]),

  jobLogs: defineTable({
    jobId: v.id("jobQueue"),
    level: v.string(), // "info", "warn", "error"
    message: v.string(),
    details: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_jobId", ["jobId"]),

  // ============================================
  // SHOPIFY OAUTH
  // ============================================

  shopifyOauthStates: defineTable({
    userId: v.string(),
    shopDomain: v.string(),
    state: v.string(),
    nonce: v.optional(v.string()),
    redirectUri: v.optional(v.string()),
    expiresAt: v.string(),
    createdAt: v.number(),
  })
    .index("by_state", ["state"])
    .index("by_userId", ["userId"]),

  shopifyStoreConnections: defineTable({
    userId: v.string(),
    shopDomain: v.string(),
    shopUrl: v.string(),
    accessToken: v.string(),
    scopes: v.optional(v.string()),
    connectionType: v.string(),
    connectionName: v.optional(v.string()),
    associatedUser: v.optional(v.any()),
    isActive: v.boolean(),
    isPrimary: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_shopDomain", ["shopDomain"]),

  // ============================================
  // MISC
  // ============================================

  feedback: defineTable({
    userId: v.optional(v.string()),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    message: v.string(),
    category: v.optional(v.string()),
    rating: v.optional(v.number()),
    status: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }),

  orderNotesBackup: defineTable({
    userId: v.string(),
    orderId: v.id("shopifyOrders"),
    shopifyOrderId: v.string(),
    orderNumber: v.optional(v.string()),
    notes: v.optional(v.string()),
    activityHistory: v.optional(v.array(v.any())),
    snapshotDate: v.string(),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_orderId", ["orderId"]),

  packagingTypes: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    defaultCost: v.number(),
    createdAt: v.number(),
  }),
});
```

---

## Authentication

### Current Pattern (Supabase)

```typescript
// Frontend - AuthContext.tsx
const { user, session } = await supabase.auth.getSession();
const { error } = await supabase.auth.signInWithPassword({ email, password });

// Edge Functions - verify JWT
const { data: { user }, error } = await supabase.auth.getUser(token);
```

### Convex Pattern

#### Option 1: Custom Token-Based Auth (Simpler)

```typescript
// convex/auth.ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import * as bcrypt from "bcryptjs";

// Schema addition for sessions
// sessions: defineTable({...})

export const signUp = mutation({
  args: {
    email: v.string(),
    password: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if user exists
    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_email", q => q.eq("email", args.email))
      .first();
    
    if (existing) throw new Error("Email already exists");
    
    // Hash password
    const passwordHash = await bcrypt.hash(args.password, 10);
    
    // Create user
    const userId = await ctx.db.insert("profiles", {
      email: args.email,
      name: args.name,
      passwordHash,
      userId: crypto.randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    
    // Create session
    const token = crypto.randomUUID();
    await ctx.db.insert("sessions", {
      userId,
      token,
      expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000), // 30 days
      createdAt: Date.now(),
    });
    
    return { token, userId };
  },
});

export const signIn = mutation({
  args: {
    email: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("profiles")
      .withIndex("by_email", q => q.eq("email", args.email))
      .first();
    
    if (!user) throw new Error("Invalid credentials");
    
    const valid = await bcrypt.compare(args.password, user.passwordHash);
    if (!valid) throw new Error("Invalid credentials");
    
    const token = crypto.randomUUID();
    await ctx.db.insert("sessions", {
      userId: user._id,
      token,
      expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000),
      createdAt: Date.now(),
    });
    
    return { token, user: { _id: user._id, email: user.email, name: user.name } };
  },
});

// Helper to validate token
export async function validateSession(ctx: { db: any }, token: string) {
  if (!token) return null;
  
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_token", q => q.eq("token", token))
    .first();
  
  if (!session || session.expiresAt < Date.now()) return null;
  
  return await ctx.db.get(session.userId);
}
```

#### Option 2: Convex Auth (Full-featured)

Use the official Convex Auth package for OAuth, magic links, etc.

```bash
npm install @convex-dev/auth
```

---

## Edge Functions → Convex Actions/HTTP

### Function Type Mapping

| Supabase Pattern | Convex Equivalent |
|------------------|-------------------|
| Edge Function (read-only) | Query |
| Edge Function (writes DB) | Mutation |
| Edge Function (external API) | Action |
| Edge Function (webhook) | HTTP Endpoint |

### Key Functions to Port

#### 1. Shopify Orders Sync

**Current**: `supabase/functions/shopify-orders/index.ts`

**Convex Version**:

```typescript
// convex/shopify.ts
import { action, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

// Action to fetch from Shopify API
export const syncOrders = action({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    // Validate session
    const user = await ctx.runQuery(api.auth.getCurrentUser, { token: args.token });
    if (!user) throw new Error("Unauthorized");
    
    // Get Shopify connection
    const connection = await ctx.runQuery(api.connections.getByType, {
      userId: user._id,
      connectionType: "shopify",
    });
    
    if (!connection) throw new Error("Shopify not connected");
    
    const { shop_url, access_token } = connection.credentials;
    
    // Fetch orders from Shopify
    const response = await fetch(`${shop_url}/admin/api/2023-10/orders.json?status=any&limit=250`, {
      headers: {
        "X-Shopify-Access-Token": access_token,
        "Content-Type": "application/json",
      },
    });
    
    if (!response.ok) throw new Error("Shopify API error");
    
    const { orders } = await response.json();
    
    // Transform and upsert orders via mutation
    for (const order of orders) {
      await ctx.runMutation(api.orders.upsertOrder, {
        userId: user._id,
        shopifyOrderId: order.id.toString(),
        orderNumber: order.name,
        status: order.financial_status === "paid" ? "ready" : "on_hold",
        // ... transform all fields
      });
    }
    
    return { synced: orders.length };
  },
});

// Mutation to upsert single order
export const upsertOrder = mutation({
  args: {
    userId: v.string(),
    shopifyOrderId: v.string(),
    orderNumber: v.string(),
    status: v.string(),
    // ... all other fields
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("shopifyOrders")
      .withIndex("by_userId_shopifyOrderId", q => 
        q.eq("userId", args.userId).eq("shopifyOrderId", args.shopifyOrderId)
      )
      .first();
    
    if (existing) {
      // Preserve local fields like notes
      await ctx.db.patch(existing._id, {
        ...args,
        notes: existing.notes, // Don't overwrite
        activityHistory: existing.activityHistory,
        updatedAt: Date.now(),
      });
      return existing._id;
    } else {
      return await ctx.db.insert("shopifyOrders", {
        ...args,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
});

// Query to list orders
export const listOrders = query({
  args: {
    token: v.string(),
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await validateSession(ctx, args.token);
    if (!user) throw new Error("Unauthorized");
    
    let query = ctx.db
      .query("shopifyOrders")
      .withIndex("by_userId", q => q.eq("userId", user._id));
    
    const orders = await query.order("desc").take(args.limit || 100);
    
    return orders;
  },
});
```

#### 2. AWB Generation (Sameday API)

**Current**: `supabase/functions/generate-awb/index.ts`

**Convex Version**:

```typescript
// convex/sameday.ts
import { action, mutation } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

export const generateAwb = action({
  args: {
    token: v.string(),
    pickingListId: v.id("pickingLists"),
    orders: v.array(v.object({
      orderId: v.id("shopifyOrders"),
      orderNumber: v.string(),
      customerName: v.string(),
      customerPhone: v.optional(v.string()),
      totalPrice: v.number(),
      items: v.array(v.any()),
      shippingAddress: v.any(),
    })),
  },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(api.auth.getCurrentUser, { token: args.token });
    if (!user) throw new Error("Unauthorized");
    
    // Get Sameday connection
    const connection = await ctx.runQuery(api.connections.getByType, {
      userId: user._id,
      connectionType: "sameday",
    });
    
    if (!connection) throw new Error("Sameday not connected");
    
    const { username, password, api_url, pickup_location, contact_person_id } = connection.credentials;
    const baseUrl = api_url || "https://api.sameday.ro";
    
    // Authenticate with Sameday
    const authToken = await authenticateSameday(username, password, baseUrl);
    
    const results = [];
    
    for (const order of args.orders) {
      try {
        // Resolve county and city IDs
        const countyId = await findCountyId(order.shippingAddress.state, authToken, baseUrl);
        const cityId = await findCityId(
          order.shippingAddress.city,
          countyId,
          order.shippingAddress.zipCode,
          authToken,
          baseUrl
        );
        
        // Create AWB
        const awbResponse = await createAwb({
          authToken,
          baseUrl,
          pickupPointId: pickup_location,
          contactPersonId: contact_person_id,
          order,
          countyId,
          cityId,
        });
        
        // Save AWB to database
        await ctx.runMutation(api.awb.createTracking, {
          userId: user._id,
          orderId: order.orderId,
          awbNumber: awbResponse.awbNumber,
          orderNumber: order.orderNumber,
          // ... other fields
        });
        
        // Update order with tracking number
        await ctx.runMutation(api.orders.updateTracking, {
          orderId: order.orderId,
          trackingNumber: awbResponse.awbNumber,
          fulfillmentStatus: "fulfilled",
        });
        
        results.push({ orderNumber: order.orderNumber, success: true, awbNumber: awbResponse.awbNumber });
      } catch (error) {
        results.push({ orderNumber: order.orderNumber, success: false, error: error.message });
      }
    }
    
    return { results, summary: { total: results.length, successful: results.filter(r => r.success).length } };
  },
});

// Helper functions
async function authenticateSameday(username: string, password: string, baseUrl: string): Promise<string> {
  const response = await fetch(`${baseUrl}/api/authenticate`, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "X-Auth-Username": username,
      "X-Auth-Password": password,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "remember_me=true",
  });
  
  if (!response.ok) throw new Error("Sameday authentication failed");
  
  const data = await response.json();
  return data.token;
}

async function findCountyId(countyName: string, authToken: string, baseUrl: string): Promise<string> {
  const response = await fetch(
    `${baseUrl}/api/geolocation/county?name=${encodeURIComponent(countyName)}&countryCode=RO&page=1&countPerPage=10`,
    { headers: { "X-AUTH-TOKEN": authToken, "Accept": "application/json" } }
  );
  
  const data = await response.json();
  const counties = Array.isArray(data) ? data : (data.data || []);
  
  return counties.length > 0 ? String(counties[0].id) : "1"; // Default to Bucuresti
}

async function findCityId(cityName: string, countyId: string, postalCode: string, authToken: string, baseUrl: string): Promise<string> {
  // First try by postal code
  if (postalCode) {
    const response = await fetch(
      `${baseUrl}/api/geolocation/city?countryCode=RO&county=${countyId}&postalCode=${postalCode}&page=1&countPerPage=10`,
      { headers: { "X-AUTH-TOKEN": authToken, "Accept": "application/json" } }
    );
    
    const data = await response.json();
    const cities = Array.isArray(data) ? data : (data.data || []);
    
    if (cities.length > 0) return String(cities[0].id);
  }
  
  // Fall back to city name search
  const response = await fetch(
    `${baseUrl}/api/geolocation/city?countryCode=RO&county=${countyId}&page=1&countPerPage=500`,
    { headers: { "X-AUTH-TOKEN": authToken, "Accept": "application/json" } }
  );
  
  const data = await response.json();
  const cities = Array.isArray(data) ? data : (data.data || []);
  
  const match = cities.find((c: any) => c.name?.toLowerCase() === cityName.toLowerCase());
  return match ? String(match.id) : String(cities[0]?.id || "6");
}
```

#### 3. FGO Invoice Generation

**Current**: `supabase/functions/fgo-invoice/index.ts`

**Convex Version**:

```typescript
// convex/fgo.ts
import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

// SHA-1 hash function
async function sha1(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

export const createInvoice = action({
  args: {
    token: v.string(),
    orderId: v.id("shopifyOrders"),
    includeShipping: v.optional(v.boolean()),
    useOrderDate: v.optional(v.boolean()),
    createPayment: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(api.auth.getCurrentUser, { token: args.token });
    if (!user) throw new Error("Unauthorized");
    
    // Get order
    const order = await ctx.runQuery(api.orders.getById, { id: args.orderId });
    if (!order || order.userId !== user._id) throw new Error("Order not found");
    
    // Check if invoice already exists
    if (order.invoiceNumber && order.invoiceStatus !== "storno") {
      return { success: true, alreadyExists: true, invoice: { number: order.invoiceNumber, series: order.invoiceSeries } };
    }
    
    // Get FGO connection
    const connection = await ctx.runQuery(api.connections.getByType, {
      userId: user._id,
      connectionType: "fgo",
    });
    
    if (!connection) throw new Error("FGO not connected");
    
    const { vatNumber, apiKey, invoiceSeries, vatTaxPercentage, platformUrl } = connection.credentials;
    
    // Calculate hash
    const normalizedVatNumber = vatNumber.trim();
    const normalizedApiKey = apiKey.trim();
    const normalizedCustomerName = order.customerName.trim();
    const hash = await sha1(`${normalizedVatNumber}${normalizedApiKey}${normalizedCustomerName}`);
    
    // Prepare invoice data
    const vatRate = parseFloat(vatTaxPercentage || "21") / 100;
    const invoiceData: Record<string, string> = {
      CodUnic: normalizedVatNumber,
      Hash: hash,
      Serie: invoiceSeries || "FV",
      TipFactura: "Factura",
      Valuta: "RON",
      DataEmitere: new Date().toISOString().split("T")[0],
      PlatformaUrl: platformUrl,
      "Client[Denumire]": normalizedCustomerName,
      "Client[Email]": order.customerEmail || "",
      "Client[Tara]": "RO",
      "Client[Judet]": order.shippingAddress?.state || "",
      "Client[Localitate]": order.shippingAddress?.city || "",
      "Client[Adresa]": order.shippingAddress?.line1 || "",
      "Client[Tip]": "PF",
      Text: `Comanda: ${order.orderNumber}`,
      IdExtern: order.shopifyOrderId,
    };
    
    // Add items
    order.items.forEach((item: any, index: number) => {
      const unitPriceWithVAT = parseFloat(item.price || "0");
      const unitPriceWithoutVAT = unitPriceWithVAT / (1 + vatRate);
      
      invoiceData[`Continut[${index}][Denumire]`] = item.name;
      invoiceData[`Continut[${index}][UM]`] = "buc";
      invoiceData[`Continut[${index}][NrProduse]`] = item.quantity.toString();
      invoiceData[`Continut[${index}][PretUnitar]`] = unitPriceWithoutVAT.toFixed(4);
      invoiceData[`Continut[${index}][CotaTVA]`] = (vatRate * 100).toString();
    });
    
    // Add shipping if applicable
    if (args.includeShipping !== false && order.totalShipping > 0) {
      const shippingIndex = order.items.length;
      const shippingWithoutVAT = order.totalShipping / (1 + vatRate);
      
      invoiceData[`Continut[${shippingIndex}][Denumire]`] = "Transport";
      invoiceData[`Continut[${shippingIndex}][UM]`] = "buc";
      invoiceData[`Continut[${shippingIndex}][NrProduse]`] = "1";
      invoiceData[`Continut[${shippingIndex}][PretUnitar]`] = shippingWithoutVAT.toFixed(4);
      invoiceData[`Continut[${shippingIndex}][CotaTVA]`] = (vatRate * 100).toString();
    }
    
    // Send to FGO
    const formBody = Object.entries(invoiceData)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");
    
    const response = await fetch("https://api.fgo.ro/v1/factura/emitere", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody,
    });
    
    const responseData = await response.json();
    
    if (responseData.Success) {
      const invoiceNumber = responseData.Factura.Numar.replace(responseData.Factura.Serie, "");
      
      // Update order
      await ctx.runMutation(api.orders.updateInvoice, {
        orderId: args.orderId,
        invoiceNumber,
        invoiceSeries: responseData.Factura.Serie,
        invoiceStatus: "unpaid",
      });
      
      return {
        success: true,
        invoice: {
          number: invoiceNumber,
          series: responseData.Factura.Serie,
          link: responseData.Factura.Link,
        },
      };
    } else {
      throw new Error(`FGO Error: ${responseData.Message}`);
    }
  },
});
```

#### 4. HTTP Endpoints (Webhooks)

```typescript
// convex/http.ts
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Shopify-Topic, X-Shopify-Hmac-SHA256",
};

// CORS preflight
http.route({
  path: "/webhook/shopify",
  method: "OPTIONS",
  handler: httpAction(async () => new Response(null, { status: 204, headers: corsHeaders })),
});

// Shopify order webhook
http.route({
  path: "/webhook/shopify",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    try {
      const topic = req.headers.get("X-Shopify-Topic");
      const body = await req.json();
      
      if (topic === "orders/create" || topic === "orders/updated") {
        // Process order
        await ctx.runMutation(api.webhooks.processShopifyOrder, { order: body });
      }
      
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }),
});

export default http;
```

---

## Frontend Integration Patterns

### Replace Supabase Client with Convex

**Before (Supabase)**:
```typescript
// src/integrations/supabase/client.ts
import { createClient } from '@supabase/supabase-js';
export const supabase = createClient(url, key);

// In component
const { data, error } = await supabase.from('shopify_orders').select('*').eq('user_id', userId);
```

**After (Convex)**:
```typescript
// src/main.tsx
import { ConvexProvider, ConvexReactClient } from "convex/react";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ConvexProvider client={convex}>
    <App />
  </ConvexProvider>
);

// In component
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../convex/_generated/api";

function Orders() {
  const token = localStorage.getItem("authToken");
  
  // Real-time query - auto-updates!
  const orders = useQuery(api.orders.listOrders, { token: token ?? "" });
  
  // Mutations
  const updateOrder = useMutation(api.orders.updateOrder);
  
  // Actions (for external APIs)
  const syncOrders = useAction(api.shopify.syncOrders);
  
  if (orders === undefined) return <div>Loading...</div>;
  
  return (
    <ul>
      {orders.map(order => (
        <li key={order._id}>{order.orderNumber}</li>
      ))}
    </ul>
  );
}
```

### Update AuthContext

```typescript
// src/contexts/AuthContext.tsx
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("authToken"));
  
  // Get current user from Convex
  const user = useQuery(api.auth.getCurrentUser, token ? { token } : "skip");
  const signInMutation = useMutation(api.auth.signIn);
  const signOutMutation = useMutation(api.auth.signOut);
  
  const signIn = async (email: string, password: string) => {
    const result = await signInMutation({ email, password });
    localStorage.setItem("authToken", result.token);
    setToken(result.token);
    return { error: null };
  };
  
  const signOut = async () => {
    if (token) await signOutMutation({ token });
    localStorage.removeItem("authToken");
    setToken(null);
  };
  
  const loading = token !== null && user === undefined;
  const isAdmin = user?.email === "admin@example.com";
  const isSuperAdmin = user?.email === "andrei.cotu@yahoo.com";
  
  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, isAdmin, isSuperAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}
```

---

## External API Integrations

### Summary of External APIs Used

| API | Purpose | Auth Method |
|-----|---------|-------------|
| Shopify Admin API | Orders, Products, Fulfillment | Access Token |
| Sameday API | AWB Generation, Tracking | Username/Password → JWT |
| FGO API | Invoice Generation | VAT Number + API Key → SHA-1 Hash |
| Brevo/SendGrid | Email Sending | API Key |

### Environment Variables (Convex Dashboard)

```
# Set these in Convex Dashboard → Settings → Environment Variables

# Email (for notifications)
BREVO_API_KEY=xxx
SENDGRID_API_KEY=xxx

# These are typically stored per-user in userConnections table:
# - Shopify credentials
# - Sameday credentials  
# - FGO credentials
```

---

## Migration Strategy

### Phase 1: Setup (Day 1)
1. Initialize Convex project: `npx convex init`
2. Create schema in `convex/schema.ts`
3. Set up authentication functions
4. Deploy to development

### Phase 2: Core Functions (Days 2-5)
1. Port order queries/mutations
2. Port Shopify sync action
3. Port AWB generation action
4. Port FGO invoice action
5. Port picking list functions

### Phase 3: Data Migration (Day 6)
1. Export data from Supabase (use `pg_dump` or Supabase export)
2. Transform to Convex format
3. Import via `npx convex import` or bulk mutation

### Phase 4: Frontend Migration (Days 7-10)
1. Replace Supabase client with Convex provider
2. Update AuthContext
3. Replace `supabase.from()` calls with `useQuery()`/`useMutation()`
4. Update edge function calls to `useAction()`

### Phase 5: Testing & Cutover (Days 11-14)
1. Run both backends in parallel
2. Verify data consistency
3. Test all workflows
4. Switch DNS/frontend to Convex

---

## Key Files to Port

### Priority 1 (Core)
- [ ] `supabase/functions/shopify-orders/index.ts` → `convex/shopify.ts`
- [ ] `supabase/functions/generate-awb/index.ts` → `convex/sameday.ts`
- [ ] `supabase/functions/fgo-invoice/index.ts` → `convex/fgo.ts`
- [ ] `src/contexts/AuthContext.tsx` → Update for Convex

### Priority 2 (Supporting)
- [ ] `supabase/functions/fetch-awb-status/index.ts`
- [ ] `supabase/functions/cancel-awb/index.ts`
- [ ] `supabase/functions/download-awb-pdf/index.ts`
- [ ] `supabase/functions/fulfill-shopify-order/index.ts`
- [ ] `supabase/functions/shopify-products/index.ts`

### Priority 3 (Nice to Have)
- [ ] `supabase/functions/shopify-oauth-init/index.ts`
- [ ] `supabase/functions/shopify-oauth-callback/index.ts`
- [ ] `supabase/functions/send-contact-email/index.ts`
- [ ] `supabase/functions/backup-order-notes/index.ts`

---

## Quick Reference

| Supabase | Convex |
|----------|--------|
| `supabase.from('table').select()` | `ctx.db.query("table").collect()` |
| `supabase.from('table').insert()` | `ctx.db.insert("table", data)` |
| `supabase.from('table').update()` | `ctx.db.patch(id, updates)` |
| `supabase.from('table').delete()` | `ctx.db.delete(id)` |
| `supabase.auth.getUser()` | Custom session validation |
| Edge Function | Action (for external APIs) |
| RLS policies | Query-level auth checks |
| `invoke('function-name')` | `useAction(api.file.action)` |

---

## Resources

- [Convex Docs](https://docs.convex.dev)
- [Convex + React](https://docs.convex.dev/client/react)
- [Convex Actions (External APIs)](https://docs.convex.dev/functions/actions)
- [Convex HTTP Endpoints](https://docs.convex.dev/functions/http-actions)
- [Convex Auth](https://docs.convex.dev/auth)
