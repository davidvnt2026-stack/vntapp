// Shared types and utilities for Sameday API integration

export type AwbResult = {
  success: true;
  alreadyExists?: boolean;
  awbNumber: string;
  message?: string;
};

export type BatchAwbResult = {
  results: Array<{
    orderId: string;
    orderNumber: string;
    success: boolean;
    awbNumber?: string;
    error?: string;
  }>;
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
};

export type PdfResult = {
  pdf: string;
  contentType: string;
  filename: string;
};

// Service type from Sameday API
export type SamedayService = {
  id: number;
  name: string;
  code: string;
  isCrossborder?: boolean;
  deliveryType?: string;
  serviceOptionalTaxes?: Array<{
    id: number;
    name: string;
    code: string;
    packageType?: number;
  }>;
};

// AWB Options for generation (used in frontend)
export type AwbOptions = {
  serviceId?: number;
  openPackage?: boolean; // Customer can check products upon delivery (OD)
  serviceTaxIds?: number[]; // Extra service tax IDs (legacy, just IDs)
  serviceTaxes?: Array<{ id: number; code: string }>; // Tax IDs with their codes for proper formatting
};

export type SamedayAuthResult = {
  token: string;
  expireAt?: string;
};

export type SamedayStatusResponse = {
  expeditionStatus: {
    status: string;
    statusLabel: string;
    statusState: string;
  };
  expeditionHistory: Array<{
    status: string;
    statusLabel: string;
    date: string;
    county?: string;
    transitLocation?: string;
  }>;
  summary?: {
    deliveredAt?: string;
  };
};

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
