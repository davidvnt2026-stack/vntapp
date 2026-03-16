# VNT Logistics Dashboard - Enhanced Features PRD v2.0

## Overview

This PRD extends the core VNT Logistics system with advanced inventory management, SKU tracking, sales analytics, and comprehensive dashboard features based on the existing system capabilities.

---

## 1. SKU & Inventory Management

### 1.1 SKU Registry

**Purpose**: Central registry for all product SKUs with stock tracking capabilities.

#### Data Model - `skus` table
```typescript
skus: defineTable({
  sku: v.string(),                    // Unique SKU identifier (e.g., "VEL-011", "ESY-007")
  name: v.string(),                   // Product name
  description: v.optional(v.string()),
  category: v.optional(v.string()),
  costPrice: v.optional(v.float64()), // Cost per unit (RON)
  sellPrice: v.optional(v.float64()), // Selling price (RON)
  currentStock: v.number(),           // Current stock balance
  lowStockThreshold: v.number(),      // Alert when stock falls below this
  isActive: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
.index("by_sku", ["sku"])
.index("by_category", ["category"])
.index("by_low_stock", ["currentStock", "lowStockThreshold"])
```

#### Features
- **Add SKU**: Create new SKU with initial stock, pricing, and threshold
- **Edit SKU**: Update SKU details, pricing, thresholds
- **Delete/Deactivate SKU**: Soft delete to preserve historical data
- **Low Stock Alerts**: Real-time alerts when stock falls below threshold
- **Bulk Import**: CSV import for multiple SKUs

#### UI Components
- SKU list with search, filter by category
- Add/Edit SKU modal with form validation
- Low stock badge indicators
- Stock level color coding (red < threshold, yellow < 2x threshold, green otherwise)

---

### 1.2 Daily Stock & Orders Tracking

**Purpose**: Track daily inventory movements per SKU with editable data entry.

#### Data Model - `dailyStockRecords` table
```typescript
dailyStockRecords: defineTable({
  date: v.string(),                   // ISO date string "YYYY-MM-DD"
  dayOfMonth: v.number(),             // 1-31
  month: v.string(),                  // "YYYY-MM" format
  sku: v.string(),                    // Reference to SKU
  outboundUnits: v.number(),          // Units shipped out
  returnUnits: v.number(),            // Units returned
  orders: v.number(),                 // Number of orders
  orderReturns: v.number(),           // Number of return orders
  revenue: v.float64(),               // Revenue in RON
  notes: v.optional(v.string()),      // Daily notes
  stockBalance: v.number(),           // End of day stock balance
  createdAt: v.number(),
  updatedAt: v.number(),
})
.index("by_date_sku", ["date", "sku"])
.index("by_month_sku", ["month", "sku"])
.index("by_sku", ["sku"])
```

#### Features
- **Monthly View**: Calendar-based view showing all days of selected month
- **SKU Selector**: Dropdown to switch between SKUs
- **Inline Editing**: Click to edit any cell value
- **Auto-Calculate Stock Balance**: Running balance based on inbound/outbound
- **Notes Field**: Add daily notes per row
- **Download Report**: Export monthly data as CSV/Excel

#### Aggregated Metrics Cards
| Metric | Calculation |
|--------|-------------|
| Current Stock Balance | Latest stock value for selected SKU |
| Total Revenue (RON) | Sum of daily revenue for period |
| Total Orders | Sum of orders for period |
| Return Units | Sum of returned units |
| Orders Returns | Count of return orders |
| Monthly Return Rate (Units) | (Return Units / Outbound Units) * 100 |
| Monthly Return Rate (Orders) | (Order Returns / Total Orders) * 100 |

#### UI Layout
```
┌─────────────────────────────────────────────────────────────────┐
│ Select Month: [January 2026 ▼]  Select SKU: [ESY-007 ▼]        │
│ [Add SKU] [Refresh Data]                                        │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────────────┐│
│ │Stock│ │Rev  │ │Orders│ │Ret  │ │Ord  │ │Rate │ │Download     ││
│ │  0  │ │0.00 │ │  1   │ │  0  │ │Ret 0│ │0.00%│ │Full Report  ││
│ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────────────┘│
├─────────────────────────────────────────────────────────────────┤
│ Daily Stock & Orders - ESY-007                                  │
│ ┌────┬───────┬────────┬────────┬──────┬────────┬───────┬──────┐│
│ │Day │ SKU   │Outbound│Return  │Orders│Ord Ret │Revenue│Notes ││
│ ├────┼───────┼────────┼────────┼──────┼────────┼───────┼──────┤│
│ │ 1  │ESY-007│ [  0 ] │ [  0 ] │[ 0 ] │ [  0 ] │[ 0.00]│[   ] ││
│ │ 2  │ESY-007│ [  0 ] │ [  0 ] │[ 0 ] │ [  0 ] │[ 0.00]│[   ] ││
│ └────┴───────┴────────┴────────┴──────┴────────┴───────┴──────┘│
└─────────────────────────────────────────────────────────────────┘
```

---

### 1.3 Inbound Stock Management

**Purpose**: Track incoming stock from suppliers/manufacturing.

#### Data Model - `inboundStock` table
```typescript
inboundStock: defineTable({
  date: v.string(),                   // Arrival date
  sku: v.string(),
  quantity: v.number(),               // Units received
  supplier: v.optional(v.string()),
  purchaseOrderNumber: v.optional(v.string()),
  unitCost: v.optional(v.float64()),
  totalCost: v.optional(v.float64()),
  notes: v.optional(v.string()),
  receivedBy: v.optional(v.string()), // User who received
  createdAt: v.number(),
  updatedAt: v.number(),
})
.index("by_date", ["date"])
.index("by_sku", ["sku"])
.index("by_date_sku", ["date", "sku"])
```

#### Features
- **Add Inbound Stock**: Form to record incoming stock
- **Bulk Entry**: Add multiple SKUs in one transaction
- **Auto-Update Stock Balance**: Automatically updates `skus.currentStock`
- **History View**: View all inbound records with filtering
- **Supplier Tracking**: Optional supplier information

---

## 2. Sales Dashboard & Analytics

### 2.1 Daily Sales Overview

**Purpose**: Real-time sales performance visualization.

#### Data Model - `dailySales` table (aggregated from orders)
```typescript
dailySales: defineTable({
  date: v.string(),                   // "YYYY-MM-DD"
  totalOrders: v.number(),
  totalRevenue: v.float64(),          // RON
  averageOrderValue: v.float64(),
  totalUnits: v.number(),
  returnOrders: v.number(),
  returnRevenue: v.float64(),
  netRevenue: v.float64(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
.index("by_date", ["date"])
```

#### Dashboard Widgets

**1. Summary Cards**
| Card | Value | Color |
|------|-------|-------|
| Total Sales | Sum of revenue for period | Green background |
| Total Orders | Count of orders | Blue background |

**2. Sales Chart (Bar + Line)**
- X-axis: Days (e.g., 18 Jan, 19 Jan, 20 Jan...)
- Left Y-axis: Orders count (Blue bars)
- Right Y-axis: Revenue in RON (Green line)
- Interactive: Hover for details
- Period selectors: TODAY | 7 Days | 30 Days | Custom

**3. Period Stats Table**
```
┌──────────────────────────────────────────┐
│      Daily Sales Overview                │
│  Track your daily orders and revenue     │
│                                          │
│  [TODAY] [7 Days] [30 Days] [Custom]     │
├──────────────────────────────────────────┤
│  ┌────────────────┐ ┌────────────────┐   │
│  │ Total Sales    │ │ Total Orders   │   │
│  │ 116,890 RON    │ │ 689            │   │
│  └────────────────┘ └────────────────┘   │
│                                          │
│  [═══════════ CHART ═══════════════]     │
│                                          │
└──────────────────────────────────────────┘
```

---

### 2.2 Picking List Analytics

**Purpose**: Track fulfillment efficiency via picking lists.

#### Widgets

**1. Picking List Orders Summary**
| Metric | Description |
|--------|-------------|
| Total Orders | Orders processed via picking lists |
| Picking Lists | Number of picking lists created |

**2. Period Filters**
- Last 7 Days
- This Month
- Last 3 Months

**3. Daily Picking Chart**
- Bar chart showing orders per picking list per day

---

### 2.3 General Overview (Yearly/Period)

**Purpose**: High-level business metrics with SKU breakdown.

#### Data Model - `skuMetrics` (computed/cached)
```typescript
skuMetrics: defineTable({
  period: v.string(),                 // "2026" or "2026-01" or "2026-Q1"
  sku: v.string(),
  currentStock: v.number(),
  totalOrders: v.number(),
  totalUnits: v.number(),
  orderReturns: v.number(),
  returnUnits: v.number(),
  totalRevenue: v.float64(),
  returnRate: v.float64(),            // Percentage
  createdAt: v.number(),
  updatedAt: v.number(),
})
.index("by_period", ["period"])
.index("by_period_sku", ["period", "sku"])
```

#### UI Layout
```
┌───────────────────────────────────────────────────────────────────┐
│ GENERAL OVERVIEW - 2026                                           │
│ All months cumulative data                                        │
├───────────────────────────────────────────────────────────────────┤
│ Total Metrics by SKU                                              │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐               │
│ │Current Stock │ │Total Orders  │ │Order Returns │               │
│ ├──────────────┤ ├──────────────┤ ├──────────────┤               │
│ │VEL-011    52 │ │VEL-011   421 │ │VEL-011    67 │               │
│ │VEL-030   408 │ │VEL-030   289 │ │VEL-030    27 │               │
│ │VEL-015     0 │ │VEL-015   195 │ │VEL-015     0 │               │
│ │VEL-022   763 │ │VEL-022   187 │ │VEL-022    19 │               │
│ │VEL-020   387 │ │VEL-020   105 │ │VEL-020    10 │               │
│ └──────────────┘ └──────────────┘ └──────────────┘               │
├───────────────────────────────────────────────────────────────────┤
│ Status Distribution                                               │
│ Order status breakdown for selected period                        │
│ From: [Jan 1, 2026] To: [Jan 24, 2026] [Apply] [Reset]           │
│                                                                   │
│ [PIE CHART / BAR CHART showing status distribution]              │
│ - Fulfilled: XX%                                                  │
│ - Processing: XX%                                                 │
│ - Returned: XX%                                                   │
│ - Cancelled: XX%                                                  │
└───────────────────────────────────────────────────────────────────┘
```

---

### 2.4 Low Stock Alerts

**Purpose**: Proactive inventory management.

#### Implementation
- Real-time query checking `skus.currentStock < skus.lowStockThreshold`
- Toast/Banner notification in dashboard
- Optional email alerts via Brevo/SendGrid

#### Alert Banner
```
┌─────────────────────────────────────────────────────────────────┐
│ ⚠️ Stoc scăzut (sub 50 buc)                                      │
│ VEL-019: 0 pcs, VEL-009: 0 pcs, VEL-015: 0 pcs, ESY-007: 0 pcs  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Enhanced Navigation

### 3.1 Navigation Structure

```
VNT Logistic Dashboard
├── 🏠 VNT Main Page
├── 📊 Dashboard
│   ├── Daily Sales Overview
│   ├── Picking List Analytics
│   └── General Overview
├── 📦 Stock & Orders
│   ├── Daily Tracking Grid
│   ├── Monthly Summary
│   └── SKU Selector
├── 📥 Inbound Stock
│   ├── Add Inbound
│   └── Inbound History
├── 🏷️ Items (SKU Management)
│   ├── SKU List
│   ├── Add/Edit SKU
│   └── Categories
├── 🛒 Orders
│   ├── Order List
│   ├── Order Details
│   └── Fulfillment Status
├── 📋 Courier Summary
│   ├── AWB Status
│   └── Shipping Analytics
├── 💰 Profit Calculator
├── ⚙️ Connections
├── ↩️ Returns
│   ├── Return Processing
│   └── Return Analytics
└── 📋 Queue
    └── Processing Queue
```

---

## 4. Convex Implementation

### 4.1 New Schema Additions

```typescript
// convex/schema.ts - Additional tables

// SKU Management
skus: defineTable({
  sku: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  category: v.optional(v.string()),
  costPrice: v.optional(v.float64()),
  sellPrice: v.optional(v.float64()),
  currentStock: v.number(),
  lowStockThreshold: v.number(),
  isActive: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
.index("by_sku", ["sku"])
.index("by_category", ["category"]),

// Daily Stock Records
dailyStockRecords: defineTable({
  date: v.string(),
  dayOfMonth: v.number(),
  month: v.string(),
  sku: v.string(),
  outboundUnits: v.number(),
  returnUnits: v.number(),
  orders: v.number(),
  orderReturns: v.number(),
  revenue: v.float64(),
  notes: v.optional(v.string()),
  stockBalance: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
.index("by_date_sku", ["date", "sku"])
.index("by_month_sku", ["month", "sku"])
.index("by_sku", ["sku"]),

// Inbound Stock
inboundStock: defineTable({
  date: v.string(),
  sku: v.string(),
  quantity: v.number(),
  supplier: v.optional(v.string()),
  purchaseOrderNumber: v.optional(v.string()),
  unitCost: v.optional(v.float64()),
  totalCost: v.optional(v.float64()),
  notes: v.optional(v.string()),
  receivedBy: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
.index("by_date", ["date"])
.index("by_sku", ["sku"])
.index("by_date_sku", ["date", "sku"]),

// Daily Sales Aggregates
dailySales: defineTable({
  date: v.string(),
  totalOrders: v.number(),
  totalRevenue: v.float64(),
  averageOrderValue: v.float64(),
  totalUnits: v.number(),
  returnOrders: v.number(),
  returnRevenue: v.float64(),
  netRevenue: v.float64(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
.index("by_date", ["date"]),

// SKU Period Metrics (cached aggregates)
skuMetrics: defineTable({
  period: v.string(),
  sku: v.string(),
  currentStock: v.number(),
  totalOrders: v.number(),
  totalUnits: v.number(),
  orderReturns: v.number(),
  returnUnits: v.number(),
  totalRevenue: v.float64(),
  returnRate: v.float64(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
.index("by_period", ["period"])
.index("by_period_sku", ["period", "sku"]),
```

### 4.2 Key Convex Functions

#### SKU Functions (`convex/skus.ts`)
```typescript
// Queries
- list: Get all active SKUs
- getById: Get single SKU by ID
- getBySku: Get by SKU code
- getLowStock: Get SKUs below threshold
- getByCategory: Filter by category

// Mutations
- create: Add new SKU
- update: Update SKU details
- updateStock: Adjust stock level
- deactivate: Soft delete SKU
- bulkImport: Import multiple SKUs
```

#### Daily Stock Functions (`convex/dailyStock.ts`)
```typescript
// Queries
- getByMonthAndSku: Get all records for month/SKU
- getMonthSummary: Aggregated stats for month
- getDailyRecord: Single day record

// Mutations
- upsertRecord: Create or update daily record
- updateField: Update single field (inline edit)
- bulkUpdate: Update multiple records
- recalculateBalances: Recalculate running balances
```

#### Inbound Stock Functions (`convex/inboundStock.ts`)
```typescript
// Queries
- list: Get all inbound records
- getByDateRange: Filter by date range
- getBySku: Filter by SKU

// Mutations
- create: Add inbound stock (also updates SKU stock)
- update: Modify inbound record
- delete: Remove inbound record (adjusts stock)
```

#### Analytics Functions (`convex/analytics.ts`)
```typescript
// Queries
- getDailySales: Get sales data for date range
- getSalesChart: Formatted data for charts
- getSkuMetrics: Get metrics by SKU for period
- getStatusDistribution: Order status breakdown
- getPickingListStats: Picking list analytics

// Mutations
- aggregateDailySales: Compute daily aggregates
- refreshSkuMetrics: Recalculate SKU metrics
```

---

## 5. UI Component Specifications

### 5.1 Stock & Orders Page

**File**: `src/pages/StockOrdersPage.tsx`

```typescript
// Components needed:
- MonthPicker: Select month dropdown
- SkuSelector: SKU dropdown with search
- MetricsCards: Row of summary cards
- DailyStockTable: Editable data grid
  - InlineEditCell: Click-to-edit cells
  - NotesCell: Expandable notes field
- DownloadButton: Export to CSV/Excel
```

### 5.2 Dashboard Page

**File**: `src/pages/DashboardPage.tsx`

```typescript
// Components needed:
- PeriodSelector: TODAY | 7 Days | 30 Days | Custom
- SalesChart: Recharts bar + line combo
- SummaryCard: Revenue/Orders cards
- PickingListWidget: Picking stats section
- LowStockAlert: Alert banner component
- GeneralOverview: SKU metrics tables
- StatusDistribution: Pie/bar chart
- DateRangePicker: From/To date selection
```

### 5.3 Items/SKU Page

**File**: `src/pages/ItemsPage.tsx`

```typescript
// Components needed:
- SkuTable: List of all SKUs with columns
- AddSkuModal: Form for new SKU
- EditSkuModal: Edit existing SKU
- StockBadge: Color-coded stock indicator
- CategoryFilter: Filter by category
- SearchBar: Search by SKU/name
- BulkImportModal: CSV upload
```

### 5.4 Inbound Stock Page

**File**: `src/pages/InboundStockPage.tsx`

```typescript
// Components needed:
- InboundForm: Add inbound stock form
- InboundHistory: Table of past records
- DateFilter: Filter by date range
- SkuFilter: Filter by SKU
- SupplierFilter: Filter by supplier
```

---

## 6. Charts Library

**Recommended**: Recharts (React + D3)

```bash
npm install recharts
```

### Chart Configurations

**Sales Overview Chart**
```typescript
<ComposedChart data={salesData}>
  <XAxis dataKey="date" />
  <YAxis yAxisId="left" />
  <YAxis yAxisId="right" orientation="right" />
  <Bar yAxisId="left" dataKey="orders" fill="#3B82F6" />
  <Line yAxisId="right" dataKey="revenue" stroke="#22C55E" />
  <Tooltip />
  <Legend />
</ComposedChart>
```

**Status Distribution Chart**
```typescript
<PieChart>
  <Pie data={statusData} dataKey="value" nameKey="status">
    {statusData.map((entry, index) => (
      <Cell key={index} fill={COLORS[index]} />
    ))}
  </Pie>
  <Tooltip />
  <Legend />
</PieChart>
```

---

## 7. Implementation Priority

### Phase 1: Core Inventory (Week 1)
1. ✅ SKU schema and CRUD functions
2. ✅ Daily stock records schema and functions
3. ✅ Items/SKU management page
4. ✅ Stock & Orders page with editable grid

### Phase 2: Analytics (Week 2)
1. ✅ Daily sales aggregation
2. ✅ Dashboard with sales chart
3. ✅ Period selectors and filtering
4. ✅ Low stock alerts

### Phase 3: Advanced Features (Week 3)
1. ✅ Inbound stock management
2. ✅ General overview with SKU metrics
3. ✅ Status distribution charts
4. ✅ Export/download functionality

### Phase 4: Polish (Week 4)
1. ✅ Picking list analytics
2. ✅ Returns tracking
3. ✅ Email alerts integration
4. ✅ Performance optimization

---

## 8. API Endpoints Summary

| Endpoint | Type | Description |
|----------|------|-------------|
| `skus.list` | Query | List all SKUs |
| `skus.create` | Mutation | Create new SKU |
| `skus.updateStock` | Mutation | Update stock level |
| `skus.getLowStock` | Query | Get low stock items |
| `dailyStock.getByMonth` | Query | Get month records |
| `dailyStock.upsert` | Mutation | Create/update record |
| `inboundStock.create` | Mutation | Add inbound stock |
| `analytics.getDailySales` | Query | Sales for period |
| `analytics.getSkuMetrics` | Query | SKU performance |
| `analytics.getStatusDist` | Query | Order status breakdown |

---

## 9. Environment Variables

```env
# Already configured
CONVEX_DEPLOYMENT=...
VITE_CONVEX_URL=...

# Optional for alerts
BREVO_API_KEY=...
ALERT_EMAIL_RECIPIENTS=...
```

---

## 10. Success Metrics

| Metric | Target |
|--------|--------|
| Page Load Time | < 2s |
| Real-time Updates | < 500ms |
| Data Accuracy | 100% |
| User Actions/Day | Track usage |
| Low Stock Alert Response | < 24h |

---

## Appendix: Existing Features Reference

Based on screenshots, the system already has:
- ✅ Multi-tab navigation
- ✅ Theme toggle (light/dark)
- ✅ Month/SKU selectors
- ✅ Editable grid cells
- ✅ Metric summary cards
- ✅ Sales charts with dual axes
- ✅ Period filtering
- ✅ Low stock alert banner
- ✅ SKU metrics breakdown
- ✅ Status distribution section
- ✅ Picking list analytics
