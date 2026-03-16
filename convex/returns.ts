export type { ReturnStatus, InvoiceSource } from "./returns/shared";

export {
  list,
  getPendingCount,
  getStats,
  getDailyHistory,
  searchOrdersForReturn,
  searchOrder,
  getById,
} from "./returns/queries";

export {
  quickStockReturn,
  create,
  update,
  linkToOrder,
  markAsProcessed,
  cancel,
  deleteReturn,
  markOrderAsReturned,
  unmarkOrderAsReturned,
} from "./returns/mutations";

export { getReturnInternal, markAsProcessedInternal } from "./returns/internal";
export { processReturn } from "./returns/actions";
