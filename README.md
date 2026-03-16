# VNT Dash - Logistics Management System

A multi-tenant warehouse and order fulfillment management system built with **Convex**, **React**, **TypeScript**, and **TailwindCSS**.

## Features

- 🛒 **Shopify Integration** - Sync orders from your Shopify stores
- 📦 **Order Management** - View, filter, and manage all your orders
- 📋 **Picking Lists** - Group orders for efficient warehouse processing
- 🚚 **Sameday AWB Generation** - Create shipping labels automatically
- 🧾 **FGO Invoicing** - Generate invoices via FacturaGO
- 📊 **Dashboard Analytics** - Track orders, revenue, and performance
- 🔐 **Authentication** - Secure login with session management
- 🌓 **Dark Mode** - Beautiful light and dark themes

## Tech Stack

- **Frontend**: React 19 + Vite + TypeScript
- **Backend**: Convex (real-time, serverless)
- **Styling**: TailwindCSS + custom UI components
- **Routing**: React Router v7
- **State**: Convex React hooks (real-time by default)

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Convex

```bash
npx convex dev
```

This will:
- Prompt you to log in to Convex (create a free account at [convex.dev](https://convex.dev))
- Create a new Convex project
- Deploy your schema and functions
- Print your deployment URL

### 3. Configure Environment

Create a `.env.local` file in the project root:

```env
VITE_CONVEX_URL=https://your-deployment.convex.cloud
```

Replace with the URL from step 2.

### 4. Start Development Server

In a **new terminal** (keep Convex dev running):

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

## Project Structure

```
vnt-dash/
├── convex/                 # Convex backend
│   ├── schema.ts          # Database schema (30+ tables)
│   ├── auth.ts            # Authentication functions
│   ├── orders.ts          # Order management
│   ├── pickingLists.ts    # Picking list functions
│   ├── shopify.ts         # Shopify sync action
│   ├── sameday.ts         # AWB generation action
│   ├── fgo.ts             # Invoice generation action
│   ├── connections.ts     # User connections management
│   ├── awb.ts             # AWB tracking
│   └── http.ts            # HTTP endpoints/webhooks
├── src/
│   ├── main.tsx           # App entry point
│   ├── App.tsx            # Routes and providers
│   ├── index.css          # Global styles + Tailwind
│   ├── contexts/
│   │   └── AuthContext.tsx
│   ├── components/
│   │   ├── Layout.tsx     # Main layout with sidebar
│   │   └── ui/            # Reusable UI components
│   ├── pages/
│   │   ├── LoginPage.tsx
│   │   ├── DashboardPage.tsx
│   │   ├── OrdersPage.tsx
│   │   ├── PickingListsPage.tsx
│   │   ├── PickingListDetailPage.tsx
│   │   ├── ConnectionsPage.tsx
│   │   └── SettingsPage.tsx
│   └── lib/
│       └── utils.ts       # Utility functions
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── convex.json
```

## Configuring Integrations

### Shopify

1. Go to your Shopify Admin → Settings → Apps → Develop apps
2. Create a new private app
3. Grant these scopes:
   - `read_orders`, `write_orders`
   - `read_products`
   - `read_fulfillments`, `write_fulfillments`
4. Copy the Admin API access token
5. In VNT Dash, go to Connections → Shopify → Enter your shop URL and token

### Sameday Courier

1. Get your Sameday account credentials
2. Find your Pickup Point ID and Contact Person ID in Sameday dashboard
3. In VNT Dash, go to Connections → Sameday → Enter credentials

### FGO (FacturaGO)

1. Get your FGO API key from the FGO dashboard
2. In VNT Dash, go to Connections → FGO → Enter your VAT number and API key

## Development Commands

```bash
# Start Convex dev server
npx convex dev

# Start frontend dev server
npm run dev

# Build for production
npm run build

# Deploy Convex to production
npx convex deploy

# Open Convex dashboard
npx convex dashboard
```

## Database Schema

The app includes 30+ tables for comprehensive logistics management:

- **User & Auth**: profiles, sessions, userSettings, userConnections
- **Orders**: shopifyOrders, orderWorkStatus, orderPrintLogs
- **Shipping**: awbTracking, pickingLists, pickingListItems
- **Inventory**: items, dailyStockData, monthlyOpeningStock, inboundRecords
- **Warehouse**: warehouseLocations, warehouseStock, warehouseMovements
- **Returns**: returns
- **Integrations**: shopifyStoreConnections, samedayCounties, samedayCities

See `convex/schema.ts` for the complete schema definition.

## License

MIT
