import type { Id } from "../../../convex/_generated/dataModel";

export interface ShippingAddress {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  stateCode?: string;
  postalCode?: string;
  zipCode?: string;
  zip?: string;
  country?: string;
  countryCode?: string;
}

export interface OrderItem {
  sku?: string;
  name: string;
  quantity: number;
  price?: number;
}

export interface EditableOrder {
  _id: Id<"shopifyOrders">;
  orderNumber: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  shippingAddress?: ShippingAddress;
  notes?: string;
  items?: OrderItem[];
  totalPrice: number;
  totalShipping?: number;
  totalDiscounts?: number;
  paymentMethod?: string;
  invoiceNumber?: string;
  invoiceSeries?: string;
  invoiceStatus?: string;
  invoiceCreatedAt?: number;
  trackingNumber?: string;
  currency?: string;
}

export interface Order {
  _id: string;
  orderNumber: string;
  shopifyOrderId?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  shippingAddress?: ShippingAddress;
  notes?: string;
  items?: OrderItem[];
  totalPrice: number;
  totalShipping?: number;
  totalDiscounts?: number;
  currency?: string;
  status: string;
  fulfillmentStatus?: string;
  deliveryStatus?: string;
  trackingNumber?: string;
  awbGeneratedAt?: number;
  invoiceNumber?: string;
  invoiceSeries?: string;
  invoiceStatus?: string;
  invoiceCreatedAt?: number;
  paymentMethod?: string;
  createdAt?: number;
  placedOn?: string;
  // Denormalized worked status (instant updates)
  isWorked?: boolean;
  workedAt?: string;
  workedBy?: string;
  workedByName?: string;
  // Stock deduction status
  stockDeducted?: boolean;
  stockDeductedAt?: string;
  // Denormalized print status (instant updates)
  lastPrintedAt?: string;
  lastPrintedBy?: string;
  printedAwb?: boolean;
  printedInvoice?: boolean;
  // Denormalized return status (instant updates)
  isReturned?: boolean;
  returnedAt?: string;
  returnId?: string;
  // Open package detection from Shopify
  openPackageRequested?: boolean;
  customerNote?: string;
  noteAttributes?: Array<{ name: string; value: string }>;
  // Activity history
  activityHistory?: ActivityHistoryEntry[];
}

export interface ActivityHistoryEntry {
  timestamp: string;
  action: string;
  description: string;
  details?: Record<string, unknown>;
  userId?: string;
  userName?: string;
}

export interface PrintStatus {
  awb?: boolean;
  invoice?: boolean;
  both?: boolean;
  lastPrintedAt?: string;
}

export interface WorkedStatus {
  isWorked?: boolean;
  workedAt?: string;
}

export interface ColumnVisibility {
  worked: boolean;
  stockDeducted: boolean;
  fulfilled: boolean;
  docs: boolean;
  actions: boolean;
  orderNumber: boolean;
  note: boolean;
  customer: boolean;
  phone: boolean;
  shippingAddress: boolean;
  products: boolean;
  status: boolean;
  pickingList: boolean;
  openPackage: boolean; // Verificare la livrare
  awbNumber: boolean;
  invoiceNumber: boolean;
  placedOn: boolean;
  totalPrice: boolean;
  paymentMethod: boolean;
}

export const DEFAULT_VISIBLE_COLUMNS: ColumnVisibility = {
  worked: true,
  stockDeducted: true,
  fulfilled: true,
  docs: true,
  actions: true,
  orderNumber: true,
  note: true,
  customer: true,
  phone: true,
  shippingAddress: true,
  products: true,
  status: true,
  pickingList: true,
  openPackage: true,
  awbNumber: false,
  invoiceNumber: false,
  placedOn: false,
  totalPrice: false,
  paymentMethod: false,
};

export const COLUMN_LABELS: { key: keyof ColumnVisibility; label: string }[] = [
  { key: "worked", label: "Lucrat" },
  { key: "stockDeducted", label: "Stoc Dedus" },
  { key: "fulfilled", label: "Fulfilled (Shopify)" },
  { key: "docs", label: "Docs Status" },
  { key: "actions", label: "Actions" },
  { key: "orderNumber", label: "Order Number" },
  { key: "note", label: "Note" },
  { key: "customer", label: "Customer" },
  { key: "phone", label: "Phone" },
  { key: "shippingAddress", label: "Shipping Address" },
  { key: "products", label: "Products" },
  { key: "status", label: "Status" },
  { key: "pickingList", label: "Picking List" },
  { key: "openPackage", label: "Verificare Colet" },
  { key: "awbNumber", label: "AWB Number" },
  { key: "invoiceNumber", label: "Invoice Number" },
  { key: "placedOn", label: "Placed On" },
  { key: "totalPrice", label: "Total Price" },
  { key: "paymentMethod", label: "Payment Method" },
];
