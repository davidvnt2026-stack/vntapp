// Re-export all Sameday functions for api.sameday.* and internal.sameday.* compatibility

export type { AwbOptions } from "./sameday/shared";

export { getAnySamedayConnection, getAllSamedayConnections, getOrdersNeedingStatusUpdate, getOrdersWithAwbs } from "./sameday/internalQueries";

export {
  fetchPickupPoints,
  getServices,
  debugSamedayServices,
} from "./sameday/connectionActions";

export { generateAwb, generateBatchAwb } from "./sameday/awbActions";
export { validateOrdersAddress } from "./sameday/validateAddressAction";
export { searchSamedayCity } from "./sameday/searchCityAction";

export {
  fetchAwbStatus,
  cancelAwb,
  stornoAwb,
  stornoBatchAwb,
} from "./sameday/awbStatusActions";

export {
  syncDeliveryStatus,
  syncAllDeliveryStatuses,
  syncAllDeliveryStatusesCron,
} from "./sameday/syncActions";

export { downloadAwbPdf, downloadAwbPdfsBatch } from "./sameday/pdfActions";

export {
  testPostalCodeLookup,
  testPostalCodeLookupGoogle,
  testPostalCodeLookupHybrid,
  lookupPostalCode,
} from "./sameday/postalCodeActions";
