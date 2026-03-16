export interface UserBillingOverview {
  _id: string;
  name?: string;
  email: string;
  isAdmin: boolean;
  pricePerOrder: number | null;
  billingNotes?: string;
  packagingRulesCount: number;
}

export interface PackagingRate {
  _id: string;
  userId: string;
  sku?: string;
  packagingType: string;
  packagingCost: number;
  quantityThreshold: number;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface SkuBreakdownItem {
  sku: string;
  name: string;
  orderCount: number;
  packagingType: string;
  extraCostPerOrder: number;
  totalExtraCost: number;
}

export interface InvoicePeriod {
  startDate: string;
  endDate: string;
}
