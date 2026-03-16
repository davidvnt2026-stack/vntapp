import { useRef, useEffect } from "react";
import { Button } from "../ui/Button";
import { Card, CardContent } from "../ui/Card";
import { Package } from "lucide-react";
import { OrderRow } from "./OrderRow";
import { Order, ColumnVisibility, EditableOrder } from "./types";
import type { Id } from "../../../convex/_generated/dataModel";

interface PickingList {
  _id: Id<"pickingLists">;
  name: string;
}

interface OrdersTableProps {
  orders?: Order[];
  isLoading: boolean;
  selectedOrders: Set<string>;
  onSelectAll: () => void;
  onSelectOrder: (orderId: string) => void;
  visibleColumns: ColumnVisibility;
  phoneOrderCounts: Map<string, number>;
  orderPickingListMap?: Map<string, string[]>;
  onToggleWorked?: (orderId: string) => void;
  canToggleWorked?: boolean;
  onEditOrder: (order: EditableOrder) => void;
  onCancelOrder: (orderId: string) => void;
  onRevertCancel: (orderId: string) => void;
  onAddToPickingList: (orderId: string, useToday: boolean, pickingListId?: Id<"pickingLists">) => void;
  onCreateAndAddToPickingList?: (orderId: string, name: string) => void;
  onViewMultipleOrders: (phone: string) => void;
  pickingLists?: PickingList[];
  showPickingListDropdown: string | null;
  onTogglePickingListDropdown: (orderId: string | null) => void;
  processingCancel: string | null;
  processingRevert: string | null;
  processingPickingList: string | null;
  processingWorked?: string | null;
  getDeliveryStatusColor: (status?: string) => string;
  emptyStateTitle?: string;
  hasFilters: boolean;
  // Pagination
  displayedCount: number;
  totalFilteredCount: number;
  totalLoadedCount: number;
  canLoadMore: boolean;
  onLoadMore: () => void;
  // Individual order actions
  onGenerateAwb?: (orderId: string) => void;
  onGenerateInvoice?: (orderId: string) => void;
  onGenerateBoth?: (orderId: string) => void;
  onStornoAwb?: (orderId: string) => void;
  onStornoInvoice?: (orderId: string) => void;
  processingAwb?: string | null;
  processingInvoice?: string | null;
  processingBoth?: string | null;
  // Print
  onPrint?: (orderId: string, type: "awb" | "invoice" | "both") => void;
  processingPrint?: string | null;
  // PDF Download
  onDownloadAwbPdf?: (orderId: string) => void;
  downloadingAwbPdf?: string | null;
  onDownloadInvoicePdf?: (orderId: string) => void;
  downloadingInvoicePdf?: string | null;
  // Activity History
  onViewHistory?: (order: Order) => void;
}

// Separate component to handle indeterminate checkbox state properly
function SelectAllCheckbox({ orders, selectedOrders, onSelectAll }: {
  orders?: Order[];
  selectedOrders: Set<string>;
  onSelectAll: () => void;
}) {
  const checkboxRef = useRef<HTMLInputElement>(null);
  const allSelected = !!(orders && orders.length > 0 && selectedOrders.size === orders.length && orders.every(o => selectedOrders.has(o._id)));
  const someSelected = selectedOrders.size > 0 && !allSelected;

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  return (
    <input
      ref={checkboxRef}
      type="checkbox"
      checked={allSelected}
      onChange={onSelectAll}
      className="rounded border-input"
    />
  );
}

export function OrdersTable({
  orders,
  isLoading,
  selectedOrders,
  onSelectAll,
  onSelectOrder,
  visibleColumns,
  phoneOrderCounts,
  orderPickingListMap,
  onToggleWorked,
  canToggleWorked = true,
  onEditOrder,
  onCancelOrder,
  onRevertCancel,
  onAddToPickingList,
  onCreateAndAddToPickingList,
  onViewMultipleOrders,
  pickingLists,
  showPickingListDropdown,
  onTogglePickingListDropdown,
  processingCancel,
  processingRevert,
  processingPickingList,
  processingWorked,
  getDeliveryStatusColor,
  emptyStateTitle,
  hasFilters,
  displayedCount,
  totalFilteredCount,
  totalLoadedCount,
  canLoadMore,
  onLoadMore,
  onGenerateAwb,
  onGenerateInvoice,
  onGenerateBoth,
  onStornoAwb,
  onStornoInvoice,
  processingAwb,
  processingInvoice,
  processingBoth,
  onPrint,
  processingPrint,
  onDownloadAwbPdf,
  downloadingAwbPdf,
  onDownloadInvoicePdf,
  downloadingInvoicePdf,
  onViewHistory,
}: OrdersTableProps) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-0">
          <div className="p-8 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-r-transparent" />
            <p className="mt-4 text-muted-foreground">Se încarcă comenzile...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!orders || orders.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <div className="p-8 text-center">
            <Package className="h-12 w-12 mx-auto text-muted-foreground" />
            <h3 className="mt-4 text-lg font-medium">{emptyStateTitle || "Nu s-au găsit comenzi"}</h3>
            <p className="mt-2 text-muted-foreground">
              {hasFilters
                ? "Încearcă să ajustezi filtrele"
                : "Sincronizează comenzile din Shopify pentru a începe"}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-border bg-muted/50">
              <tr>
                <th className="px-3 py-3 text-left w-10">
                  <SelectAllCheckbox
                    orders={orders}
                    selectedOrders={selectedOrders}
                    onSelectAll={onSelectAll}
                  />
                </th>
                {visibleColumns.worked && (
                  <th className="px-2 py-3 text-center text-xs font-medium uppercase tracking-wider w-12" title="Lucrat">✓</th>
                )}
                {visibleColumns.stockDeducted && (
                  <th className="px-2 py-3 text-center text-xs font-medium uppercase tracking-wider w-12" title="Stoc Dedus">Stoc</th>
                )}
                {visibleColumns.fulfilled && (
                  <th className="px-2 py-3 text-center text-xs font-medium uppercase tracking-wider min-w-[90px]" title="Fulfilled (Shopify)">Fulfilled</th>
                )}
                {visibleColumns.docs && (
                  <th className="px-2 py-3 text-left text-xs font-medium uppercase tracking-wider min-w-[130px]" title="Documente">Documente</th>
                )}
                {visibleColumns.actions && (
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider w-24">Actions</th>
                )}
                {visibleColumns.orderNumber && (
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider">Order Number</th>
                )}
                {visibleColumns.note && (
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider">Note</th>
                )}
                {visibleColumns.customer && (
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider">Customer</th>
                )}
                {visibleColumns.phone && (
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider">Phone</th>
                )}
                {visibleColumns.shippingAddress && (
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider">Shipping Address</th>
                )}
                {visibleColumns.products && (
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider">Products</th>
                )}
                {visibleColumns.status && (
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider">Status</th>
                )}
                {visibleColumns.pickingList && (
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider">Picking List</th>
                )}
                {visibleColumns.openPackage && (
                  <th className="px-3 py-3 text-center text-xs font-medium uppercase tracking-wider" title="Verificare Colet">VC</th>
                )}
                {visibleColumns.awbNumber && (
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider">AWB Number</th>
                )}
                {visibleColumns.invoiceNumber && (
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider">Invoice Number</th>
                )}
                {visibleColumns.placedOn && (
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider">Placed On</th>
                )}
                {visibleColumns.totalPrice && (
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider">Total Price</th>
                )}
                {visibleColumns.paymentMethod && (
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider">Payment Method</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {orders.map((order) => {
                const normalizedPhone = order.customerPhone?.replace(/\s/g, "").replace(/^\+40/, "0") || "";
                const phoneCount = phoneOrderCounts.get(normalizedPhone) || 0;
                const pickingListNames = orderPickingListMap?.get(order._id) || [];
                
                return (
                  <OrderRow
                    key={order._id}
                    order={order}
                    isSelected={selectedOrders.has(order._id)}
                    onSelect={onSelectOrder}
                    visibleColumns={visibleColumns}
                    phoneCount={phoneCount}
                    pickingListNames={pickingListNames}
                    onToggleWorked={onToggleWorked}
                    canToggleWorked={canToggleWorked}
                    onEdit={onEditOrder}
                    onCancel={onCancelOrder}
                    onRevert={onRevertCancel}
                    onAddToPickingList={onAddToPickingList}
                    onCreateAndAddToPickingList={onCreateAndAddToPickingList}
                    onViewMultipleOrders={onViewMultipleOrders}
                    pickingLists={pickingLists}
                    showPickingListDropdown={showPickingListDropdown === order._id}
                    onTogglePickingListDropdown={onTogglePickingListDropdown}
                    isProcessingCancel={processingCancel === order._id}
                    isProcessingRevert={processingRevert === order._id}
                    isProcessingPickingList={processingPickingList === order._id}
                    isProcessingWorked={processingWorked === order._id}
                    getDeliveryStatusColor={getDeliveryStatusColor}
                    onGenerateAwb={onGenerateAwb}
                    onGenerateInvoice={onGenerateInvoice}
                    onGenerateBoth={onGenerateBoth}
                    onStornoAwb={onStornoAwb}
                    onStornoInvoice={onStornoInvoice}
                    isProcessingAwb={processingAwb === order._id}
                    isProcessingInvoice={processingInvoice === order._id}
                    isProcessingBoth={processingBoth === order._id}
                    onPrint={onPrint}
                    isProcessingPrint={processingPrint === order._id}
                    onDownloadAwbPdf={onDownloadAwbPdf}
                    isDownloadingAwbPdf={downloadingAwbPdf === order._id}
                    onDownloadInvoicePdf={onDownloadInvoicePdf}
                    isDownloadingInvoicePdf={downloadingInvoicePdf === order._id}
                    onViewHistory={onViewHistory}
                  />
                );
              })}
            </tbody>
          </table>
          
          {/* Load More */}
          {(displayedCount < totalFilteredCount || canLoadMore) && (
            <div className="p-4 text-center border-t border-border">
              <Button variant="outline" onClick={onLoadMore}>
                {displayedCount < totalFilteredCount
                  ? `Încarcă mai multe (${totalFilteredCount - displayedCount} rămase din ${totalLoadedCount} încărcate${canLoadMore ? ", + mai multe pe server" : ""})`
                  : `Încarcă următoarele 100 de comenzi (${totalLoadedCount} încărcate)`
                }
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
