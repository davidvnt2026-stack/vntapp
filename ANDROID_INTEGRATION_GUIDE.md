# VNT Dash — Android AWB Scanner Integration Guide

This document describes how to integrate an Android barcode scanner app with the VNT Dash Convex backend.

---

## Table of Contents

1. [Overview](#overview)
2. [Convex Setup for Android](#convex-setup-for-android)
3. [Authentication](#authentication)
4. [AWB Barcode Scanning Workflows](#awb-barcode-scanning-workflows)
5. [⚠️ Cancel Order Flow (IMPORTANT)](#cancel-order-flow)
6. [API Reference — Queries & Mutations](#api-reference)
7. [Data Models & Response Shapes](#data-models)
8. [Error Handling](#error-handling)
9. [Example Flow: Scan → Lookup → Action](#example-flow)

---

## Overview

VNT Dash uses **Convex** as its backend (real-time, serverless). The Android app will:

1. **Authenticate** with email + password to get a session `token`
2. **Scan AWB barcodes** (tracking numbers from Sameday courier)
3. **Query Convex** to look up order/tracking info by AWB number
4. **Perform actions** like marking orders as worked, updating delivery status, processing returns, etc.

All communication happens via the **Convex client SDK** (or HTTP API). Every authenticated query/mutation requires a `token` string parameter.

---

## Convex Setup for Android

### Option A: Convex Android/Kotlin Client (Recommended)

Convex has a JavaScript client, but for Android you'll most likely use the **Convex HTTP API** directly or a Kotlin wrapper.

**Convex Deployment URL:**
- Your Convex deployment URL is in the format: `https://<your-deployment>.convex.cloud`
- Check the `.env.local` or Convex dashboard for the exact URL (e.g., `https://your-project-123.convex.cloud`)

**HTTP API Endpoint:**
All Convex functions can be called via HTTP POST:

```
POST https://<deployment>.convex.cloud/api/query
POST https://<deployment>.convex.cloud/api/mutation
POST https://<deployment>.convex.cloud/api/action
```

**Request format:**

```json
{
  "path": "module:functionName",
  "args": { ... }
}
```

For example, to call `auth:signIn`:

```json
POST https://<deployment>.convex.cloud/api/mutation
Content-Type: application/json

{
  "path": "auth:signIn",
  "args": {
    "email": "user@example.com",
    "password": "secret123"
  }
}
```

### Option B: Convex JavaScript SDK via React Native / WebView

If building with React Native, you can use the `convex` npm package directly — same as the web app.

---

## Authentication

The app uses **custom email/password auth** with session tokens. There is no OAuth or third-party auth provider.

### Sign In

```
Mutation: auth:signIn
```

**Args:**
| Field      | Type   | Required | Description          |
|------------|--------|----------|----------------------|
| `email`    | string | ✅       | User email (lowercased) |
| `password` | string | ✅       | User password        |

**Response:**
```json
{
  "token": "a1b2c3d4e5f6...64-char-hex-string",
  "user": {
    "_id": "profiles:abc123",
    "email": "user@example.com",
    "name": "John"
  }
}
```

**⚠️ Store the `token` securely** (Android Keystore / EncryptedSharedPreferences). It's needed for every subsequent API call.

- Token expires in **30 days**
- On 401 / null user responses → redirect to login

### Get Current User (verify token is still valid)

```
Query: auth:getCurrentUser
```

**Args:**
| Field   | Type   | Required |
|---------|--------|----------|
| `token` | string | ✅       |

**Response:** User object or `null` if expired.

```json
{
  "_id": "profiles:abc123",
  "email": "user@example.com",
  "name": "John",
  "userId": "hex-string",
  "isAdmin": false,
  "createdAt": 1706000000000
}
```

### Sign Out

```
Mutation: auth:signOut
```

**Args:**
| Field   | Type   | Required |
|---------|--------|----------|
| `token` | string | ✅       |

---

## AWB Barcode Scanning Workflows

### Workflow 1: Scan AWB → View Order Details

1. User scans a barcode → extract AWB number (string like `"100123456789"`)
2. Call `awb:getByAwbNumber` to get tracking record
3. If tracking found and has `orderId`, call `orders:getById` to get full order details
4. Display: customer name, phone, items, status, delivery status, etc.

### Workflow 2: Scan AWB → Mark Order as Worked

1. Scan barcode → get AWB number
2. Look up the order via tracking number: search orders with `orders:list` using `search` param with the AWB number
3. Call `orders:setWorkedStatus` to mark as worked

### Workflow 3: Scan AWB → Process Return

1. Scan barcode → get AWB number
2. Call `returns:searchOrder` with the AWB to find the original order
3. Call `returns:create` to create a return entry
4. Optionally call `returns:linkToOrder` to link with the original order

### Workflow 4: Scan AWB → Check Delivery Status

1. Scan barcode → get AWB number
2. Call `sameday:fetchAwbStatus` to get live status from Sameday courier API
3. Display expedition status and history

### Workflow 5: Scan AWB → Download/Print AWB PDF

1. Scan barcode → get AWB number
2. Call `sameday:downloadAwbPdf` to get the PDF as base64
3. Decode base64 → display or send to Bluetooth printer

---

## API Reference

> **Convention:** Every query/mutation that requires auth takes `token: string` as the first arg.

### AWB / Tracking

#### `awb:getByAwbNumber` (Query)
Look up tracking record by AWB number.

**Args:**
| Field       | Type   | Required |
|-------------|--------|----------|
| `token`     | string | ✅       |
| `awbNumber` | string | ✅       |

**Response:**
```json
{
  "_id": "awbTracking:xyz",
  "userId": "profiles:abc",
  "orderId": "shopifyOrders:def",
  "awbNumber": "100123456789",
  "orderNumber": "#1234",
  "customerName": "Ion Popescu",
  "customerEmail": "ion@example.com",
  "shippingAddress": { "line1": "Str. Exemplu 10", "city": "București", "state": "București", ... },
  "codAmount": 150.00,
  "currentStatus": "In tranzit",
  "statusHistory": [ { "status": "...", "statusLabel": "...", "date": "..." } ],
  "createdAt": 1706000000000,
  "updatedAt": 1706000000000
}
```

Returns `null` if not found or not owned by user.

#### `awb:list` (Query)
List all AWB tracking records for the user.

**Args:**
| Field    | Type   | Required | Description             |
|----------|--------|----------|-------------------------|
| `token`  | string | ✅       |                         |
| `status` | string | ❌       | Filter by current status |
| `limit`  | number | ❌       | Default 100             |

#### `awb:getByOrderId` (Query)
Get tracking record by order ID.

**Args:**
| Field     | Type              | Required |
|-----------|-------------------|----------|
| `token`   | string            | ✅       |
| `orderId` | Id<"shopifyOrders"> | ✅       |

---

### Orders

#### `orders:list` (Query)
List orders with filters. **Useful for AWB search** — pass the AWB number in the `search` field.

**Args:**
| Field              | Type   | Required | Description                          |
|--------------------|--------|----------|--------------------------------------|
| `token`            | string | ✅       |                                      |
| `status`           | string | ❌       | "on_hold", "ready", "cancelled"      |
| `fulfillmentStatus`| string | ❌       | "fulfilled", "unfulfilled"           |
| `deliveryStatus`   | string | ❌       | Sameday delivery status              |
| `search`           | string | ❌       | **Searches order#, name, phone, AWB, notes, SKUs** |
| `shopDomain`       | string | ❌       | Filter by Shopify store              |
| `startDate`        | string | ❌       | "YYYY-MM-DD"                         |
| `endDate`          | string | ❌       | "YYYY-MM-DD"                         |
| `limit`            | number | ❌       | Default 200                          |

**Response:** Array of order objects (see [Data Models](#data-models)).

#### `orders:getById` (Query)
Get single order by Convex document ID.

**Args:**
| Field   | Type              | Required |
|---------|-------------------|----------|
| `token` | string            | ✅       |
| `id`    | Id<"shopifyOrders"> | ✅       |

#### `orders:setWorkedStatus` (Mutation)
Mark an order as worked (processed) or un-worked. **This also adjusts stock** if the user has local inventory management enabled.

**Args:**
| Field      | Type              | Required | Description              |
|------------|-------------------|----------|--------------------------|
| `token`    | string            | ✅       |                          |
| `orderId`  | Id<"shopifyOrders"> | ✅       |                          |
| `isWorked` | boolean           | ✅       | `true` = worked, `false` = undo |

#### `orders:setWorkedStatusBatch` (Mutation)
Batch mark multiple orders as worked.

**Args:**
| Field      | Type                        | Required |
|------------|-----------------------------|----------|
| `token`    | string                      | ✅       |
| `orderIds` | Array<Id<"shopifyOrders">>   | ✅       |
| `isWorked` | boolean                     | ✅       |

#### `orders:updateStatus` (Mutation)
Change order status.

**Args:**
| Field     | Type              | Required | Description                          |
|-----------|-------------------|----------|--------------------------------------|
| `token`   | string            | ✅       |                                      |
| `orderId` | Id<"shopifyOrders"> | ✅       |                                      |
| `status`  | string            | ✅       | "on_hold", "ready", "cancelled"      |

#### `orders:updateNotes` (Mutation)
Add/update notes on an order (e.g., scan notes, damage notes).

**Args:**
| Field     | Type              | Required |
|-----------|-------------------|----------|
| `token`   | string            | ✅       |
| `orderId` | Id<"shopifyOrders"> | ✅       |
| `notes`   | string            | ✅       |

#### `orders:logPrint` (Mutation)
Log that a document was printed (AWB label, invoice).

**Args:**
| Field          | Type              | Required | Description               |
|----------------|-------------------|----------|---------------------------|
| `token`        | string            | ✅       |                           |
| `orderId`      | Id<"shopifyOrders"> | ✅       |                           |
| `documentType` | string            | ✅       | "awb", "invoice", "both"  |

---

### Sameday Courier (Actions)

> ⚠️ These are **actions** (not queries/mutations). Call via the `/api/action` endpoint.

#### `sameday:fetchAwbStatus` (Action)
Fetch live delivery status from Sameday API.

**Args:**
| Field       | Type   | Required |
|-------------|--------|----------|
| `token`     | string | ✅       |
| `awbNumber` | string | ✅       |

**Response:**
```json
{
  "expeditionStatus": {
    "status": "InTransit",
    "statusLabel": "In tranzit",
    "statusState": "active"
  },
  "expeditionHistory": [
    {
      "status": "PickedUp",
      "statusLabel": "Ridicat de curier",
      "date": "2026-01-15T10:30:00+02:00",
      "county": "București",
      "transitLocation": "Hub București"
    }
  ]
}
```

#### `sameday:downloadAwbPdf` (Action)
Download AWB label as base64-encoded PDF.

**Args:**
| Field       | Type   | Required | Description        |
|-------------|--------|----------|--------------------|
| `token`     | string | ✅       |                    |
| `awbNumber` | string | ✅       |                    |
| `format`    | string | ❌       | "A4", "A6" (default), "label" |

**Response:**
```json
{
  "pdf": "JVBERi0xLjQK...",  // base64-encoded PDF
  "contentType": "application/pdf",
  "filename": "AWB-100123456789.pdf"
}
```

#### `sameday:syncDeliveryStatus` (Action)
Sync delivery status for a specific order (updates the order record).

**Args:**
| Field     | Type              | Required |
|-----------|-------------------|----------|
| `token`   | string            | ✅       |
| `orderId` | Id<"shopifyOrders"> | ✅       |

---

### Returns

#### `returns:searchOrder` (Query)
Search for an order by AWB number or order number (for matching with a return).

**Args:**
| Field        | Type   | Required | Description                        |
|--------------|--------|----------|------------------------------------|
| `token`      | string | ✅       |                                    |
| `searchTerm` | string | ✅       | AWB number or order number (min 2 chars) |

**Response:** Single order object or `null`.

#### `returns:create` (Mutation)
Create a new return entry.

**Args:**
| Field          | Type   | Required |
|----------------|--------|----------|
| `token`        | string | ✅       |
| `awbNumber`    | string | ✅       |
| `orderNumber`  | string | ❌       |
| `customerName` | string | ❌       |
| `customerEmail`| string | ❌       |
| `returnReason` | string | ❌       |
| `notes`        | string | ❌       |

**Response:**
```json
{
  "returnId": "returns:xyz",
  "success": true
}
```

#### `returns:linkToOrder` (Mutation)
Link a return to its original order (auto-populates customer info and items).

**Args:**
| Field      | Type            | Required |
|------------|-----------------|----------|
| `token`    | string          | ✅       |
| `returnId` | Id<"returns">   | ✅       |
| `orderId`  | Id<"shopifyOrders"> | ✅   |

#### `returns:list` (Query)
List all returns with filters.

**Args:**
| Field       | Type   | Required |
|-------------|--------|----------|
| `token`     | string | ✅       |
| `status`    | string | ❌       | "pending", "processed", "cancelled" |
| `search`    | string | ❌       | Search AWB, order#, customer name |
| `startDate` | string | ❌       | "YYYY-MM-DD" |
| `endDate`   | string | ❌       | "YYYY-MM-DD" |
| `limit`     | number | ❌       | Default 200 |

---

### Picking Lists

#### `pickingLists:getOrdersByDate` (Query)
Get all orders for a specific date (used as a daily picking list).

**Args:**
| Field        | Type   | Required |
|--------------|--------|----------|
| `token`      | string | ✅       |
| `date`       | string | ✅       | "YYYY-MM-DD" |
| `shopDomain` | string | ❌       |

**Response includes:** orders array, stats, aggregated products list.

---

## Data Models

### Order Object (`shopifyOrders`)

```json
{
  "_id": "shopifyOrders:abc123",
  "userId": "profiles:xyz",
  "shopifyOrderId": "5551234567890",
  "orderNumber": "#1234",
  "status": "ready",
  "fulfillmentStatus": "fulfilled",
  "paymentStatus": "paid",
  "deliveryStatus": "In tranzit",
  "placedOn": "2026-01-15",
  "paymentMethod": "COD",

  "totalPrice": 150.00,
  "subtotalPrice": 130.00,
  "currency": "RON",
  "totalShipping": 20.00,

  "customerName": "Ion Popescu",
  "customerEmail": "ion@example.com",
  "customerPhone": "0712345678",

  "shippingAddress": {
    "line1": "Str. Exemplu 10",
    "line2": "Bl. A, Ap. 5",
    "city": "București",
    "state": "București",
    "postalCode": "010101",
    "country": "Romania",
    "countryCode": "RO"
  },

  "items": [
    {
      "name": "Product Name",
      "sku": "SKU-001",
      "quantity": 2,
      "price": 65.00
    }
  ],

  "trackingNumber": "100123456789",
  "awbGeneratedAt": 1706000000000,

  "isWorked": true,
  "workedAt": "2026-01-15T10:00:00Z",
  "workedByName": "John",

  "isReturned": false,
  "openPackageRequested": false,

  "notes": "Customer requested morning delivery",
  "shopDomain": "mystore.myshopify.com",

  "createdAt": 1706000000000,
  "updatedAt": 1706000000000
}
```

### AWB Tracking Object (`awbTracking`)

```json
{
  "_id": "awbTracking:abc",
  "userId": "profiles:xyz",
  "orderId": "shopifyOrders:def",
  "awbNumber": "100123456789",
  "orderNumber": "#1234",
  "customerName": "Ion Popescu",
  "codAmount": 150.00,
  "currentStatus": "In tranzit",
  "statusHistory": [
    {
      "status": "PickedUp",
      "statusLabel": "Ridicat de curier",
      "date": "2026-01-15T10:30:00+02:00"
    }
  ],
  "createdAt": 1706000000000,
  "updatedAt": 1706000000000
}
```

### Return Object (`returns`)

```json
{
  "_id": "returns:abc",
  "userId": "profiles:xyz",
  "awbNumber": "100123456789",
  "shopifyOrderId": "5551234567890",
  "orderNumber": "#1234",
  "customerName": "Ion Popescu",
  "returnDate": "2026-01-20",
  "returnReason": "Product damaged",
  "returnStatus": "pending",
  "returnedItems": [
    { "name": "Product Name", "sku": "SKU-001", "quantity": 1, "price": 65.00 }
  ],
  "notes": "Customer notes about the return",
  "createdAt": 1706000000000,
  "updatedAt": 1706000000000
}
```

---

## Error Handling

### Common Error Patterns

| Error Message | Meaning | Action |
|---|---|---|
| `"Sesiune expirată. Te rugăm să te autentifici din nou."` | Token expired or invalid | Re-authenticate (sign in again) |
| `"Sesiune invalidă..."` | Same as above | Re-authenticate |
| `"Comanda nu a fost găsită."` | Order not found or not owned by user | Show "not found" message |
| `"AWB-ul nu a fost găsit."` | AWB tracking record not found | AWB may not have been generated through the system |
| `"Sameday nu este configurat..."` | User has no Sameday courier connection | Tell user to configure in web dashboard |

### HTTP Error Codes from Convex HTTP API

- **200**: Success (check response body for actual result)
- **400**: Bad request (invalid args)
- **500**: Server error (function threw an error — check `message` field)

### Error Response Format

```json
{
  "status": "error",
  "errorMessage": "Sesiune expirată. Te rugăm să te autentifici din nou.",
  "errorData": null
}
```

---

## Example Flow: Scan → Lookup → Action

### Full Example: Scan AWB Barcode → Show Order → Mark as Worked

```kotlin
// 1. Scan barcode (using CameraX / ML Kit barcode scanner)
val awbNumber = "100123456789" // from scanner

// 2. Look up AWB tracking record
val tracking = convexQuery("awb:getByAwbNumber", mapOf(
    "token" to savedToken,
    "awbNumber" to awbNumber
))

if (tracking != null) {
    // 3. Get full order details
    val order = convexQuery("orders:getById", mapOf(
        "token" to savedToken,
        "id" to tracking["orderId"]
    ))

    // 4. Display order info
    showOrderDetails(order)

    // 5. Mark as worked (user taps button)
    val result = convexMutation("orders:setWorkedStatus", mapOf(
        "token" to savedToken,
        "orderId" to order["_id"],
        "isWorked" to true
    ))
}
```

### Full Example: Scan AWB → Quick Return

```kotlin
// 1. Scan barcode
val awbNumber = "100123456789"

// 2. Find original order
val order = convexQuery("returns:searchOrder", mapOf(
    "token" to savedToken,
    "searchTerm" to awbNumber
))

if (order != null) {
    // 3. Create return
    val returnResult = convexMutation("returns:create", mapOf(
        "token" to savedToken,
        "awbNumber" to awbNumber,
        "orderNumber" to order["orderNumber"],
        "customerName" to order["customerName"]
    ))

    // 4. Link return to order
    convexMutation("returns:linkToOrder", mapOf(
        "token" to savedToken,
        "returnId" to returnResult["returnId"],
        "orderId" to order["_id"]
    ))
}
```

### Convex HTTP Helper (Kotlin)

```kotlin
import okhttp3.*
import org.json.JSONObject

class ConvexClient(private val deploymentUrl: String) {
    private val client = OkHttpClient()
    private val JSON_TYPE = "application/json; charset=utf-8".toMediaType()

    fun query(path: String, args: Map<String, Any?>): JSONObject {
        return call("query", path, args)
    }

    fun mutation(path: String, args: Map<String, Any?>): JSONObject {
        return call("mutation", path, args)
    }

    fun action(path: String, args: Map<String, Any?>): JSONObject {
        return call("action", path, args)
    }

    private fun call(type: String, path: String, args: Map<String, Any?>): JSONObject {
        val body = JSONObject().apply {
            put("path", path)
            put("args", JSONObject(args))
        }

        val request = Request.Builder()
            .url("$deploymentUrl/api/$type")
            .post(body.toString().toRequestBody(JSON_TYPE))
            .addHeader("Content-Type", "application/json")
            .build()

        val response = client.newCall(request).execute()
        val responseBody = response.body?.string() ?: "{}"
        return JSONObject(responseBody)
    }
}

// Usage:
val convex = ConvexClient("https://your-deployment.convex.cloud")

// Sign in
val authResult = convex.mutation("auth:signIn", mapOf(
    "email" to "user@example.com",
    "password" to "password123"
))
val token = authResult.getString("token")

// Look up AWB
val tracking = convex.query("awb:getByAwbNumber", mapOf(
    "token" to token,
    "awbNumber" to "100123456789"
))
```

---

## Summary of Key Functions for the Scanner App

| Function | Type | Purpose |
|---|---|---|
| `auth:signIn` | mutation | Login, get token |
| `auth:getCurrentUser` | query | Verify token |
| `auth:signOut` | mutation | Logout |
| `awb:getByAwbNumber` | query | **Look up AWB by barcode** |
| `awb:getByOrderId` | query | Get AWB for an order |
| `orders:list` | query | Search orders (search field matches AWB too) |
| `orders:getById` | query | Get order details |
| `orders:setWorkedStatus` | mutation | **Mark order as worked/unworked** |
| `orders:updateNotes` | mutation | Add notes to order |
| `orders:logPrint` | mutation | Log AWB/invoice print |
| `sameday:fetchAwbStatus` | action | **Get live delivery status** |
| `sameday:downloadAwbPdf` | action | **Download AWB label PDF** |
| `sameday:syncDeliveryStatus` | action | Sync delivery status for order |
| `returns:searchOrder` | query | **Find order for return processing** |
| `returns:create` | mutation | **Create return entry** |
| `returns:linkToOrder` | mutation | Link return to order |
| `returns:list` | query | List returns |
| `pickingLists:getOrdersByDate` | query | Get today's picking list |

---

## Notes

- **All timestamps** are Unix milliseconds (`Date.now()` in JS = epoch ms).
- **All dates** (placedOn, returnDate, etc.) are strings in `"YYYY-MM-DD"` format.
- **Convex IDs** look like `"tableName:alphanumericId"` (e.g., `"shopifyOrders:jd73h2m..."`) — treat as opaque strings.
- **Currency** is usually `"RON"` but can be `"HUF"`, `"BGN"` for cross-border orders.
- **The `search` field in `orders:list`** matches against: order number, customer name, phone, tracking number (AWB), notes, and SKU names — very useful for a scanner app.
- **Stock is auto-adjusted** when marking orders as worked/unworked (if user has `stockManagement: "local"` in settings).


rders:cancel does NOT auto-storno the AWB or factura. They are 3 separate calls that need to be made in order:
Step	Function	Type	What it does
1	sameday:stornoAwb	action	Cancels AWB via Sameday API, clears tracking from order, and un-works the order (restores stock if local inventory)
2	fgo:stornoInvoice	action	Stornoes the invoice via FGO API, sets invoiceStatus to "storno"
3	orders:cancel	mutation	Changes order status to "cancelled", saves previousStatus for undo
Endpoints:
sameday:stornoAwb (action)
{
  "path": "sameday:stornoAwb",
  "args": {
    "token": "...",
    "orderId": "shopifyOrders:abc123"
  }
}
{  "path": "sameday:stornoAwb",  "args": {    "token": "...",    "orderId": "shopifyOrders:abc123"  }}
fgo:stornoInvoice (action)
{
  "path": "fgo:stornoInvoice",
  "args": {
    "token": "...",
    "orderId": "shopifyOrders:abc123"
  }
}
{  "path": "fgo:stornoInvoice",  "args": {    "token": "...",    "orderId": "shopifyOrders:abc123"  }}
orders:cancel (mutation)
{
  "path": "orders:cancel",
  "args": {
    "token": "...",
    "orderId": "shopifyOrders:abc123"
  }
}
{  "path": "orders:cancel",  "args": {    "token": "...",    "orderId": "shopifyOrders:abc123"  }}
Important notes:
Check before calling — only call sameday:stornoAwb if the order has a trackingNumber. Only call fgo:stornoInvoice if the order has an invoiceNumber and invoiceStatus !== "storno".
sameday:stornoAwb can fail if the package was already picked up by the courier (in transit/delivered). It'll throw: "AWB ... nu poate fi anulat - coletul a fost deja preluat/livrat de curier." — handle this gracefully, still proceed with the other steps.
fgo:stornoInvoice can fail if FGO is not configured — the user may manage invoices externally.
Order of operations: Storno AWB first → Storno invoice → Cancel order. If AWB storno fails because it's already in transit, you can still storno the invoice and cancel the order internally.