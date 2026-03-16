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
    passwordHash: v.string(),
    isAdmin: v.optional(v.boolean()), // Admin flag
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_email", ["email"]),

  sessions: defineTable({
    userId: v.id("profiles"),
    token: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
    // Admin impersonation - when set, getUserFromToken returns this user instead
    impersonatingUserId: v.optional(v.id("profiles")),
  })
    .index("by_token", ["token"])
    .index("by_userId", ["userId"]),

  userSettings: defineTable({
    userId: v.id("profiles"),
    woocommerceUrl: v.optional(v.string()),
    consumerKey: v.optional(v.string()),
    consumerSecret: v.optional(v.string()),
    theme: v.optional(v.string()),
    // Stock management: "shopify" = use Shopify inventory, "local" = manage locally
    stockManagement: v.optional(v.string()),
    // Auto-deduct stock when orders come in (only applies to local stock)
    autoDeductStock: v.optional(v.boolean()),
    // Shared stock: link multiple stores to share one inventory pool
    sharedStockEnabled: v.optional(v.boolean()),
    // Array of shopDomains that share stock together
    linkedStoreIds: v.optional(v.array(v.string())),
    // Courier pickup address - used to filter Sameday exports in Courier Summary
    courierPickupAddress: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_courierPickupAddress", ["courierPickupAddress"]),

  userConnections: defineTable({
    userId: v.id("profiles"),
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
    .index("by_userId_type", ["userId", "connectionType"])
    .index("by_connectionType_isActive", ["connectionType", "isActive"]),

  userBillingRates: defineTable({
    userId: v.id("profiles"),
    pricePerOrder: v.number(),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"]),

  userPackagingRates: defineTable({
    userId: v.id("profiles"),
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
    userId: v.id("profiles"),
    shopifyOrderId: v.string(),
    orderNumber: v.string(),
    status: v.string(), // "on_hold", "ready", "cancelled"
    previousStatus: v.optional(v.string()), // For undo cancel
    fulfillmentStatus: v.optional(v.string()),
    paymentStatus: v.optional(v.string()),
    deliveryStatus: v.optional(v.string()), // Sameday delivery status
    deliveryStatusUpdatedAt: v.optional(v.number()),
    placedOn: v.string(), // Date string YYYY-MM-DD
    paymentMethod: v.string(),
    
    // Pricing
    totalPrice: v.number(),
    subtotalPrice: v.optional(v.number()),
    currency: v.optional(v.string()), // Currency code from Shopify (RON, HUF, BGN, etc.)
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
    awbGeneratedAt: v.optional(v.number()), // When AWB was generated
    invoiceNumber: v.optional(v.string()),
    invoiceSeries: v.optional(v.string()),
    invoiceStatus: v.optional(v.string()),
    invoiceCreatedAt: v.optional(v.number()), // When invoice was generated (epoch ms)
    invoicePaidAmount: v.optional(v.number()),
    invoicePaidDate: v.optional(v.string()),
    
    // Internal
    notes: v.optional(v.string()),
    activityHistory: v.optional(v.array(v.any())),
    shopDomain: v.optional(v.string()),
    
    // Customer notes & attributes from Shopify
    customerNote: v.optional(v.string()), // Free-form note from customer
    noteAttributes: v.optional(v.array(v.any())), // Cart attributes (e.g., "Deschidere colet")
    openPackageRequested: v.optional(v.boolean()), // Auto-detected from noteAttributes/note
    
    // Worked status (denormalized for performance)
    isWorked: v.optional(v.boolean()),
    workedAt: v.optional(v.string()),
    workedBy: v.optional(v.string()),
    workedByName: v.optional(v.string()),
    
    // Stock deduction status (denormalized for performance)
    stockDeducted: v.optional(v.boolean()),
    stockDeductedAt: v.optional(v.string()),
    
    // Print status (denormalized for performance)
    lastPrintedAt: v.optional(v.string()),
    lastPrintedBy: v.optional(v.string()),
    printedAwb: v.optional(v.boolean()),
    printedInvoice: v.optional(v.boolean()),
    
    // Return status (denormalized for performance)
    isReturned: v.optional(v.boolean()),
    returnedAt: v.optional(v.string()),
    returnId: v.optional(v.id("returns")), // Link to the return record
    
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_shopifyOrderId", ["userId", "shopifyOrderId"])
    .index("by_userId_orderNumber", ["userId", "orderNumber"])
    .index("by_userId_placedOn", ["userId", "placedOn"])
    .index("by_userId_fulfillmentStatus_placedOn", ["userId", "fulfillmentStatus", "placedOn"])
    .index("by_userId_isWorked_placedOn", ["userId", "isWorked", "placedOn"])
    .index("by_userId_status", ["userId", "status"])
    .index("by_userId_customerPhone", ["userId", "customerPhone"])
    .index("by_userId_shopDomain_placedOn", ["userId", "shopDomain", "placedOn"])
    .index("by_userId_shopDomain_fulfillmentStatus_placedOn", [
      "userId",
      "shopDomain",
      "fulfillmentStatus",
      "placedOn",
    ])
    .index("by_trackingNumber", ["trackingNumber"]),

  // Compact invoice aggregates updated when orders are marked/unmarked as worked.
  // Used by invoices.calculateInvoice to avoid reading full order documents.
  invoiceWorkedOrderSnapshots: defineTable({
    userId: v.id("profiles"),
    orderId: v.id("shopifyOrders"),
    placedOn: v.string(), // Date string YYYY-MM-DD
    skus: v.array(
      v.object({
        sku: v.string(),
        name: v.string(),
      })
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_orderId", ["orderId"])
    .index("by_userId", ["userId"])
    .index("by_userId_placedOn", ["userId", "placedOn"]),

  invoiceWorkedDailyTotals: defineTable({
    userId: v.id("profiles"),
    date: v.string(), // Date string YYYY-MM-DD
    workedOrders: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_date", ["userId", "date"]),

  invoiceWorkedDailySku: defineTable({
    userId: v.id("profiles"),
    date: v.string(), // Date string YYYY-MM-DD
    sku: v.string(),
    skuName: v.string(),
    orderCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_date", ["userId", "date"])
    .index("by_userId_date_sku", ["userId", "date", "sku"])
    .index("by_userId_sku_date", ["userId", "sku", "date"]),

  invoiceWorkedAggregationState: defineTable({
    userId: v.id("profiles"),
    initializedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"]),

  // ============================================
  // AWB & SHIPPING
  // ============================================

  awbTracking: defineTable({
    userId: v.id("profiles"),
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
    userId: v.id("profiles"),
    shopDomain: v.optional(v.string()), // Which store this picking list belongs to
    name: v.string(),
    status: v.string(), // "pending", "in_progress", "awb_generated", "completed"
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_status", ["userId", "status"])
    .index("by_userId_shopDomain", ["userId", "shopDomain"]),

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
    documentType: v.string(), // "awb", "invoice", "both"
    printedBy: v.string(),
    printedByName: v.optional(v.string()),
    printedAt: v.string(),
    createdAt: v.number(),
  })
    .index("by_orderId", ["orderId"])
    .index("by_pickingListId", ["pickingListId"])
    .index("by_orderId_documentType", ["orderId", "documentType"]),

  // Order "worked" status - marks order as fully processed
  orderWorkedStatus: defineTable({
    orderId: v.id("shopifyOrders"),
    isWorked: v.boolean(),
    workedBy: v.string(),
    workedByName: v.optional(v.string()),
    workedAt: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_orderId", ["orderId"]),

  // ============================================
  // INVENTORY & STOCK
  // ============================================

  // Enhanced SKU/Items Management
  skus: defineTable({
    userId: v.id("profiles"),
    sku: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    costPrice: v.optional(v.float64()),     // Cost per unit (RON)
    sellPrice: v.optional(v.float64()),     // Selling price (RON)
    currentStock: v.number(),               // Current stock balance
    lowStockThreshold: v.number(),          // Alert when stock falls below
    isActive: v.boolean(),
    imageUrl: v.optional(v.string()),
    barcode: v.optional(v.string()),
    weight: v.optional(v.float64()),        // Weight in kg
    shopifyProductId: v.optional(v.string()), // Link to Shopify product
    shopifyVariantId: v.optional(v.string()), // Link to Shopify variant
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_sku", ["userId", "sku"])
    .index("by_userId_category", ["userId", "category"])
    .index("by_userId_active", ["userId", "isActive"]),

  // Per-store overrides for SKUs (different name, price, currency per store)
  skuStoreOverrides: defineTable({
    userId: v.id("profiles"),
    sku: v.string(),                        // Links to skus.sku
    shopDomain: v.string(),                 // Which store this override is for
    displayName: v.optional(v.string()),    // Store-specific product name
    sellPrice: v.optional(v.float64()),     // Store-specific sell price
    costPrice: v.optional(v.float64()),     // Store-specific cost price
    currency: v.optional(v.string()),       // Currency for this store (RON, HUF, etc.)
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_sku", ["userId", "sku"])
    .index("by_userId_shopDomain", ["userId", "shopDomain"])
    .index("by_userId_sku_shopDomain", ["userId", "sku", "shopDomain"]),

  // Legacy items table for backward compatibility
  items: defineTable({
    userId: v.id("profiles"),
    sku: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_sku", ["userId", "sku"]),

  // Enhanced Daily Stock Records
  dailyStockRecords: defineTable({
    userId: v.id("profiles"),
    date: v.string(),                       // "YYYY-MM-DD"
    dayOfMonth: v.number(),                 // 1-31
    month: v.string(),                      // "YYYY-MM"
    sku: v.string(),
    outboundUnits: v.number(),
    returnUnits: v.number(),
    orders: v.number(),
    orderReturns: v.number(),
    revenue: v.float64(),
    notes: v.optional(v.string()),
    stockBalance: v.number(),               // End of day balance
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_date_sku", ["userId", "date", "sku"])
    .index("by_userId_month_sku", ["userId", "month", "sku"])
    .index("by_userId_sku", ["userId", "sku"]),

  // Legacy daily stock data
  dailyStockData: defineTable({
    userId: v.id("profiles"),
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
    userId: v.id("profiles"),
    sku: v.optional(v.string()),
    year: v.number(),
    month: v.number(),
    openingStock: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_year_month", ["userId", "year", "month"]),

  // Enhanced Inbound Stock
  inboundStock: defineTable({
    userId: v.id("profiles"),
    date: v.string(),
    sku: v.string(),
    quantity: v.number(),
    supplier: v.optional(v.string()),
    purchaseOrderNumber: v.optional(v.string()),
    unitCost: v.optional(v.float64()),
    totalCost: v.optional(v.float64()),
    notes: v.optional(v.string()),
    receivedBy: v.optional(v.string()),
    status: v.string(),                     // "pending", "received", "cancelled", "in_transfer", "transferred"
    // Transfer-specific fields
    transferDestination: v.optional(v.string()), // Where stock is being transferred to
    transferStartedAt: v.optional(v.number()),   // When transfer started
    transferReceivedAt: v.optional(v.number()),  // When transfer was received at destination
    transferStockDeductedAt: v.optional(v.number()), // When source stock was deducted for transfer
    transferType: v.optional(v.string()),        // "inbound_transfer" or "outbound_transfer"
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_date", ["userId", "date"])
    .index("by_userId_sku", ["userId", "sku"])
    .index("by_userId_status", ["userId", "status"]),

  // Legacy inbound records
  inboundRecords: defineTable({
    userId: v.id("profiles"),
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

  // ============================================
  // SALES & ANALYTICS
  // ============================================

  // Daily Sales Aggregates (computed from orders)
  // Global rows have no shopDomain; per-shop rows have shopDomain set.
  dailySales: defineTable({
    userId: v.id("profiles"),
    date: v.string(),                       // "YYYY-MM-DD"
    shopDomain: v.optional(v.string()),     // undefined = global aggregate, set = per-shop
    totalOrders: v.number(),
    totalRevenue: v.float64(),              // RON
    averageOrderValue: v.float64(),
    totalUnits: v.number(),
    returnOrders: v.number(),
    returnRevenue: v.float64(),
    netRevenue: v.float64(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_date", ["userId", "date"])
    .index("by_userId_shopDomain_date", ["userId", "shopDomain", "date"]),

  // SKU Period Metrics (cached aggregates)
  skuMetrics: defineTable({
    userId: v.id("profiles"),
    period: v.string(),                     // "2026" or "2026-01" or "2026-Q1"
    sku: v.string(),
    currentStock: v.number(),
    totalOrders: v.number(),
    totalUnits: v.number(),
    orderReturns: v.number(),
    returnUnits: v.number(),
    totalRevenue: v.float64(),
    returnRate: v.float64(),                // Percentage
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_period", ["userId", "period"])
    .index("by_userId_period_sku", ["userId", "period", "sku"]),

  stockTransfers: defineTable({
    userId: v.id("profiles"),
    sku: v.string(),
    quantity: v.number(),
    destination: v.string(),
    notes: v.optional(v.string()),
    transferredAt: v.string(),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"]),

  productBundles: defineTable({
    userId: v.id("profiles"),
    bundleSku: v.string(),
    bundleName: v.optional(v.string()),
    componentSku1: v.string(),
    componentSku2: v.string(),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_bundleSku", ["bundleSku"])
    .index("by_userId_bundleSku", ["userId", "bundleSku"]),

  skuServiceMappings: defineTable({
    userId: v.id("profiles"),
    sku: v.string(),
    serviceName: v.string(),
    description: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_sku", ["userId", "sku"]),

  snapshotCache: defineTable({
    key: v.string(),
    data: v.any(),
    updatedAt: v.number(),
    expiresAt: v.number(),
  }).index("by_key", ["key"]),

  // ============================================
  // WAREHOUSE
  // ============================================

  warehouseLocations: defineTable({
    userId: v.id("profiles"),
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
    userId: v.id("profiles"),
    locationId: v.id("warehouseLocations"),
    sku: v.string(),
    quantity: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_locationId", ["locationId"])
    .index("by_userId_sku", ["userId", "sku"]),

  warehouseMovements: defineTable({
    userId: v.id("profiles"),
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
    .index("by_userId_sku", ["userId", "sku"]),

  // ============================================
  // RETURNS
  // ============================================

  returns: defineTable({
    userId: v.id("profiles"),
    awbNumber: v.string(),
    shopifyOrderId: v.optional(v.string()),
    shopDomain: v.optional(v.string()),
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
    .index("by_userId_returnDate", ["userId", "returnDate"])
    .index("by_userId_shopDomain_returnDate", ["userId", "shopDomain", "returnDate"])
    .index("by_awbNumber", ["awbNumber"]),

  // ============================================
  // COURIER & REVENUE
  // ============================================

  courierRevenue: defineTable({
    userId: v.id("profiles"),
    recordDate: v.string(),
    address: v.string(),
    totalCodAmount: v.number(),
    currency: v.optional(v.string()), // e.g. RON, HUF
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_recordDate", ["recordDate"])
    .index("by_userId_recordDate", ["userId", "recordDate"]),

  // Stored Excel files from courier summary webhook uploads
  courierSummaryFiles: defineTable({
    storageId: v.id("_storage"),
    fileName: v.string(),
    fileSize: v.number(), // bytes
    date: v.string(), // date the file was processed for (YYYY-MM-DD)
    uploadedAt: v.number(),
    processedSuccessfully: v.boolean(),
    totalRows: v.optional(v.number()),
    addressGroups: v.optional(v.number()),
    grandTotal: v.optional(v.number()),
  })
    .index("by_date", ["date"])
    .index("by_uploadedAt", ["uploadedAt"]),

  // ============================================
  // GEOLOCATION (Sameday)
  // ============================================

  samedayCounties: defineTable({
    countyId: v.string(), // Sameday's county ID
    name: v.string(),
    normalizedName: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_normalizedName", ["normalizedName"]),

  samedayCities: defineTable({
    cityId: v.string(), // Sameday's city ID
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
    userId: v.id("profiles"),
    orderId: v.optional(v.id("shopifyOrders")),
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

  // User's Shopify App configuration
  shopifyAppConfig: defineTable({
    userId: v.id("profiles"),
    clientId: v.string(),
    clientSecret: v.string(),
    appName: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"]),

  shopifyOauthStates: defineTable({
    userId: v.id("profiles"),
    shopDomain: v.string(),
    state: v.string(),
    nonce: v.optional(v.string()),
    redirectUri: v.optional(v.string()),
    // Store credentials for this OAuth flow (per-store app)
    clientId: v.optional(v.string()),
    clientSecret: v.optional(v.string()),
    appName: v.optional(v.string()),
    expiresAt: v.string(),
    createdAt: v.number(),
  })
    .index("by_state", ["state"])
    .index("by_userId", ["userId"]),

  shopifyStoreConnections: defineTable({
    userId: v.id("profiles"),
    shopDomain: v.string(),
    shopUrl: v.string(),
    accessToken: v.string(),
    scopes: v.optional(v.string()),
    connectionType: v.string(),
    connectionName: v.optional(v.string()),
    alias: v.optional(v.string()), // User-friendly name like "Site 1" or "Brand Name"
    associatedUser: v.optional(v.any()),
    // Per-store Shopify app credentials
    clientId: v.optional(v.string()),
    clientSecret: v.optional(v.string()),
    appName: v.optional(v.string()),
    currency: v.optional(v.string()), // Store's base currency (RON, HUF, EUR, etc.)
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

  errorLogs: defineTable({
    message: v.string(),
    stack: v.optional(v.string()),
    componentStack: v.optional(v.string()),
    url: v.optional(v.string()),
    userId: v.optional(v.id("profiles")),
    createdAt: v.number(),
  }).index("by_createdAt", ["createdAt"]),

  feedback: defineTable({
    userId: v.optional(v.id("profiles")),
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
    userId: v.id("profiles"),
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
