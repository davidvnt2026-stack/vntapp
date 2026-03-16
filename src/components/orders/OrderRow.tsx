import React, { useRef, useState } from "react";
import { Badge } from "../ui/Badge";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { 
  Truck, 
  Receipt, 
  Printer, 
  CheckCircle2, 
  Pencil, 
  Plus, 
  X, 
  Undo2, 
  Users,
  Loader2,
  FileStack,
  Download,
  RotateCcw,
  PackageCheck,
  Package,
  Calendar,
  PenLine,
  ArrowDownCircle,
  History,
} from "lucide-react";
import { formatCurrency, cn } from "../../lib/utils";
import { Order, OrderItem, ColumnVisibility, EditableOrder } from "./types";
import type { Id } from "../../../convex/_generated/dataModel";

interface PickingList {
  _id: Id<"pickingLists">;
  name: string;
}

interface OrderRowProps {
  order: Order;
  isSelected: boolean;
  onSelect: (orderId: string) => void;
  visibleColumns: ColumnVisibility;
  phoneCount: number;
  pickingListNames?: string[];
  onToggleWorked?: (orderId: string) => void;
  canToggleWorked?: boolean;
  onEdit: (order: EditableOrder) => void;
  onCancel: (orderId: string) => void;
  onRevert: (orderId: string) => void;
  onAddToPickingList: (orderId: string, useToday: boolean, pickingListId?: Id<"pickingLists">) => void;
  onCreateAndAddToPickingList?: (orderId: string, name: string) => void;
  onViewMultipleOrders: (phone: string) => void;
  pickingLists?: PickingList[];
  showPickingListDropdown: boolean;
  onTogglePickingListDropdown: (orderId: string | null) => void;
  isProcessingCancel: boolean;
  isProcessingRevert: boolean;
  isProcessingPickingList: boolean;
  isProcessingWorked?: boolean;
  getDeliveryStatusColor: (status?: string) => string;
  // Individual order actions
  onGenerateAwb?: (orderId: string) => void;
  onGenerateInvoice?: (orderId: string) => void;
  onGenerateBoth?: (orderId: string) => void;
  onStornoAwb?: (orderId: string) => void;
  onStornoInvoice?: (orderId: string) => void;
  isProcessingAwb?: boolean;
  isProcessingInvoice?: boolean;
  isProcessingBoth?: boolean;
  // Print
  onPrint?: (orderId: string, type: "awb" | "invoice" | "both") => void;
  isProcessingPrint?: boolean;
  // PDF Download
  onDownloadAwbPdf?: (orderId: string) => void;
  isDownloadingAwbPdf?: boolean;
  onDownloadInvoicePdf?: (orderId: string) => void;
  isDownloadingInvoicePdf?: boolean;
  // Activity History
  onViewHistory?: (order: Order) => void;
}

export const OrderRow = React.memo(function OrderRow({
  order,
  isSelected,
  onSelect,
  visibleColumns,
  phoneCount,
  pickingListNames,
  onToggleWorked,
  canToggleWorked = true,
  onEdit,
  onCancel,
  onRevert,
  onAddToPickingList,
  onCreateAndAddToPickingList,
  onViewMultipleOrders,
  pickingLists,
  showPickingListDropdown,
  onTogglePickingListDropdown,
  isProcessingCancel,
  isProcessingRevert,
  isProcessingPickingList,
  isProcessingWorked,
  getDeliveryStatusColor,
  onGenerateAwb,
  onGenerateInvoice,
  onGenerateBoth,
  onStornoAwb,
  onStornoInvoice,
  isProcessingAwb,
  isProcessingInvoice,
  isProcessingBoth,
  onPrint,
  isProcessingPrint,
  onDownloadAwbPdf,
  isDownloadingAwbPdf,
  onDownloadInvoicePdf,
  isDownloadingInvoicePdf,
  onViewHistory,
}: OrderRowProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customName, setCustomName] = useState("");
  
  const hasMultipleOrders = phoneCount > 1;
  const hasAwb = !!order.trackingNumber;
  const awbCancelled = order.deliveryStatus?.toLowerCase().includes("anulat") || 
                       order.deliveryStatus?.toLowerCase().includes("cancel");
  const hasInvoice = !!order.invoiceNumber;
  const invoiceStorno = order.invoiceStatus === "storno";

  const handleEdit = () => {
    onEdit({
      _id: order._id as Id<"shopifyOrders">,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      customerPhone: order.customerPhone,
      shippingAddress: order.shippingAddress,
      notes: order.notes,
      items: order.items,
      totalPrice: order.totalPrice,
      totalShipping: order.totalShipping,
      totalDiscounts: order.totalDiscounts,
      currency: order.currency,
      paymentMethod: order.paymentMethod,
      trackingNumber: order.trackingNumber,
      invoiceNumber: order.invoiceNumber,
      invoiceSeries: order.invoiceSeries,
      invoiceStatus: order.invoiceStatus,
      invoiceCreatedAt: order.invoiceCreatedAt,
    });
  };

  return (
    <tr 
      className={cn(
        "hover:bg-muted/50 transition-colors cursor-pointer",
        order.status === "cancelled" && "opacity-60 bg-red-50/50",
        order.isReturned && "bg-orange-50/40",
        order.isWorked && !order.isReturned && "bg-green-50/30",
        isSelected && "bg-primary/10"
      )}
    >
      {/* Checkbox */}
      <td className="px-3 py-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onSelect(order._id)}
          className="rounded border-input"
        />
      </td>
      
      {/* Worked Status */}
      {visibleColumns.worked && (
        <td className="px-2 py-3 text-center">
          {canToggleWorked && onToggleWorked ? (
            <button
              onClick={() => onToggleWorked(order._id)}
              disabled={isProcessingWorked}
              className={cn(
                "p-1.5 rounded-md transition-colors disabled:opacity-50",
                order.isWorked
                  ? "bg-green-100 text-green-700 hover:bg-green-200"
                  : "text-gray-300 hover:bg-gray-100 hover:text-gray-500"
              )}
              title={order.isWorked
                ? `Lucrat la ${new Date(order.workedAt!).toLocaleString('ro-RO')}`
                : "Marchează ca lucrat"
              }
            >
              {isProcessingWorked ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-5 w-5" />
              )}
            </button>
          ) : (
            <div
              className={cn(
                "inline-flex p-1.5 rounded-md",
                order.isWorked ? "bg-green-100 text-green-700" : "text-gray-300"
              )}
              title={order.isWorked
                ? `Lucrat la ${new Date(order.workedAt!).toLocaleString('ro-RO')}`
                : "Nelucrat"
              }
            >
              <CheckCircle2 className="h-5 w-5" />
            </div>
          )}
          {order.isWorked && order.workedAt && (
            <div className="text-[10px] text-green-600 mt-0.5">
              {new Date(order.workedAt).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
        </td>
      )}
      
      {/* Stock Deducted Status */}
      {visibleColumns.stockDeducted && (
        <td className="px-2 py-3 text-center">
          <div
            className={cn(
              "inline-flex items-center justify-center p-1.5 rounded-md",
              order.stockDeducted
                ? "bg-blue-100 text-blue-700"
                : order.isWorked
                  ? "bg-amber-100 text-amber-600"
                  : "text-gray-300"
            )}
            title={
              order.stockDeducted
                ? `Stoc dedus la ${order.stockDeductedAt ? new Date(order.stockDeductedAt).toLocaleString('ro-RO') : '-'}`
                : order.isWorked
                  ? "Lucrat dar stocul NU a fost dedus"
                  : "Stocul nu a fost dedus"
            }
          >
            <ArrowDownCircle className="h-4 w-4" />
          </div>
          {order.stockDeducted && order.stockDeductedAt && (
            <div className="text-[10px] text-blue-600 mt-0.5">
              {new Date(order.stockDeductedAt).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
        </td>
      )}
      
      {/* Fulfilled Status (Shopify) */}
      {visibleColumns.fulfilled && (
        <td className="px-2 py-3 text-center">
          <div
            className={cn(
              "inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium",
              order.fulfillmentStatus === "fulfilled" && "bg-green-100 text-green-700",
              order.fulfillmentStatus === "partial" && "bg-yellow-100 text-yellow-700",
              (!order.fulfillmentStatus || order.fulfillmentStatus === "unfulfilled") && "bg-gray-100 text-gray-500"
            )}
            title={`Shopify: ${order.fulfillmentStatus || "unfulfilled"}`}
          >
            {order.fulfillmentStatus === "fulfilled" ? (
              <>
                <PackageCheck className="h-3.5 w-3.5" />
                <span>Fulfilled</span>
              </>
            ) : order.fulfillmentStatus === "partial" ? (
              <>
                <Package className="h-3.5 w-3.5" />
                <span>Partial</span>
              </>
            ) : (
              <>
                <Package className="h-3.5 w-3.5" />
                <span>Unfulfilled</span>
              </>
            )}
          </div>
        </td>
      )}
      
      {/* Documents Status */}
      {visibleColumns.docs && (
        <td className="px-2 py-3">
          <div className="flex flex-col gap-1">
            {/* AWB */}
            {hasAwb ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onDownloadAwbPdf && !awbCancelled) {
                    onDownloadAwbPdf(order._id);
                  }
                }}
                disabled={isDownloadingAwbPdf || awbCancelled}
                className={cn(
                  "flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium transition-colors w-full text-left",
                  !awbCancelled && "bg-blue-100 text-blue-700 hover:bg-blue-200 cursor-pointer",
                  awbCancelled && "bg-red-100 text-red-600 line-through cursor-not-allowed",
                  isDownloadingAwbPdf && "opacity-50"
                )}
                title={
                  awbCancelled 
                    ? `AWB anulat: ${order.trackingNumber}` 
                    : `Click pentru a descărca PDF-ul AWB: ${order.trackingNumber}`
                }
              >
                {isDownloadingAwbPdf ? (
                  <Loader2 className="h-3 w-3 flex-shrink-0 animate-spin" />
                ) : (
                  <Download className="h-3 w-3 flex-shrink-0" />
                )}
                <div className="flex flex-col min-w-0">
                  <span className="font-mono">{order.trackingNumber}</span>
                  {order.awbGeneratedAt && (
                    <span className="text-[10px] opacity-75">
                      {new Date(order.awbGeneratedAt).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              </button>
            ) : (
              <div
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-gray-50 text-gray-400"
                title="Fără AWB"
              >
                <Truck className="h-3 w-3 flex-shrink-0" />
                <span>—</span>
              </div>
            )}
            
            {/* Invoice */}
            {hasInvoice && !invoiceStorno ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onDownloadInvoicePdf) {
                    onDownloadInvoicePdf(order._id);
                  }
                }}
                disabled={isDownloadingInvoicePdf}
                className={cn(
                  "flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium transition-colors w-full text-left",
                  "bg-green-100 text-green-700 hover:bg-green-200 cursor-pointer",
                  isDownloadingInvoicePdf && "opacity-50"
                )}
                title={`Click pentru a descărca PDF-ul facturii: ${order.invoiceSeries}${order.invoiceNumber}`}
              >
                {isDownloadingInvoicePdf ? (
                  <Loader2 className="h-3 w-3 flex-shrink-0 animate-spin" />
                ) : (
                  <Download className="h-3 w-3 flex-shrink-0" />
                )}
                <div className="flex flex-col min-w-0">
                  <span className="font-mono truncate max-w-[90px]">
                    {order.invoiceSeries || ""}{order.invoiceNumber}
                  </span>
                  {order.invoiceCreatedAt && (
                    <span className="text-[10px] opacity-75">
                      {new Date(order.invoiceCreatedAt).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              </button>
            ) : (
              <div
                className={cn(
                  "flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium",
                  hasInvoice && invoiceStorno && "bg-red-100 text-red-600 line-through",
                  !hasInvoice && "bg-gray-50 text-gray-400"
                )}
                title={
                  hasInvoice && invoiceStorno ? `Factură stornată: ${order.invoiceSeries}${order.invoiceNumber}` : "Fără factură"
                }
              >
                <Receipt className="h-3 w-3 flex-shrink-0" />
                <span className="truncate max-w-[90px]">
                  {hasInvoice ? `${order.invoiceSeries || ""}${order.invoiceNumber}` : "—"}
                </span>
              </div>
            )}
            
            {/* Print status - only show if there are documents */}
            {(hasAwb || hasInvoice) && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!(order.printedAwb || order.printedInvoice)) return;
                  // Convenience fallback: open existing docs from print-status badge.
                  if (order.printedAwb && onDownloadAwbPdf && !awbCancelled) {
                    onDownloadAwbPdf(order._id);
                    return;
                  }
                  if (order.printedInvoice && onDownloadInvoicePdf) {
                    onDownloadInvoicePdf(order._id);
                  }
                }}
                disabled={!(order.printedAwb || order.printedInvoice)}
                className={cn(
                  "flex items-center gap-1 px-1.5 py-0.5 rounded text-xs text-left",
                  (order.printedAwb || order.printedInvoice) && "bg-purple-100 text-purple-700 hover:bg-purple-200 cursor-pointer",
                  !(order.printedAwb || order.printedInvoice) && "bg-gray-50 text-gray-400 cursor-default"
                )}
                title={
                  order.lastPrintedAt
                    ? `Printat: ${new Date(order.lastPrintedAt).toLocaleString('ro-RO')}. Click pentru a deschide documentul.`
                    : "Neprintat"
                }
              >
                <Printer className="h-3 w-3 flex-shrink-0" />
                <span>
                  {(order.printedAwb || order.printedInvoice)
                    ? (order.lastPrintedAt
                        ? new Date(order.lastPrintedAt).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })
                        : "Printat")
                    : "Neprintat"}
                </span>
              </button>
            )}
          </div>
        </td>
      )}
      
      {/* Actions */}
      {visibleColumns.actions && (
        <td className="px-3 py-3">
          <div className="flex items-center gap-1">
            {/* Generate AWB */}
            {onGenerateAwb && !hasAwb && (
              <button
                onClick={() => onGenerateAwb(order._id)}
                disabled={isProcessingAwb}
                className="p-1.5 hover:bg-blue-100 rounded-md text-blue-600 hover:text-blue-700 disabled:opacity-50"
                title="Generează AWB"
              >
                {isProcessingAwb ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
              </button>
            )}
            {/* Storno AWB */}
            {onStornoAwb && hasAwb && !awbCancelled && (
              <button
                onClick={() => onStornoAwb(order._id)}
                disabled={isProcessingAwb}
                className="p-1.5 hover:bg-red-100 rounded-md text-red-500 hover:text-red-700 disabled:opacity-50"
                title="Stornează AWB"
              >
                <Truck className="h-4 w-4" />
              </button>
            )}
            {/* Generate Invoice */}
            {onGenerateInvoice && !hasInvoice && (
              <button
                onClick={() => onGenerateInvoice(order._id)}
                disabled={isProcessingInvoice}
                className="p-1.5 hover:bg-green-100 rounded-md text-green-600 hover:text-green-700 disabled:opacity-50"
                title="Generează Factură"
              >
                {isProcessingInvoice ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
              </button>
            )}
            {/* Generate Both AWB + Invoice */}
            {onGenerateBoth && !hasAwb && !hasInvoice && (
              <button
                onClick={() => onGenerateBoth(order._id)}
                disabled={isProcessingBoth}
                className="p-1.5 hover:bg-purple-100 rounded-md text-purple-600 hover:text-purple-700 disabled:opacity-50"
                title="Generează AWB + Factură"
              >
                {isProcessingBoth ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileStack className="h-4 w-4" />}
              </button>
            )}
            {/* Storno Invoice */}
            {onStornoInvoice && hasInvoice && !invoiceStorno && (
              <button
                onClick={() => onStornoInvoice(order._id)}
                disabled={isProcessingInvoice}
                className="p-1.5 hover:bg-red-100 rounded-md text-red-500 hover:text-red-700 disabled:opacity-50"
                title="Stornează Factură"
              >
                <Receipt className="h-4 w-4" />
              </button>
            )}
            {/* Print */}
            {onPrint && (hasAwb || hasInvoice) && (
              <div className="relative group">
                <button
                  disabled={isProcessingPrint}
                  className="p-1.5 hover:bg-purple-100 rounded-md text-purple-600 hover:text-purple-700 disabled:opacity-50"
                  title="Printează"
                  onClick={(e) => {
                    e.stopPropagation();
                    // If only one document, print it directly
                    if (hasAwb && !hasInvoice) {
                      onPrint(order._id, "awb");
                    } else if (!hasAwb && hasInvoice) {
                      onPrint(order._id, "invoice");
                    }
                    // If both exist, show dropdown (handled by hover)
                  }}
                >
                  {isProcessingPrint ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                </button>
                {/* Dropdown for print options when both AWB and Invoice exist */}
                {hasAwb && hasInvoice && !isProcessingPrint && (
                  <div className="absolute right-0 top-full mt-1 w-36 bg-card border border-border rounded-lg shadow-lg z-30 hidden group-hover:block">
                    <button
                      onClick={(e) => { e.stopPropagation(); onPrint(order._id, "awb"); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2"
                    >
                      <Truck className="h-3.5 w-3.5" />
                      Print AWB
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onPrint(order._id, "invoice"); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2"
                    >
                      <Receipt className="h-3.5 w-3.5" />
                      Print Factură
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onPrint(order._id, "both"); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2 border-t"
                    >
                      <FileStack className="h-3.5 w-3.5" />
                      Print Ambele
                    </button>
                  </div>
                )}
              </div>
            )}
            {/* Edit */}
            <button
              onClick={handleEdit}
              className="p-1.5 hover:bg-accent rounded-md text-gray-500 hover:text-gray-700"
              title="Editează"
            >
              <Pencil className="h-4 w-4" />
            </button>
            {/* Activity History */}
            {onViewHistory && (
              <button
                onClick={() => onViewHistory(order)}
                className="p-1.5 hover:bg-accent rounded-md text-gray-500 hover:text-gray-700"
                title="Istoric activitate"
              >
                <History className="h-4 w-4" />
              </button>
            )}
          </div>
        </td>
      )}
      
      {/* Order Number */}
      {visibleColumns.orderNumber && (
        <td className="px-3 py-3">
          <div className="flex items-center gap-2">
            <div className="relative" ref={showPickingListDropdown ? dropdownRef : null}>
              <button
                onClick={() => onTogglePickingListDropdown(showPickingListDropdown ? null : order._id)}
                disabled={isProcessingPickingList}
                className="p-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-full disabled:opacity-50"
                title="Adaugă la picking list"
              >
                {isProcessingPickingList ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
              </button>
              
              {showPickingListDropdown && (
                <div className="absolute top-full left-0 mt-1 w-64 bg-card border border-border rounded-lg shadow-lg z-20">
                  {/* Today's Picking List */}
                  <button
                    onClick={() => onAddToPickingList(order._id, true)}
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-accent flex items-center gap-2 border-b font-medium"
                  >
                    <Calendar className="h-4 w-4 text-green-600" />
                    <span>Picking List pentru azi</span>
                  </button>

                  {/* Create Custom Picking List */}
                  {onCreateAndAddToPickingList && (
                    <div className="border-b">
                      {!showCustomInput ? (
                        <button
                          onClick={() => setShowCustomInput(true)}
                          className="w-full text-left px-3 py-2.5 text-sm hover:bg-accent flex items-center gap-2 font-medium"
                        >
                          <PenLine className="h-4 w-4 text-purple-600" />
                          <span>Creează Picking List nou</span>
                        </button>
                      ) : (
                        <div className="p-2 space-y-2">
                          <Input
                            autoFocus
                            placeholder="Nume picking list..."
                            value={customName}
                            onChange={(e) => setCustomName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && customName.trim()) {
                                onCreateAndAddToPickingList(order._id, customName.trim());
                                setCustomName("");
                                setShowCustomInput(false);
                              }
                              if (e.key === "Escape") {
                                setShowCustomInput(false);
                                setCustomName("");
                              }
                            }}
                            className="h-8 text-sm"
                          />
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              className="h-7 text-xs flex-1"
                              onClick={() => {
                                if (customName.trim()) {
                                  onCreateAndAddToPickingList(order._id, customName.trim());
                                  setCustomName("");
                                  setShowCustomInput(false);
                                }
                              }}
                              disabled={!customName.trim()}
                            >
                              Creează & Adaugă
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              onClick={() => {
                                setShowCustomInput(false);
                                setCustomName("");
                              }}
                            >
                              Anulează
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Existing Picking Lists */}
                  {pickingLists && pickingLists.length > 0 && (
                    <>
                      <div className="px-3 py-1.5 text-xs text-muted-foreground font-medium uppercase">
                        Liste existente
                      </div>
                      {pickingLists.slice(0, 5).map((pl) => (
                        <button
                          key={pl._id}
                          onClick={() => onAddToPickingList(order._id, false, pl._id)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2"
                        >
                          <Plus className="h-4 w-4 text-blue-600" />
                          {pl.name}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
            
            <span className="font-mono font-medium">#{order.orderNumber}</span>
            
            {/* Returned Badge */}
            {order.isReturned && (
              <span
                className="flex items-center gap-1 px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded text-xs font-medium"
                title={order.returnedAt ? `Returnat la ${new Date(order.returnedAt).toLocaleString('ro-RO')}` : "Returnat"}
              >
                <RotateCcw className="h-3 w-3" />
                Retur
              </span>
            )}
            
            {order.status === "cancelled" ? (
              <button
                onClick={() => onRevert(order._id)}
                disabled={isProcessingRevert}
                className="p-1 bg-green-100 hover:bg-green-200 text-green-700 rounded-full disabled:opacity-50"
                title="Restaurează comanda"
              >
                {isProcessingRevert ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Undo2 className="h-3.5 w-3.5" />
                )}
              </button>
            ) : (
              <button
                onClick={() => onCancel(order._id)}
                disabled={isProcessingCancel}
                className="p-1 hover:bg-red-100 text-red-500 hover:text-red-700 rounded-full disabled:opacity-50"
                title="Anulează comanda"
              >
                {isProcessingCancel ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <X className="h-3.5 w-3.5" />
                )}
              </button>
            )}
          </div>
        </td>
      )}
      
      {/* Note */}
      {visibleColumns.note && (
        <td className="px-3 py-3">
          {order.notes ? (
            <span className="text-sm text-gray-700 max-w-[150px] truncate block" title={order.notes}>
              {order.notes}
            </span>
          ) : (
            <button
              onClick={handleEdit}
              className="text-sm text-blue-500 hover:text-blue-700"
            >
              + Adaugă notiță
            </button>
          )}
        </td>
      )}
      
      {/* Customer */}
      {visibleColumns.customer && (
        <td className="px-3 py-3">
          <div className="font-medium">{order.customerName || "N/A"}</div>
          <div className="text-xs text-muted-foreground">{order.customerEmail || "No email"}</div>
        </td>
      )}
      
      {/* Phone */}
      {visibleColumns.phone && (
        <td className="px-3 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono">{order.customerPhone || "-"}</span>
            {hasMultipleOrders && (
              <button
                onClick={() => {
                  if (order.customerPhone) onViewMultipleOrders(order.customerPhone);
                }}
                className="flex items-center gap-1 px-1.5 py-0.5 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded-full text-xs font-medium"
                title={`${phoneCount} comenzi active de la acest număr`}
              >
                <Users className="h-3 w-3" />
                {phoneCount}
              </button>
            )}
          </div>
        </td>
      )}
      
      {/* Shipping Address */}
      {visibleColumns.shippingAddress && (
        <td className="px-3 py-3">
          {order.shippingAddress ? (
            <div className="text-sm max-w-[200px]">
              <div className="font-medium">{order.shippingAddress.line1}</div>
              <div className="text-muted-foreground">
                {order.shippingAddress.city}, {order.shippingAddress.state}
                {(order.shippingAddress.postalCode || order.shippingAddress.zipCode || order.shippingAddress.zip) && ` ${order.shippingAddress.postalCode || order.shippingAddress.zipCode || order.shippingAddress.zip}`}
              </div>
              <div className="text-muted-foreground">{order.shippingAddress.country || "Romania"}</div>
            </div>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </td>
      )}
      
      {/* Products */}
      {visibleColumns.products && (
        <td className="px-3 py-3">
          <div className="text-sm max-w-[250px]">
            {order.items?.map((item: OrderItem, idx: number) => (
              <div key={idx} className="truncate">
                {item.name} {item.quantity > 1 && `(x${item.quantity})`}
              </div>
            )).slice(0, 3)}
            {order.items && order.items.length > 3 && (
              <span className="text-muted-foreground">+{order.items.length - 3} more</span>
            )}
          </div>
        </td>
      )}
      
      {/* Status - Sameday Delivery Status */}
      {visibleColumns.status && (
        <td className="px-3 py-3">
          {order.deliveryStatus ? (
            <Badge className={getDeliveryStatusColor(order.deliveryStatus)}>
              {order.deliveryStatus}
            </Badge>
          ) : order.trackingNumber ? (
            <Badge variant="outline" className="text-gray-500">
              Așteaptă sync
            </Badge>
          ) : (
            <Badge variant="outline" className="text-gray-400">
              Fără AWB
            </Badge>
          )}
        </td>
      )}
      
      {/* Picking List */}
      {visibleColumns.pickingList && (
        <td className="px-3 py-3">
          {pickingListNames && pickingListNames.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {pickingListNames.map((name, idx) => (
                <Badge 
                  key={idx} 
                  variant="outline" 
                  className="bg-indigo-50 text-indigo-700 border-indigo-200 text-xs"
                  title={name}
                >
                  {name.length > 20 ? name.slice(0, 20) + "..." : name}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-muted-foreground text-sm">—</span>
          )}
        </td>
      )}
      
      {/* Open Package / Verificare Colet */}
      {visibleColumns.openPackage && (
        <td className="px-3 py-3 text-center">
          {order.openPackageRequested ? (
            <span 
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800"
              title="Clientul a solicitat verificare la livrare"
            >
              <PackageCheck className="h-3.5 w-3.5" />
              VC
            </span>
          ) : (
            <span className="text-muted-foreground text-sm">—</span>
          )}
        </td>
      )}
      
      {/* AWB Number */}
      {visibleColumns.awbNumber && (
        <td className="px-3 py-3">
          {order.trackingNumber ? (
            <span className="font-mono text-sm">{order.trackingNumber}</span>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </td>
      )}
      
      {/* Invoice Number */}
      {visibleColumns.invoiceNumber && (
        <td className="px-3 py-3">
          {order.invoiceNumber ? (
            <span className={cn("font-mono text-sm", order.invoiceStatus === "storno" && "text-red-500 line-through")}>
              {order.invoiceSeries}{order.invoiceNumber}
            </span>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </td>
      )}
      
      {/* Placed On */}
      {visibleColumns.placedOn && (
        <td className="px-3 py-3">
          <span className="text-sm">
            {order.createdAt 
              ? new Date(order.createdAt).toLocaleDateString('ro-RO', { 
                  day: '2-digit', 
                  month: '2-digit', 
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })
              : "-"
            }
          </span>
        </td>
      )}
      
      {/* Total Price */}
      {visibleColumns.totalPrice && (
        <td className="px-3 py-3">
          <span className="font-medium">{formatCurrency(order.totalPrice, order.currency || "RON")}</span>
        </td>
      )}
      
      {/* Payment Method */}
      {visibleColumns.paymentMethod && (
        <td className="px-3 py-3">
          <Badge variant="outline">
            {order.paymentMethod || "N/A"}
          </Badge>
        </td>
      )}
    </tr>
  );
});
