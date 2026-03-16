# VNT Dash Logistics - Product Requirements Document

**Version**: 1.0  
**Last Updated**: January 2026  
**Target Platform**: Convex + React + TypeScript

---

## Executive Summary

VNT Dash Logistics is a multi-tenant warehouse and order fulfillment management system designed for e-commerce businesses in Romania. It integrates with Shopify for order management, Sameday courier for shipping/AWB generation, and FGO for automated invoicing.

The system handles the complete order lifecycle from Shopify order import → inventory management → picking list creation → AWB generation → invoice creation → delivery tracking.

---

## Table of Contents

1. [Product Overview](#product-overview)
2. [User Roles & Permissions](#user-roles--permissions)
3. [Feature Specifications](#feature-specifications)
4. [Data Models](#data-models)
5. [External Integrations](#external-integrations)
6. [User Flows](#user-flows)
7. [Business Rules](#business-rules)
8. [API Specifications](#api-specifications)
9. [UI/UX Requirements](#uiux-requirements)
10. [Non-Functional Requirements](#non-functional-requirements)

---

## Product Overview

### Purpose
Streamline e-commerce order fulfillment for Romanian businesses by providing:
- Centralized order management from multiple Shopify stores
- Automated AWB (shipping label) generation via Sameday courier
- Automated invoice generation via FGO accounting software
- Inventory tracking and stock management
- Warehouse location management
- Returns processing
- Picking list workflow for warehouse staff

### Target Users
1. **E-commerce Business Owners** - View orders, track revenue, manage inventory
2. **Warehouse Staff** - Process picking lists, pack orders, handle returns
3. **Administrators** - Manage multiple client accounts, view cross-client data

### Key Value Propositions
- Single dashboard for all order fulfillment operations
- One-click AWB generation for batches of orders
- Automatic invoice creation synced with orders
- Real-time delivery status tracking
- Stock level monitoring with low-stock alerts
- Multi-store Shopify support

---

## User Roles & Permissions

### Role Hierarchy

```
Super Admin (Platform Owner)
    └── Can switch between any user's data view
    └── Access to all features across all accounts
    └── Manage platform-wide settings

Admin (Business Owner)
    └── Full access to own account data
    └── Manage connections (Shopify, Sameday, FGO)
    └── Create/manage staff users
    └── View all reports and analytics

Staff (Warehouse Worker)
    └── View and process picking lists
    └── Mark orders as worked/packed
    └── Scan barcodes for order lookup
    └── Limited to operational features
```

### Permission Matrix

| Feature | Super Admin | Admin | Staff |
|---------|-------------|-------|-------|
| View Orders | ✅ (all users) | ✅ (own) | ✅ (own) |
| Edit Orders | ✅ | ✅ | ❌ |
| Cancel Orders | ✅ | ✅ | ❌ |
| Generate AWB | ✅ | ✅ | ❌ |
| Create Invoices | ✅ | ✅ | ❌ |
| Manage Picking Lists | ✅ | ✅ | ✅ (view/process) |
| Manage Inventory | ✅ | ✅ | ❌ |
| Manage Connections | ✅ | ✅ | ❌ |
| View Reports | ✅ | ✅ | ❌ |
| Switch User Context | ✅ | ❌ | ❌ |

---

## Feature Specifications

### F1: Authentication & User Management

#### F1.1: User Registration & Login
- Email/password authentication
- Session token stored in localStorage
- Session expiry: 30 days
- "Remember me" functionality

#### F1.2: User Profile
- Fields: email, name, created date
- Profile settings page
- Password change functionality

#### F1.3: Super Admin User Switching
- Super admin can impersonate any user
- When switched, all data queries filter by impersonated user's ID
- Visual indicator showing "Viewing as: [User Name]"
- One-click "Switch Back" to own account

---

### F2: Connections Management

Users can connect multiple external services. Each connection stores credentials securely.

#### F2.1: Shopify Connection
**Connection Types:**
1. **OAuth Connection** (Preferred)
   - Initiates Shopify OAuth flow
   - Stores: shop_domain, access_token, scopes
   
2. **Legacy API Connection**
   - Manual entry of shop URL and access token
   - Stores: shop_url, access_token

**Fields Stored:**
```typescript
{
  connectionType: "shopify" | "shopify_oauth",
  connectionName: string,
  credentials: {
    shop_url: string,
    shop_domain: string,
    access_token: string,
    scopes?: string,
  },
  isActive: boolean,
  isPrimary: boolean,
}
```

#### F2.2: Sameday Courier Connection
Romanian courier service for AWB generation.

**Fields Stored:**
```typescript
{
  connectionType: "sameday",
  connectionName: string,
  credentials: {
    username: string,
    password: string,
    api_url: string,  // Production or sandbox URL
    client_id?: string,
    pickup_location: string,      // Pickup point ID
    sender_location_id?: string,
    contact_person_id: string,    // Contact person at pickup
  },
  authToken?: string,             // Cached JWT token
  authTokenExpiresAt?: string,    // Token expiry
  isActive: boolean,
}
```

**API URLs:**
- Production: `https://api.sameday.ro`
- Sandbox: `https://sameday-api.demo.zitec.com`

#### F2.3: FGO Invoice Connection
Romanian accounting/invoicing software.

**Fields Stored:**
```typescript
{
  connectionType: "fgo",
  connectionName: string,
  credentials: {
    vatNumber: string,            // CUI/CIF with RO prefix
    apiKey: string,               // Private key from FGO
    platformUrl: string,          // Registered callback URL
    invoiceSeries: string,        // e.g., "FV"
    vatTaxPercentage: number,     // e.g., 21
    invoiceType: string,          // e.g., "Factura"
    measureUnit: string,          // e.g., "buc"
    shipmentServiceName: string,  // e.g., "Transport"
    shipmentMeasureUnit: string,
  },
  isActive: boolean,
}
```

---

### F3: Order Management

#### F3.1: Order Sync from Shopify
**Trigger:** Manual sync button or scheduled (future)

**Process:**
1. Fetch orders from Shopify API (paginated, up to 6000 orders)
2. Transform Shopify order format to internal format
3. Upsert orders (update existing, insert new)
4. Preserve local-only fields (notes, activity_history, custom status)

**Order Fields:**
```typescript
{
  // Identifiers
  shopifyOrderId: string,         // Shopify's order ID
  orderNumber: string,            // Display number (e.g., "#1234")
  
  // Status
  status: "on_hold" | "ready" | "cancelled",
  fulfillmentStatus: "unfulfilled" | "partial" | "fulfilled",
  paymentStatus: "pending" | "paid" | "refunded",
  
  // Dates
  placedOn: string,               // YYYY-MM-DD
  
  // Customer
  customerName: string,
  customerEmail: string,
  customerPhone?: string,
  
  // Addresses
  shippingAddress: {
    line1: string,
    line2?: string,
    city: string,
    state: string,                // County in Romania
    zipCode: string,
    country: string,
  },
  billingAddress: { /* same structure */ },
  
  // Pricing (all in RON)
  totalPrice: number,
  subtotalPrice: number,
  totalShipping: number,
  totalTax: number,
  totalDiscounts: number,
  
  // Line Items
  items: Array<{
    name: string,
    sku: string,
    quantity: number,
    price: number,                // Unit price with VAT
    variantTitle?: string,
    variantId?: string,
    productId?: string,
  }>,
  
  // Fulfillment
  trackingNumber?: string,        // AWB number
  
  // Invoicing
  invoiceNumber?: string,
  invoiceSeries?: string,
  invoiceStatus?: "unpaid" | "paid" | "storno",
  
  // Internal
  notes?: string,                 // User's private notes
  activityHistory: Array<{
    timestamp: string,
    action: string,
    description: string,
    userId?: string,
    details?: object,
  }>,
  
  paymentMethod: string,          // e.g., "COD", "Card"
  shopDomain?: string,            // Which Shopify store
}
```

#### F3.2: Order List View
**Features:**
- Paginated table (25/50/100 per page)
- Sortable columns
- Column visibility toggle (user preference, persisted)
- Multi-select for batch actions

**Filters:**
- Date range picker
- Fulfillment status (unfulfilled, fulfilled, partial)
- Payment status (paid, pending)
- Delivery status (from AWB tracking)
- Search by: order number, customer name, phone, AWB, SKU, product name
- "Spam" filter (duplicate addresses/phones)
- "In Picking List" filter

**Columns (Configurable):**
1. Checkbox (selection)
2. Order Number
3. Notes (inline editable)
4. Customer Name
5. Phone (inline editable)
6. Shipping Address
7. Picking Status (In List / Not Picked)
8. Fulfillment Status
9. Payment Status
10. AWB Number
11. Delivery Status (live from Sameday)
12. Invoice (number + status)
13. Items Count
14. Placed On (date)
15. Payment Method
16. Product Names
17. Variations
18. SKUs
19. Subtotal
20. Shipping Cost
21. Total Price

#### F3.3: Order Actions
**Single Order:**
- View details (modal)
- Edit order (phone, address, items)
- Add/Edit notes
- Cancel order
- Add to picking list
- Remove from picking list
- Generate AWB
- Create invoice
- View/Download AWB PDF
- View/Download invoice PDF
- Check delivery status

**Batch Actions (Multi-Select):**
- Add selected to picking list
- Generate AWBs for selected
- Create invoices for selected
- Export to CSV

#### F3.4: Order Details Modal
**Sections:**
1. **Header:** Order number, status badges, action buttons
2. **Customer Info:** Name, email, phone
3. **Addresses:** Shipping and billing (editable)
4. **Line Items:** Product table with SKUs, quantities, prices
5. **Pricing Summary:** Subtotal, shipping, discounts, tax, total
6. **AWB Info:** Tracking number, current status, status timeline
7. **Invoice Info:** Number, series, status, link
8. **Activity Timeline:** All actions taken on order

---

### F4: Picking Lists

Picking lists group orders for warehouse processing.

#### F4.1: Picking List Creation
**Methods:**
1. Create new list from Orders page (select orders → "Add to Picking List")
2. Create empty list from Picking Lists page

**Fields:**
```typescript
{
  name: string,                   // e.g., "Picking List 2026-01-24 AM"
  status: "pending" | "in_progress" | "awb_generated" | "completed",
  orders: Array<Order>,           // Via junction table
}
```

#### F4.2: Picking List View
**List Page:**
- Table of all picking lists
- Columns: Name, Status, Order Count, Created Date, Actions
- Quick stats: Orders ready, AWBs generated, Invoices created

**Detail Page:**
- Header with list name, status, action buttons
- Statistics cards:
  - Total Orders
  - Total Revenue
  - Orders Worked (packed)
  - AWBs Generated
  - Invoices Created
- Order table (same as Orders page, filtered to list)
- Aggregated product list (grouped by SKU with total quantities)

#### F4.3: Picking List Actions
**Header Actions:**
- Print Picking List (formatted PDF)
- Generate All AWBs (batch)
- Create All Invoices (batch)
- Mark All as Worked
- Export Products CSV

**Per-Order Actions:**
- Mark as Worked (checkbox)
- Remove from list
- Generate AWB
- Create Invoice

#### F4.4: Generate Documents Modal
When generating AWBs/Invoices for multiple orders:

**Process:**
1. Show modal with order list
2. Validate each order (phone required, address complete)
3. Show validation errors inline
4. User can fix issues or skip problematic orders
5. Progress indicator during generation
6. Show results (success/failure per order)
7. Option to print all AWBs

**Invoice Options:**
- Include shipping in invoice (checkbox, default: true)
- Use order date as invoice date (checkbox, default: false)

---

### F5: AWB Generation (Sameday Integration)

#### F5.1: AWB Creation Flow
1. **Authenticate** with Sameday API (cache token for 24h)
2. **Resolve Geolocation:**
   - County name → County ID (via `/api/geolocation/county`)
   - City name + Postal code → City ID (via `/api/geolocation/city`)
3. **Build AWB Request:**
   ```typescript
   {
     packageType: 0,              // Parcel
     packageWeight: 1,            // Always 1kg
     packageNumber: 1,            // Single package
     insuredValue: 0,             // No insurance
     cashOnDelivery: number,      // Order total (COD amount)
     awbPayment: 1,               // Sender pays AWB
     thirdPartyPickup: 0,
     pickupPoint: string,         // From connection settings
     contactPerson: string,       // From connection settings
     service: 7,                  // Standard delivery
     awbRecipient: {
       name: string,
       phoneNumber: string,
       address: string,           // Full street address
       postalCode: string,
       county: string,            // County ID
       city: string,              // City ID
       personType: 0,             // Individual
     },
     parcels: [{ weight: 1, width: 5, length: 10, height: 1 }],
     observation: string,         // "{order_number} x {sku} x {qty} x {name} x {variant}"
   }
   ```
4. **Submit** to `/api/awb`
5. **Store** AWB tracking record
6. **Update** order with tracking number
7. **Optionally** fulfill in Shopify

#### F5.2: AWB Tracking
**Status Check:**
- API: `/api/awb/{awbNumber}/status`
- Returns: Array of status events with timestamps

**Status Types:**
- Created
- In Transit
- Out for Delivery
- Delivered
- Returned
- Cancelled

**AWB Tracking Record:**
```typescript
{
  awbNumber: string,
  orderId: string,
  orderNumber: string,
  customerName: string,
  shippingAddress: object,
  codAmount: number,
  currentStatus: string,
  statusHistory: Array<{
    status: string,
    timestamp: string,
    details?: string,
  }>,
  samedayResponse: object,        // Raw API response
}
```

#### F5.3: AWB PDF Download
- API: `/api/awb/{awbNumber}/pdf`
- Returns PDF binary
- Options: Format (A4, A6, label)

#### F5.4: AWB Cancellation
- API: DELETE `/api/awb/{awbNumber}`
- Only possible before pickup
- Updates local tracking record

---

### F6: Invoice Generation (FGO Integration)

#### F6.1: Invoice Creation Flow
1. **Check** if invoice already exists for order (prevent duplicates)
2. **Build** invoice request:
   - Calculate hash: SHA-1(`{VAT_NUMBER}{API_KEY}{CUSTOMER_NAME}`)
   - Prepare line items (prices WITHOUT VAT)
   - VAT calculation: `priceWithVAT / 1.21 = priceWithoutVAT`
3. **Submit** to FGO API (`/v1/factura/emitere`)
4. **Store** invoice number on order
5. **Log** activity

**Invoice Structure:**
```typescript
{
  CodUnic: string,                // VAT number
  Hash: string,                   // SHA-1 hash
  Serie: string,                  // Invoice series (e.g., "FV")
  TipFactura: "Factura",
  Valuta: "RON",
  DataEmitere: "YYYY-MM-DD",
  PlatformaUrl: string,           // Callback URL
  
  Client: {
    Denumire: string,             // Customer name
    Email: string,
    Tara: "RO",
    Judet: string,                // County
    Localitate: string,           // City
    Adresa: string,               // Street
    Tip: "PF",                    // Person type (PF=individual)
  },
  
  Continut: Array<{               // Line items
    Denumire: string,             // Product name
    UM: string,                   // Unit of measure
    NrProduse: number,            // Quantity
    PretUnitar: number,           // Unit price WITHOUT VAT
    CotaTVA: number,              // VAT percentage (e.g., 21)
  }>,
  
  IdExtern: string,               // Shopify order ID (prevents duplicates)
  Text: string,                   // Notes (e.g., "Comanda: #1234")
}
```

#### F6.2: Invoice Storno (Cancellation)
- API: `/v1/factura/stornare`
- Hash: SHA-1(`{VAT_NUMBER}{API_KEY}{INVOICE_NUMBER}`)
- Updates order invoice_status to "storno"

#### F6.3: Invoice PDF
- API: `/v1/factura/print`
- Returns PDF URL from FGO

---

### F7: Inventory Management

#### F7.1: Items (SKU Master)
**Fields:**
```typescript
{
  sku: string,
  name: string,
  description?: string,
  category?: string,
}
```

**Features:**
- CRUD operations
- SKU validation (format rules)
- Bulk import from CSV

#### F7.2: Daily Stock Data
Track daily movements per SKU:
```typescript
{
  sku: string,
  date: "YYYY-MM-DD",
  orders: number,           // Order count
  outboundUnits: number,    // Units shipped
  returns: number,          // Units returned
  orderReturns: number,     // Full order returns
  revenue: number,          // Revenue generated
  notes?: string,
}
```

**Auto-Calculated from Orders:**
- When orders sync, aggregate by date/SKU
- Manual adjustments allowed

#### F7.3: Monthly Opening Stock
**Fields:**
```typescript
{
  sku?: string,             // null = all SKUs combined
  year: number,
  month: number,
  openingStock: number,
}
```

**Stock Calculation:**
```
Current Stock = Opening Stock + Inbound - Outbound + Returns - Transfers
```

#### F7.4: Inbound Records
Track stock arriving at warehouse:
```typescript
{
  sku: string,
  date: string,
  units: number,
  notes?: string,
  completed: boolean,       // Received and verified
}
```

#### F7.5: Stock Transfers
Track stock moved to other locations:
```typescript
{
  sku: string,
  quantity: number,
  destination: string,      // e.g., "Amazon FBA", "Store #2"
  transferredAt: string,
  notes?: string,
}
```

#### F7.6: Product Bundles
SKUs that consist of multiple component SKUs:
```typescript
{
  bundleSku: string,        // The bundle's SKU
  bundleName?: string,
  componentSku1: string,
  componentSku2: string,
  isActive: boolean,
}
```

When a bundle is sold, deduct stock from both components.

#### F7.7: Low Stock Alerts
- Configure threshold per SKU
- When stock falls below threshold:
  - Show visual warning in dashboard
  - Optional: Send email notification

---

### F8: Warehouse Management

#### F8.1: Warehouse Locations
Physical storage locations:
```typescript
{
  locationCode: string,     // e.g., "A-01-1" (Zone-Rack-Level)
  zone: string,             // e.g., "A"
  rack: string,             // e.g., "01"
  level: string,            // e.g., "1"
  capacity: number,         // Max units
  isReturnsZone: boolean,   // For returns processing
}
```

#### F8.2: Warehouse Stock
Stock quantity per location per SKU:
```typescript
{
  locationId: string,
  sku: string,
  quantity: number,
}
```

#### F8.3: Warehouse Movements
Track all stock movements:
```typescript
{
  sku: string,
  quantity: number,
  movementType: "inbound" | "outbound" | "transfer" | "adjustment",
  fromLocationId?: string,
  toLocationId?: string,
  performedBy: string,      // User who did it
  notes?: string,
}
```

#### F8.4: Warehouse Map Visualization
Visual grid showing:
- Location codes as cells
- Color coding by stock level (empty, low, normal, full)
- Click to view/edit stock at location
- Filter by SKU to find where stock is located

---

### F9: Returns Management

#### F9.1: Return Records
```typescript
{
  awbNumber: string,        // Original shipping AWB
  shopifyOrderId?: string,
  orderNumber?: string,
  customerName?: string,
  customerEmail?: string,
  returnDate: string,
  returnReason?: string,
  returnStatus: "pending" | "received" | "processed" | "restocked",
  returnedItems?: Array<{
    sku: string,
    quantity: number,
    condition: "good" | "damaged" | "defective",
  }>,
  notes?: string,
}
```

#### F9.2: Return Processing Workflow
1. AWB status shows "Returned"
2. Create return record (auto or manual)
3. Receive package at warehouse
4. Inspect items, record condition
5. Restock good items (update warehouse stock)
6. Mark return as processed

---

### F10: Dashboard & Analytics

#### F10.1: Main Dashboard
**Cards:**
1. Orders Today (count + revenue)
2. Orders This Week
3. Orders This Month
4. Pending Orders (unfulfilled)
5. Low Stock Alerts
6. AWBs Pending Pickup

**Charts:**
1. Daily Sales (last 30 days) - Line/Bar chart
2. Orders by Status (pie chart)
3. Revenue by Payment Method

#### F10.2: Courier Summary
- COD amounts collected per date
- Address visited
- Notes per collection

#### F10.3: Stock Orders Report
Monthly view:
- Opening stock per SKU
- Inbound per SKU
- Outbound per SKU
- Returns per SKU
- Closing stock per SKU

---

### F11: Miscellaneous Features

#### F11.1: Barcode Scanner
- Camera-based barcode scanning
- Scan AWB to find order
- Scan SKU to find product
- Works on picking list detail page

#### F11.2: SKU-Service Mappings
Map certain SKUs to specific Sameday services:
```typescript
{
  sku: string,
  serviceName: string,      // Sameday service name
  description?: string,
  isActive: boolean,
}
```

#### F11.3: Order Notes Backup
Periodically backup order notes/activity history:
```typescript
{
  orderId: string,
  shopifyOrderId: string,
  orderNumber: string,
  notes: string,
  activityHistory: array,
  snapshotDate: string,
}
```

Restore functionality available.

#### F11.4: Feedback System
Users can submit feedback:
```typescript
{
  name?: string,
  email?: string,
  message: string,
  category?: string,
  rating?: number,
  status: "new" | "reviewed" | "resolved",
}
```

---

## Data Models

### Entity Relationship Diagram (Simplified)

```
┌─────────────────┐       ┌─────────────────┐
│     profiles    │       │ userConnections │
│─────────────────│       │─────────────────│
│ _id             │──┐    │ _id             │
│ userId          │  │    │ userId ─────────┼──┐
│ email           │  │    │ connectionType  │  │
│ name            │  │    │ credentials     │  │
│ passwordHash    │  │    │ isActive        │  │
└─────────────────┘  │    └─────────────────┘  │
                     │                          │
                     │    ┌─────────────────┐   │
                     └───►│  shopifyOrders  │◄──┘
                          │─────────────────│
                          │ _id             │
                     ┌────│ userId          │
                     │    │ shopifyOrderId  │
                     │    │ orderNumber     │
                     │    │ status          │
                     │    │ items[]         │
                     │    │ trackingNumber ─┼──────┐
                     │    │ invoiceNumber   │      │
                     │    └─────────────────┘      │
                     │                              │
                     │    ┌─────────────────┐      │
                     │    │  pickingLists   │      │
                     │    │─────────────────│      │
                     │    │ _id             │      │
                     ├───►│ userId          │      │
                     │    │ name            │      │
                     │    │ status          │      │
                     │    └────────┬────────┘      │
                     │             │               │
                     │    ┌────────▼────────┐      │
                     │    │pickingListItems │      │
                     │    │─────────────────│      │
                     │    │ pickingListId   │      │
                     └────│ orderId         │      │
                          └─────────────────┘      │
                                                   │
                          ┌─────────────────┐      │
                          │   awbTracking   │◄─────┘
                          │─────────────────│
                          │ _id             │
                          │ awbNumber       │
                          │ orderId         │
                          │ currentStatus   │
                          │ statusHistory[] │
                          └─────────────────┘
```

### All Tables Summary

| Table | Description | Key Indexes |
|-------|-------------|-------------|
| profiles | User accounts | by_userId, by_email |
| sessions | Auth sessions | by_token, by_userId |
| userConnections | External service connections | by_userId, by_userId_type |
| userSettings | User preferences | by_userId |
| userBillingRates | Per-order pricing | by_userId |
| userPackagingRates | Packaging costs | by_userId |
| shopifyOrders | Orders from Shopify | by_userId, by_shopifyOrderId, by_trackingNumber |
| awbTracking | AWB/shipping records | by_awbNumber, by_orderId |
| pickingLists | Order groupings | by_userId, by_status |
| pickingListItems | Order-to-list junction | by_pickingListId, by_orderId |
| orderWorkStatus | Work tracking | by_orderId |
| orderPrintLogs | Print history | by_orderId |
| items | SKU master | by_userId, by_sku |
| dailyStockData | Daily stock movements | by_userId_date, by_userId_sku |
| monthlyOpeningStock | Opening inventory | by_userId_year_month |
| inboundRecords | Stock arrivals | by_userId |
| stockTransfers | Stock movements out | by_userId |
| productBundles | Bundle definitions | by_bundleSku |
| skuServiceMappings | SKU to courier service | by_sku |
| warehouseLocations | Physical locations | by_locationCode |
| warehouseStock | Stock per location | by_locationId, by_sku |
| warehouseMovements | Movement history | by_sku |
| returns | Return records | by_awbNumber |
| courierRevenue | COD collections | by_recordDate |
| samedayCounties | Geo lookup cache | by_normalizedName |
| samedayCities | Geo lookup cache | by_countyId |
| shopifyOauthStates | OAuth flow state | by_state |
| shopifyStoreConnections | Multi-store connections | by_userId, by_shopDomain |
| jobQueue | Async job processing | by_status |
| jobLogs | Job execution logs | by_jobId |
| feedback | User feedback | - |
| orderNotesBackup | Notes snapshots | by_orderId |
| packagingTypes | Packaging definitions | - |

---

## External Integrations

### Shopify Admin API
**Base URL:** `https://{shop}.myshopify.com/admin/api/2023-10`

**Authentication:** `X-Shopify-Access-Token` header

**Endpoints Used:**
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/orders.json` | GET | Fetch orders |
| `/orders/{id}.json` | GET | Get single order |
| `/orders/{id}.json` | PUT | Update order |
| `/orders/{id}/fulfillments.json` | POST | Create fulfillment |
| `/products.json` | GET | Fetch products |
| `/products/{id}/variants.json` | GET | Get variants |

**OAuth Flow:**
1. Redirect to Shopify authorize URL
2. User approves permissions
3. Shopify redirects back with code
4. Exchange code for access token
5. Store token in userConnections

### Sameday API
**Base URL:** `https://api.sameday.ro` (production) or `https://sameday-api.demo.zitec.com` (sandbox)

**Authentication:** 
1. POST `/api/authenticate` with username/password → JWT token
2. All subsequent requests: `X-AUTH-TOKEN` header

**Endpoints Used:**
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/authenticate` | POST | Get JWT token |
| `/api/geolocation/county` | GET | Find county by name |
| `/api/geolocation/city` | GET | Find city by name/postal |
| `/api/pickup-points` | GET | List pickup locations |
| `/api/awb` | POST | Create AWB |
| `/api/awb/{number}` | GET | Get AWB details |
| `/api/awb/{number}/status` | GET | Get status history |
| `/api/awb/{number}/pdf` | GET | Download PDF |
| `/api/awb/{number}` | DELETE | Cancel AWB |

### FGO API
**Base URL:** `https://api.fgo.ro/v1`

**Authentication:** Hash-based (SHA-1)
- Different hash formulas for different endpoints
- Hash included in request body

**Endpoints Used:**
| Endpoint | Method | Purpose | Hash Formula |
|----------|--------|---------|--------------|
| `/factura/emitere` | POST | Create invoice | SHA1(VAT + Key + CustomerName) |
| `/factura/print` | POST | Get PDF URL | SHA1(VAT + Key + InvoiceNumber) |
| `/factura/stornare` | POST | Cancel invoice | SHA1(VAT + Key + InvoiceNumber) |
| `/factura/list` | GET | List invoices | SHA1(VAT + Key) |

**Request Format:** `application/x-www-form-urlencoded`

---

## User Flows

### UF1: New User Onboarding
```
1. Sign Up (email, password, name)
2. Redirect to Connections page
3. Connect Shopify store (OAuth or manual)
4. Connect Sameday (credentials)
5. Connect FGO (credentials)
6. Sync orders from Shopify
7. Ready to process orders
```

### UF2: Daily Order Processing
```
1. Open Orders page
2. Filter: Fulfillment = Unfulfilled, Status = Ready
3. Select orders for today's batch
4. Click "Add to Picking List" → Create new list
5. Go to Picking List detail page
6. Print picking list (paper for warehouse)
7. Warehouse staff picks orders
8. Return to app, mark orders as "Worked"
9. Click "Generate All AWBs"
   → Modal shows progress
   → Fix any validation errors
   → All AWBs created
10. Click "Create All Invoices"
    → Modal shows progress
    → All invoices created
11. Print AWB labels
12. Hand packages to Sameday courier
13. Update picking list status to "Completed"
```

### UF3: Handle Failed AWB
```
1. AWB generation fails (invalid address, postal code)
2. Error shown in modal
3. Click "Fix" on order
4. Order edit modal opens
5. Correct phone number or address
6. Use "Map Postal Code" feature to get correct code
7. Save changes
8. Retry AWB generation
```

### UF4: Process Return
```
1. Sameday marks AWB as "Returned"
2. App shows in delivery status
3. Go to Returns Management page
4. Create return record for AWB
5. When package arrives:
   a. Mark as "Received"
   b. Inspect items
   c. Record condition per item
   d. Restock good items
   e. Mark as "Processed"
```

### UF5: Super Admin User Switch
```
1. Super admin logs in
2. Open user switcher (header dropdown)
3. Search for client by email/name
4. Click "Switch to User"
5. All pages now show that user's data
6. Perform operations on their behalf
7. Click "Switch Back" when done
```

---

## Business Rules

### BR1: Order Status Logic
```
IF payment_status = "paid" THEN status = "ready"
ELSE status = "on_hold"

IF user manually cancels THEN status = "cancelled"
```

### BR2: AWB Generation Requirements
- Phone number is REQUIRED (validation error if missing)
- Address line 1 is REQUIRED
- Postal code is REQUIRED
- County must map to valid Sameday county ID
- City must map to valid Sameday city ID

### BR3: Invoice Duplicate Prevention
- Use `IdExtern = shopifyOrderId` in FGO request
- FGO returns 409 if IdExtern already used
- If invoice exists with same IdExtern, treat as success
- After storno, append timestamp to IdExtern for re-creation

### BR4: Stock Calculations
```
currentStock = 
  monthlyOpeningStock
  + SUM(inboundRecords.units)
  - SUM(dailyStockData.outboundUnits)
  + SUM(dailyStockData.returns)
  - SUM(stockTransfers.quantity)
```

### BR5: Bundle Stock Deduction
When order contains bundle SKU:
- Find bundle definition
- Deduct 1 unit from each component SKU

### BR6: Picking List Status Transitions
```
pending → in_progress (when first order marked as worked)
in_progress → awb_generated (when all AWBs created)
awb_generated → completed (manual action)
```

### BR7: Auth Token Caching (Sameday)
- Cache JWT token in userConnections
- Store expiry timestamp
- Reuse if more than 24h until expiry
- Refresh if expiring within 24h

### BR8: Data Isolation
- All queries MUST filter by userId
- Users can only see their own data
- Super admin bypass: use switched userId instead

---

## API Specifications

### Convex Function Types

**Queries (Read-only, Cached, Real-time):**
- `orders.list` - List orders with filters
- `orders.getById` - Get single order
- `pickingLists.list` - List picking lists
- `pickingLists.getWithOrders` - Get list with order details
- `connections.list` - List user connections
- `inventory.getStockLevels` - Get current stock

**Mutations (Write, Transactional):**
- `orders.updateNotes` - Update order notes
- `orders.updatePhone` - Update customer phone
- `orders.cancel` - Cancel order
- `orders.upsertFromShopify` - Sync order from Shopify
- `pickingLists.create` - Create picking list
- `pickingLists.addOrders` - Add orders to list
- `pickingLists.removeOrder` - Remove order from list
- `pickingLists.markWorked` - Mark order as worked
- `connections.create` - Create connection
- `connections.update` - Update connection
- `awb.createTracking` - Store AWB record
- `awb.updateStatus` - Update AWB status

**Actions (External APIs, Side Effects):**
- `shopify.syncOrders` - Fetch orders from Shopify
- `shopify.fulfillOrder` - Create fulfillment in Shopify
- `sameday.generateAwb` - Create AWB
- `sameday.fetchStatus` - Get AWB status
- `sameday.downloadPdf` - Get AWB PDF
- `sameday.cancelAwb` - Cancel AWB
- `fgo.createInvoice` - Create invoice
- `fgo.stornoInvoice` - Cancel invoice
- `fgo.getInvoicePdf` - Get invoice PDF

**HTTP Endpoints (Webhooks):**
- `POST /webhook/shopify` - Shopify order webhooks
- `GET /api/health` - Health check

---

## UI/UX Requirements

### Design System
- **Framework:** TailwindCSS + shadcn/ui components
- **Theme:** Light/Dark mode toggle
- **Responsive:** Desktop-first, tablet-compatible
- **Icons:** Lucide React

### Layout
```
┌─────────────────────────────────────────────────────┐
│ Header (Logo, Nav Links, User Menu, Theme Toggle)   │
├─────────────────────────────────────────────────────┤
│                                                     │
│                   Main Content                      │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ Page Header (Title, Actions)                 │   │
│  ├─────────────────────────────────────────────┤   │
│  │                                             │   │
│  │              Page Content                   │   │
│  │                                             │   │
│  │                                             │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Navigation Menu
1. Dashboard
2. Orders
3. Picking Lists
4. Inventory
   - Stock Orders
   - Inbound Stock
   - Items
5. Warehouse Map
6. Returns
7. Invoices
8. Courier Summary
9. Connections
10. Settings

### Key Components

**Data Tables:**
- Sortable columns (click header)
- Resizable columns
- Column visibility toggle
- Row selection (checkbox)
- Pagination (25/50/100 per page)
- Sticky header on scroll
- Empty state illustration

**Modals:**
- Centered, max-width based on content
- Close on overlay click or X button
- Loading states with spinner
- Error states with retry

**Forms:**
- Inline validation
- Error messages below fields
- Required field indicators
- Disabled state during submit

**Notifications:**
- Toast messages (bottom-right)
- Success: green
- Error: red
- Warning: yellow
- Auto-dismiss after 5 seconds

### Mobile Considerations
- Hamburger menu for navigation
- Simplified table views (card layout)
- Touch-friendly buttons (min 44px)
- Swipe gestures where appropriate

---

## Non-Functional Requirements

### Performance
- Page load < 2 seconds
- Real-time updates via Convex subscriptions
- Paginate lists > 100 items
- Lazy load images
- Debounce search inputs (300ms)

### Security
- All routes behind authentication
- Session tokens with expiry
- HTTPS only
- Credentials stored encrypted
- CORS configured for known origins
- Input validation on all mutations

### Reliability
- Retry logic for external API calls
- Graceful error handling
- Offline indicator
- Data backup for critical fields (notes)

### Scalability
- Handle 10,000+ orders per user
- Support 100+ concurrent users
- Efficient database indexes
- Pagination on all list endpoints

### Observability
- Activity logging on orders
- Job queue for async operations
- Error tracking (console for now)
- Function execution logs (Convex dashboard)

---

## Appendix

### A: Romanian Address Format
```
Street: Strada Exemplu, Nr. 10, Bl. A, Sc. 1, Ap. 5
City: București
County: București (or Sector 1, etc.)
Postal Code: 010101
Country: Romania
```

### B: Sameday County Mapping Examples
| Shopify Province | Sameday County ID |
|------------------|-------------------|
| București | 1 |
| Sector 1 | 1 |
| Cluj | 12 |
| Timiș | 35 |
| Iași | 22 |

### C: Sample AWB Observation Format
```
#1234 x SKU001 x 2 x Product Name x Size M / Color Blue
```

### D: FGO VAT Calculation
```
// Shopify prices INCLUDE VAT (21%)
// FGO expects prices WITHOUT VAT

priceWithVAT = 121.00
vatRate = 0.21
priceWithoutVAT = priceWithVAT / (1 + vatRate)
                = 121.00 / 1.21
                = 100.00
vatAmount = priceWithVAT - priceWithoutVAT
          = 21.00
```

### E: Glossary
| Term | Definition |
|------|------------|
| AWB | Air Waybill - Shipping label/tracking number |
| COD | Cash on Delivery - Payment method |
| FGO | FacturaGo Online - Romanian invoicing platform |
| RON | Romanian Leu - Currency |
| SKU | Stock Keeping Unit - Product identifier |
| VAT | Value Added Tax - 21% in Romania |
| Storno | Invoice cancellation |
| Picking List | Group of orders for warehouse processing |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-24 | Initial PRD |

---

*This PRD is designed to be self-contained. An LLM or developer with no prior context should be able to implement the complete system using only this document and the CONVEX_PORTING_GUIDE.md for technical patterns.*
