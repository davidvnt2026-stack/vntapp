import type { Id } from "../../../convex/_generated/dataModel";

export interface OrderItem {
  sku?: string;
  name?: string;
  quantity: number;
  price?: number;
}

export interface SearchResult {
  _id: Id<"shopifyOrders">;
  orderNumber: string;
  shopifyOrderId: string;
  trackingNumber?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  totalPrice: number;
  status: string;
  fulfillmentStatus?: string;
  items: OrderItem[];
  invoiceNumber?: string;
  invoiceSeries?: string;
  invoiceStatus?: string;
  placedOn: string;
}

export interface DailyReturnGroup {
  date: string;
  totalUnits: number;
  totalOrders: number;
  uniqueSkus: number;
  returns: Array<{
    _id: Id<"returns">;
    awbNumber: string;
    orderNumber?: string;
    customerName?: string;
    returnReason?: string;
    returnStatus?: string;
    returnedItems?: OrderItem[];
  }>;
}
