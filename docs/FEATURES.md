# VNT Dashboard - Feature Documentation

This document describes the features implemented in the VNT Dashboard order management system.

---

## Table of Contents

1. [Multi-Store Management](#1-multi-store-management)
2. [Quick Add to Picking List](#2-quick-add-to-picking-list)
3. [Order Cancellation & Revert](#3-order-cancellation--revert)
4. [Multiple Orders Indicator](#4-multiple-orders-indicator)
5. [Order Notes & Search](#5-order-notes--search)
6. [Delivery Status Sync](#6-delivery-status-sync)
7. [SKU Stock in Edit Modal](#7-sku-stock-in-edit-modal)
8. [Add/Modify SKUs in Orders](#8-addmodify-skus-in-orders)

---

## 1. Multi-Store Management

### Overview
Manage multiple Shopify stores from a single dashboard with automatic filtering.

### Features

#### Store Selector (Header)
- Dropdown in the application header showing all connected stores
- Displays store alias (custom name) or domain
- Badge indicating "Primary" store
- Quick link to "Manage Stores" (Connections page)

#### Store Aliases
- Set custom names for each store (e.g., "Main Brand", "Site 2")
- Edit aliases in **Connections** page by hovering over a store and clicking the pencil icon
- Aliases appear in the store selector dropdown

#### Automatic Filtering
When a store is selected:
- **Orders page** shows only orders from that store
- **Sync Orders** syncs only the selected store
- **Spam detection** counts only for the selected store
- Selection persists in `localStorage`

### Technical Details

**Files Modified:**
- `convex/schema.ts` - Added `alias` field to `shopifyStoreConnections`
- `convex/shopifyOauth.ts` - Added `updateStoreAlias` mutation, updated `getStores` to return `displayName`
- `src/contexts/StoreContext.tsx` - New context for global store state
- `src/components/Layout.tsx` - Store selector dropdown
- `src/pages/OrdersPage.tsx` - Filter by `shopDomain`
- `src/pages/ConnectionsPage.tsx` - Alias editing UI

**Schema Changes:**
```typescript
shopifyStoreConnections: defineTable({
  // ... existing fields
  alias: v.optional(v.string()), // Custom display name
})
```

---

## 2. Quick Add to Picking List

### Overview
Add individual orders to picking lists directly from the orders table.

### Usage
1. Click the **+** button next to any order
2. Choose from dropdown:
   - **"Lista de azi"** - Creates/uses today's picking list
   - Select an existing picking list from the list

### Behavior
- If "today's list" doesn't exist, it's automatically created
- Order is added to the selected picking list
- Toast notification confirms the action

### Technical Details

**Files Modified:**
- `convex/pickingLists.ts` - Added `addSingleOrder` mutation

**Mutation:**
```typescript
addSingleOrder({
  token: string,
  orderId: Id<"shopifyOrders">,
  pickingListId?: Id<"pickingLists">, // Optional - if not provided, uses/creates today's list
  useToday?: boolean
})
```

---

## 3. Order Cancellation & Revert

### Overview
Cancel orders locally (without affecting Shopify) with the ability to revert.

### Usage
1. Click the **X** button next to an order to cancel it
2. Order status changes to "cancelled"
3. If cancelled by mistake, click the **↩** (undo) button to revert

### Behavior
- **Cancel**: Stores the previous status, sets status to "cancelled", restores stock
- **Revert**: Restores previous status, deducts stock again
- Local only - does not sync to Shopify

### Stock Adjustment
When cancelling:
- Stock is **added back** for each SKU in the order

When reverting:
- Stock is **deducted** for each SKU in the order

### Technical Details

**Files Modified:**
- `convex/schema.ts` - Added `previousStatus` field to `shopifyOrders`
- `convex/orders.ts` - Added `cancel` and `revertCancel` mutations

**Schema Changes:**
```typescript
shopifyOrders: defineTable({
  // ... existing fields
  previousStatus: v.optional(v.string()), // Stored when order is cancelled
})
```

---

## 4. Multiple Orders Indicator

### Overview
Identify customers with multiple active orders (potential repeat customers or fraud detection).

### Features
- Badge showing count of orders for same phone number
- Click badge to view all orders from that customer
- Modal displays order details with Shopify order numbers

### Definition of "Active Orders"
Orders that:
- Have no AWB generated yet, OR
- Have delivery status not equal to "delivered"

### Technical Details

**Files Modified:**
- `convex/schema.ts` - Added index `by_userId_customerPhone`
- `convex/orders.ts` - Added `getByPhone` query
- `src/pages/OrdersPage.tsx` - Badge UI and modal

**Index Added:**
```typescript
.index("by_userId_customerPhone", ["userId", "customerPhone"])
```

---

## 5. Order Notes & Search

### Overview
Add notes to orders and search by note content.

### Features

#### Adding Notes
- Open order edit modal
- Enter notes in the "Notițe" field
- Save changes

#### Searching Notes
- Type in the search bar at the top of Orders page
- Search matches:
  - Order number
  - Customer name
  - Customer phone
  - Customer email
  - **Notes content**

### Use Cases
- Mark orders as "resun" (callback needed)
- Add delivery instructions
- Track customer interactions

### Technical Details

**Files Modified:**
- `convex/schema.ts` - Added `notes` field to `shopifyOrders`
- `convex/orders.ts` - Updated `list` query to search notes, updated `updateCustomerDetails` to save notes

**Schema Changes:**
```typescript
shopifyOrders: defineTable({
  // ... existing fields
  notes: v.optional(v.string()),
})
```

---

## 6. Delivery Status Sync

### Overview
Automatically sync delivery status from Sameday courier service.

### Features

#### Manual Sync
- Click "Sync Delivery Status" button in Orders page header
- Syncs all orders with AWBs

#### Status Display
- Delivery status badge shown in orders table
- Color-coded by status type

#### Status Types
| Status | Color | Description |
|--------|-------|-------------|
| În tranzit | Blue | Package in transit |
| Livrat | Green | Successfully delivered |
| Returnat | Red | Returned to sender |
| În curs de livrare | Yellow | Out for delivery |

### Sameday API Integration

**Endpoint:**
```
GET /api/client/awb/{awbNumber}/status
```

**Response Structure:**
```json
{
  "expeditionStatus": {
    "status": "Successfully delivered",
    "statusLabel": "Livrat cu succes",
    "statusState": "delivered"
  },
  "expeditionHistory": [
    {
      "status": "Package in transit",
      "statusLabel": "Colet in tranzit",
      "date": "2024-01-15 10:30:00",
      "county": "București",
      "transitLocation": "Hub Central"
    }
  ],
  "summary": {
    "deliveredAt": "2024-01-15 14:45:00"
  }
}
```

### Technical Details

**Files Modified:**
- `convex/schema.ts` - Added `deliveryStatus` to `shopifyOrders` and `awbTracking`
- `convex/sameday.ts` - Updated `fetchAwbStatus` action, added `syncAllDeliveryStatuses`
- `src/pages/OrdersPage.tsx` - Delivery status badge and sync button

**Schema Changes:**
```typescript
shopifyOrders: defineTable({
  // ... existing fields
  deliveryStatus: v.optional(v.string()),
})

awbTracking: defineTable({
  // ... existing fields
  deliveryStatus: v.optional(v.string()),
  statusHistory: v.optional(v.array(v.object({
    status: v.string(),
    statusLabel: v.string(),
    date: v.string(),
    county: v.optional(v.string()),
    transitLocation: v.optional(v.string()),
  }))),
})
```

---

## 7. SKU Stock in Edit Modal

### Overview
View current stock levels for each SKU when editing an order.

### Features
- Stock quantity displayed next to each item in edit modal
- Color-coded indicators:
  - **Green**: Stock > 5
  - **Yellow**: Stock 1-5
  - **Red**: Stock 0

### Display
```
┌─────────────────────────────────────────┐
│ Edit Order                              │
├─────────────────────────────────────────┤
│ Items:                                  │
│ ┌─────────────────────────────────────┐ │
│ │ SKU001 - Product Name        Qty: 2 │ │
│ │ Stock: 15 ✓                         │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ SKU002 - Another Product     Qty: 1 │ │
│ │ Stock: 0 ⚠                          │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### Technical Details

**Files Modified:**
- `convex/skus.ts` - Added `getStockForSkus` query
- `src/pages/OrdersPage.tsx` - Stock display in edit modal

**Query:**
```typescript
getStockForSkus({
  token: string,
  skuCodes: string[]
}) // Returns: { [sku: string]: number }
```

---

## 8. Add/Modify SKUs in Orders

### Overview
Add, remove, or adjust SKU quantities within orders.

### Features

#### Add SKU to Order
1. Click "Add SKU" in edit modal
2. Search for SKU by code or name
3. Only SKUs with stock > 0 are shown
4. Select quantity and add

#### Modify Quantity
- Use +/- buttons to adjust quantity
- Stock is automatically adjusted:
  - Increase quantity → deduct from stock
  - Decrease quantity → add back to stock

#### Remove SKU
- Click trash icon to remove item
- Stock is restored for removed items

### Stock Management Rules

| Action | Stock Effect |
|--------|--------------|
| Add item to order | Deduct from stock |
| Increase quantity | Deduct difference |
| Decrease quantity | Add back difference |
| Remove item | Add back full quantity |
| Cancel order | Add back all items |
| Revert cancel | Deduct all items again |

### Technical Details

**Files Modified:**
- `convex/skus.ts` - Added `addStockBySku`, `deductStockBySku`, `adjustStockBatch` mutations
- `convex/orders.ts` - Added `updateItems` mutation
- `src/pages/OrdersPage.tsx` - SKU picker UI, quantity controls

**Mutations:**
```typescript
// Add stock (for cancellations, quantity decreases)
addStockBySku({ token, sku, quantity })

// Deduct stock (for new items, quantity increases)
deductStockBySku({ token, sku, quantity })

// Batch adjust (for order updates)
adjustStockBatch({ token, adjustments: [{ sku, quantity }] })

// Update order items
updateItems({ token, orderId, items, adjustStock: true })
```

---

## Summary of Schema Changes

### `shopifyOrders` Table
```typescript
{
  // ... existing fields
  notes: v.optional(v.string()),
  previousStatus: v.optional(v.string()),
  deliveryStatus: v.optional(v.string()),
}
```

### `shopifyStoreConnections` Table
```typescript
{
  // ... existing fields
  alias: v.optional(v.string()),
}
```

### `awbTracking` Table
```typescript
{
  // ... existing fields
  deliveryStatus: v.optional(v.string()),
  statusHistory: v.optional(v.array(v.object({...}))),
}
```

### New Indexes
```typescript
shopifyOrders.index("by_userId_customerPhone", ["userId", "customerPhone"])
```

---

## API Reference

### Orders

| Function | Type | Description |
|----------|------|-------------|
| `orders.list` | Query | List orders with filters including `shopDomain` |
| `orders.cancel` | Mutation | Cancel order locally, restore stock |
| `orders.revertCancel` | Mutation | Revert cancellation, deduct stock |
| `orders.getByPhone` | Query | Get active orders by phone number |
| `orders.updateItems` | Mutation | Update order items with stock adjustment |
| `orders.countSpamOrders` | Query | Count potential spam orders |

### Picking Lists

| Function | Type | Description |
|----------|------|-------------|
| `pickingLists.addSingleOrder` | Mutation | Add order to picking list |

### SKUs

| Function | Type | Description |
|----------|------|-------------|
| `skus.getStockForSkus` | Query | Get stock levels for multiple SKUs |
| `skus.addStockBySku` | Mutation | Add stock to SKU |
| `skus.deductStockBySku` | Mutation | Deduct stock from SKU |
| `skus.adjustStockBatch` | Mutation | Batch stock adjustments |

### Sameday

| Function | Type | Description |
|----------|------|-------------|
| `sameday.syncAllDeliveryStatuses` | Action | Sync delivery status for all AWBs |
| `sameday.fetchAwbStatus` | Action | Fetch status for single AWB |

### Shopify OAuth

| Function | Type | Description |
|----------|------|-------------|
| `shopifyOauth.getStores` | Query | List connected stores with aliases |
| `shopifyOauth.updateStoreAlias` | Mutation | Update store alias |

---

*Last updated: January 2026*
