# Settings Page Documentation

## Overview

The Settings page (`/settings`) provides users with account management capabilities and application configuration options. It serves as a centralized location for personal settings while directing users to the Connections page for external integrations.

**File Location:** `src/pages/SettingsPage.tsx`

---

## Features

### 1. Profile Management

Allows users to view and update their personal information.

| Field | Editable | Description |
|-------|----------|-------------|
| Email | ❌ No | Display only - cannot be changed after registration |
| Name | ✅ Yes | User's display name |

**API Calls:**
- `api.auth.updateProfile` - Mutation to save profile changes

---

### 2. Password Management

Secure password change functionality with validation.

| Field | Required | Description |
|-------|----------|-------------|
| Current Password | ✅ Yes | Verification of existing password |
| New Password | ✅ Yes | Minimum 6 characters |
| Confirm New Password | ✅ Yes | Must match new password |

**Features:**
- Toggle password visibility (show/hide)
- Client-side validation:
  - Minimum 6 character length
  - Password confirmation match
- Fields clear automatically after successful change

**API Calls:**
- `api.auth.changePassword` - Mutation to update password

---

### 3. Stock Management Settings

Configure how inventory is tracked across the application.

#### Stock Source Options

| Option | Description |
|--------|-------------|
| **Shopify Inventory** | Stock levels sync from connected Shopify stores. Use when Shopify is the source of truth. |
| **Local Inventory** | Manage stock locally within VNT Dash. Orders deduct stock, inbound shipments add stock. |

#### Local Inventory Options

When "Local Inventory" is selected, additional options appear:

| Option | Default | Description |
|--------|---------|-------------|
| Auto-deduct stock on new orders | ✅ Enabled | Automatically reduces stock quantities when new orders come in from Shopify |

**API Calls:**
- `api.settings.get` - Query to load current settings
- `api.settings.updateStockSettings` - Mutation to save stock configuration

---

### 4. External Integrations Link

A prominent card that directs users to the Connections page for managing external service integrations.

**Linked Services (on Connections page):**
- Shopify stores
- Sameday courier
- FGO (Fan Courier)
- Other integrations

**Navigation:** Links to `/connections`

---

### 5. Account Information

Read-only display of account metadata.

| Field | Format | Description |
|-------|--------|-------------|
| Account ID | Truncated (8 chars) | Internal user identifier |
| Member Since | Romanian date format | Account creation date |

---

## Component Structure

```
SettingsPage
├── Header
│   ├── Title: "Settings"
│   └── Subtitle: "Manage your account settings"
│
├── Profile Card
│   ├── Icon: User (primary color)
│   ├── Email (disabled input)
│   ├── Name (editable input)
│   └── Save Changes button
│
├── Password Card
│   ├── Icon: Lock (primary color)
│   ├── Current Password input
│   ├── New Password input
│   ├── Confirm Password input (with visibility toggle)
│   └── Change Password button
│
├── Stock Management Card
│   ├── Icon: Package (orange)
│   ├── Radio: Shopify Inventory
│   ├── Radio: Local Inventory
│   ├── Checkbox: Auto-deduct (conditional)
│   └── Save Stock Settings button
│
├── Integrations Link Card
│   ├── Icon: Link2 (green)
│   ├── Description text
│   └── "Go to Connections" button
│
└── Account Information Card
    ├── Account ID
    └── Member Since date
```

---

## State Management

### Local State

| State Variable | Type | Purpose |
|----------------|------|---------|
| `name` | `string` | Current name input value |
| `currentPassword` | `string` | Current password input |
| `newPassword` | `string` | New password input |
| `confirmPassword` | `string` | Password confirmation input |
| `showPasswords` | `boolean` | Toggle password visibility |
| `savingProfile` | `boolean` | Profile save loading state |
| `savingPassword` | `boolean` | Password save loading state |
| `stockManagement` | `"shopify" \| "local"` | Selected stock source |
| `autoDeductStock` | `boolean` | Auto-deduct toggle |
| `savingStock` | `boolean` | Stock settings save loading state |

### Data Fetching

| Query | Condition | Purpose |
|-------|-----------|---------|
| `api.settings.get` | `token` present | Load user's stock settings |

---

## UI/UX Design

### Layout
- Single-column layout with `max-w-2xl` constraint
- Vertical card stack with consistent `gap-6` spacing
- `animate-fade-in` entrance animation

### Card Styling
- Each card has an icon in a colored badge
- Consistent header structure with title and description
- Form inputs use the shared `Input` component

### Color Scheme

| Section | Icon Background | Icon Color |
|---------|-----------------|------------|
| Profile | `bg-primary/10` | `text-primary` |
| Password | `bg-primary/10` | `text-primary` |
| Stock Management | `bg-orange-100` | `text-orange-600` |
| Integrations | `bg-green-100` | `text-green-600` |

### Integrations Card Special Styling
- Gradient background: `from-green-50 to-emerald-50`
- Green border: `border-green-200`
- Horizontal layout with button on right

---

## Dependencies

### External Libraries
- `react` - Core React hooks
- `convex/react` - `useQuery`, `useMutation` for data
- `react-router-dom` - `Link` for navigation
- `lucide-react` - Icons (User, Lock, Eye, EyeOff, Package, Link2)
- `sonner` - Toast notifications

### Internal Dependencies
- `AuthContext` - User authentication state
- `Button` - UI button component
- `Input` - UI input component
- `Card` components - UI card layout

### Convex API Endpoints

| Endpoint | Type | File |
|----------|------|------|
| `api.auth.updateProfile` | Mutation | `convex/auth.ts` |
| `api.auth.changePassword` | Mutation | `convex/auth.ts` |
| `api.settings.get` | Query | `convex/settings.ts` |
| `api.settings.updateStockSettings` | Mutation | `convex/settings.ts` |

---

## Error Handling

All form submissions include:
1. Loading states on buttons (`loading` prop)
2. Try/catch blocks with toast notifications
3. Client-side validation before API calls

**Toast Messages:**
- Success: "Profile updated", "Password changed", "Stock settings saved"
- Error: Displays `error.message` or fallback text

---

## Related Pages

| Page | Path | Relationship |
|------|------|--------------|
| Connections | `/connections` | External integrations (Shopify OAuth, Sameday, FGO) |
| Login | `/login` | Authentication entry point |
| Dashboard | `/` | Main application view |
