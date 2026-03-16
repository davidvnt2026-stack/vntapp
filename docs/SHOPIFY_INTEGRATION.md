# Shopify Integration Guide

This guide explains how to connect your Shopify stores to VNT Dash for order syncing, product management, and fulfillment automation.

---

## Overview

VNT Dash integrates with Shopify using OAuth 2.0, providing a secure and seamless connection to your stores. The integration supports:

- ✅ **Multi-store support** - Connect multiple Shopify stores
- ✅ **Order syncing** - Import orders automatically
- ✅ **Product syncing** - Import SKUs and inventory data
- ✅ **Webhook support** - Real-time order updates
- ✅ **OAuth 2.0** - Secure authentication flow

---

## Setup Process

The Shopify integration follows a two-step wizard process:

### Step 1: Configure Your Shopify App

Before connecting stores, you need to create a Shopify app and add its credentials to VNT Dash.

#### Creating a Shopify App

1. Go to [Shopify Partner Dashboard](https://partners.shopify.com)
2. Navigate to **Apps** → **Create app**
3. Choose **Create app manually**
4. Enter your app name (e.g., "VNT Logistics")
5. After creation, go to **Client credentials**

#### Required Shopify App Settings

In your Shopify app settings, configure:

| Setting | Value |
|---------|-------|
| **App URL** | `https://your-domain.com` |
| **Allowed redirection URLs** | `https://your-domain.com/oauth/shopify/callback` |

#### API Scopes Required

The app requires these OAuth scopes:
- `read_orders` - Read order data
- `write_orders` - Update order fulfillment
- `read_products` - Read product data
- `read_inventory` - Read inventory levels
- `read_fulfillments` - Read fulfillment data
- `write_fulfillments` - Create fulfillments
- `read_customers` - Read customer data

#### Adding Credentials to VNT Dash

1. Navigate to **Connections** in VNT Dash
2. In the **Shopify Integration** section, click **Add Credentials**
3. Enter:
   - **App Name** (optional) - A friendly name for your app
   - **Client ID** - From Shopify Partner Dashboard
   - **Client Secret** - From Shopify Partner Dashboard
4. Click **Save Credentials**

### Step 2: Connect Your Stores

Once your app is configured, you can connect Shopify stores:

1. Click **Add Store** in the Connected Stores section
2. Enter your store domain (e.g., `my-store` or `my-store.myshopify.com`)
3. Click **Connect via OAuth**
4. You'll be redirected to Shopify to authorize the app
5. After authorization, you'll be returned to VNT Dash

---

## Managing Connected Stores

### Primary Store

The first connected store automatically becomes your **primary store**. The primary store is used as the default when no specific store is specified for operations.

To change the primary store:
- Click the ⭐ star icon next to any non-primary store

### Available Actions

For each connected store, you can:

| Action | Description |
|--------|-------------|
| **Sync Orders** | Pull latest orders from Shopify |
| **Sync Products** | Import products and SKUs |
| **Webhooks** | Enable real-time order notifications |
| **Set Primary** | Make this the default store |
| **Disconnect** | Remove the store connection |

### Syncing Orders

Click the **Orders** button to manually sync orders from Shopify. This will:
- Import new orders since last sync
- Update existing orders with latest status
- Import customer and shipping information

### Syncing Products

Click the **Products** button to sync your product catalog:
- Creates SKU entries for each product variant
- Imports product names, images, and pricing
- Links Shopify variant IDs for inventory tracking

### Webhooks (Real-time Sync)

Click the **Webhooks** button to enable real-time order sync:
- New orders appear instantly
- Order cancellations are reflected immediately
- Reduces need for manual syncing

---

## Technical Details

### Data Flow

```
Shopify Store → OAuth → VNT Dash Backend → Database
     ↓                       ↓
  Webhooks    ←    API Calls (Sync)
```

### Database Tables

| Table | Purpose |
|-------|---------|
| `shopifyAppConfig` | Stores your app credentials |
| `shopifyStoreConnections` | Connected store information |
| `shopifyOauthStates` | OAuth state tokens (temporary) |
| `shopifyOrders` | Synced order data |
| `skus` | Product/SKU data |

### OAuth Flow

1. User enters store domain
2. VNT Dash generates a state token (CSRF protection)
3. User is redirected to Shopify authorization page
4. User approves the app
5. Shopify redirects back with authorization code
6. VNT Dash exchanges code for access token
7. Access token is stored securely

### API Endpoints

The Convex backend provides:

```typescript
// App Configuration
shopifyOauth.getAppConfig     // Get current config
shopifyOauth.saveAppConfig    // Save credentials
shopifyOauth.deleteAppConfig  // Remove credentials

// OAuth Flow
shopifyOauth.initOAuth        // Start OAuth process
shopifyOauth.exchangeCodeForToken // Complete OAuth

// Store Management
shopifyOauth.getStores        // List connected stores
shopifyOauth.setPrimaryStore  // Set primary store
shopifyOauth.disconnectStore  // Remove store

// Syncing
shopify.syncOrders            // Sync orders
shopify.syncProducts          // Sync products
shopify.registerWebhooks      // Enable webhooks
```

---

## Troubleshooting

### "Shopify OAuth not configured"

**Cause:** App credentials haven't been added yet.

**Solution:** Complete Step 1 by adding your Client ID and Client Secret.

### "Invalid or expired OAuth state"

**Cause:** The OAuth flow took too long or was interrupted.

**Solution:** Try connecting the store again. The state token expires after 10 minutes.

### "Shop domain mismatch"

**Cause:** The store you authorized doesn't match the one you entered.

**Solution:** Ensure you're logging into the correct Shopify store when authorizing.

### "Failed to exchange code for token"

**Cause:** The Client Secret may be incorrect.

**Solution:** Verify your Client Secret in the Shopify Partner Dashboard and update it in Settings.

### Orders not syncing in real-time

**Cause:** Webhooks may not be registered.

**Solution:** Click the **Webhooks** button for your store to register them.

---

## Security Considerations

- **Access tokens** are stored securely in the database and never exposed to the frontend
- **OAuth state tokens** are single-use and expire after 10 minutes
- **Client secrets** are masked in the UI after saving
- All API calls use **HTTPS** encryption
- Store connections are **user-scoped** - you can only see your own stores

---

## Multi-Store Setup

VNT Dash supports connecting multiple Shopify stores, useful for:
- Managing multiple brands
- Separate stores for different regions
- Wholesale vs. retail stores

Each store can be synced independently, and you can set any store as primary for default operations.

---

## Related Documentation

- [Convex Setup Guide](../CONVEX_PORTING_GUIDE.md)
- [VNT Logistics PRD](../VNT_LOGISTICS_PRD.md)

---

*Last updated: January 2026*
