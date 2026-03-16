import { useEffect, useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useAction, usePaginatedQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "../../contexts/AuthContext";
import { Button } from "../../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { 
  ArrowLeft,
  Truck,
  FileText,
  CheckCircle,
  Package,
  DollarSign,
  Printer,
  ClipboardList,
  Download,
} from "lucide-react";
import { formatCurrency, normalizeUiErrorMessage } from "../../lib/utils";
import { toast } from "sonner";
import type { Id } from "../../../convex/_generated/dataModel";
import { PDFDocument } from "pdf-lib";

// Reuse components from orders
import {
  Order,
  OrderItem,
  EditableOrder,
  ColumnVisibility,
  DEFAULT_VISIBLE_COLUMNS,
  OrdersTable,
  BulkActionsToolbar,
  EditOrderModal,
  EditFormData,
  PrintModal,
  DocumentResultsModal,
  DocumentProcessResult,
  SkuPickerModal,
  MultipleOrdersModal,
  CreateAwbModal,
  CancelOrderModal,
  ActivityHistoryModal,
  AddressValidationModal,
  InvalidAddress,
} from "../../components/orders";

import { PickingListFilters } from "./PickingListFilters";

export function PickingListDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  
  // Filters
  const [search, setSearch] = useState("");
  const [deliveryStatusFilter, setDeliveryStatusFilter] = useState("");
  const [docFilters, setDocFilters] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<"order_number" | "printed_time" | "awb_created_time" | "invoice_created_time">("order_number");
  const [visibleColumns, setVisibleColumns] = useState<ColumnVisibility>({
    ...DEFAULT_VISIBLE_COLUMNS,
    status: false,
    placedOn: false,
    paymentMethod: false,
    pickingList: false, // Hide since we're already inside a picking list
  });
  
  // Selection
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  
  // Loading states
  const [generatingAwb, setGeneratingAwb] = useState(false);
  const [creatingInvoices, setCreatingInvoices] = useState(false);
  const [processingBulk, setProcessingBulk] = useState(false);
  const [processingCancel, setProcessingCancel] = useState<string | null>(null);
  const [processingRevert, setProcessingRevert] = useState<string | null>(null);
  const [processingPickingList] = useState<string | null>(null);
  const [processingWorked, setProcessingWorked] = useState<string | null>(null);
  const [processingAwb, setProcessingAwb] = useState<string | null>(null);
  const [processingInvoice, setProcessingInvoice] = useState<string | null>(null);
  const [processingBoth, setProcessingBoth] = useState<string | null>(null);
  const [processingPrint, setProcessingPrint] = useState<string | null>(null);
  const [downloadingAwbPdf, setDownloadingAwbPdf] = useState<string | null>(null);
  const [downloadingInvoicePdf, setDownloadingInvoicePdf] = useState<string | null>(null);
    
  // Modals
  const [editingOrder, setEditingOrder] = useState<EditableOrder | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [showSkuPicker, setShowSkuPicker] = useState(false);
  const [skuSearch, setSkuSearch] = useState("");
  const [viewingMultipleOrders, setViewingMultipleOrders] = useState<{ phone: string; orders: Order[] } | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showGenerationResultsModal, setShowGenerationResultsModal] = useState(false);
  const [isGeneratingInvoices, setIsGeneratingInvoices] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{ phase: string; processed: number; total: number } | null>(null);
  const [printingDocument, setPrintingDocument] = useState(false);
  const [activePrintAction, setActivePrintAction] = useState<"awb" | "invoice" | "both" | null>(null);
  const [printProgress, setPrintProgress] = useState<{ phase: string; processed: number; total: number } | null>(null);
  const [pendingAwbPdfUrls, setPendingAwbPdfUrls] = useState<string[]>([]);
  const [pendingInvoicePdfUrls, setPendingInvoicePdfUrls] = useState<string[]>([]);
  const [documentResults, setDocumentResults] = useState<DocumentProcessResult[]>([]);
  const [showPickingListDropdown, setShowPickingListDropdown] = useState<string | null>(null);
  const [showAwbModal, setShowAwbModal] = useState(false);
  const [showAddressValidationModal, setShowAddressValidationModal] = useState(false);
  const [invalidAddresses, setInvalidAddresses] = useState<InvalidAddress[]>([]);
  const [awbModalProcessing, setAwbModalProcessing] = useState(false);
  // For single order AWB generation
  const [singleAwbOrderId, setSingleAwbOrderId] = useState<string | null>(null);
  // Cancel modal
  const [cancelModalOrderId, setCancelModalOrderId] = useState<string | null>(null);
  const [cancelModalProcessing, setCancelModalProcessing] = useState(false);

  // Activity History modal
  const [viewingHistoryOrder, setViewingHistoryOrder] = useState<Order | null>(null);

  // Queries
  const pickingListMeta = useQuery(
    api.pickingLists.getById,
    token && id ? { token, id: id as Id<"pickingLists"> } : "skip"
  );
  const allOrderIdsInList = useQuery(
    api.pickingLists.getOrderIds,
    token && id ? { token, id: id as Id<"pickingLists"> } : "skip"
  );
  const {
    results: paginatedOrders = [],
    status: paginatedStatus,
    loadMore: loadMoreOrders,
  } = usePaginatedQuery(
    api.pickingLists.listOrdersPaginated,
    token && id ? { token, id: id as Id<"pickingLists"> } : "skip",
    { initialNumItems: 100 }
  );
  
  const skusWithStock = useQuery(api.skus.getWithStock, token && showSkuPicker ? { 
    token, search: skuSearch || undefined 
  } : "skip");
  
  const editItemSkus = editingOrder?.items?.map(i => i.sku).filter(Boolean) as string[] || [];
  const stockForSkus = useQuery(api.skus.getStockForSkus, token && editingOrder && editItemSkus.length > 0 ? {
    token, skuCodes: editItemSkus,
  } : "skip");
  
  // Mutations & Actions
  const setWorkedStatus = useMutation(api.orders.setWorkedStatus);
  const generateBatchAwb = useAction(api.sameday.generateBatchAwb);
  const validateOrdersAddress = useAction(api.sameday.validateOrdersAddress);
  const createBatchInvoices = useAction(api.fgo.createBatchInvoices);
  const stornoBatchAwb = useAction(api.sameday.stornoBatchAwb);
  const stornoBatchInvoices = useAction(api.fgo.stornoBatchInvoices);
  const cancelOrder = useMutation(api.orders.cancel);
  const revertCancel = useMutation(api.orders.revertCancel);
  const cancelOrderInShopify = useAction(api.shopify.cancelOrder);
  const updateCustomerDetails = useMutation(api.orders.updateCustomerDetails);
  const updateOrderItems = useMutation(api.orders.updateItems);
  const updateOrderInShopify = useAction(api.shopify.updateOrderInShopify);
  const lookupPostalCode = useAction(api.sameday.lookupPostalCode);
  const adjustStockBatch = useMutation(api.skus.adjustStockBatch);
  const downloadAwbPdf = useAction(api.sameday.downloadAwbPdf);
  const downloadAwbPdfsBatch = useAction(api.sameday.downloadAwbPdfsBatch);
  const getInvoicePdf = useAction(api.fgo.getInvoicePdf);
  const logPrintBatch = useMutation(api.orders.logPrintBatch);
  const setWorkedStatusBatch = useMutation(api.orders.setWorkedStatusBatch);
  // Single order actions
  const generateAwb = useAction(api.sameday.generateAwb);
  const createInvoice = useAction(api.fgo.createInvoice);
  const stornoAwb = useAction(api.sameday.stornoAwb);
  const stornoInvoice = useAction(api.fgo.stornoInvoice);

  // Convert picking data orders to Order type (includes denormalized fields)
  const ordersAsOrderType = useMemo<Order[]>(() => {
    if (!paginatedOrders?.length) return [];
    return paginatedOrders.map((o: any) => ({
      _id: o._id,
      orderNumber: o.orderNumber,
      shopifyOrderId: o.shopifyOrderId,
      customerName: o.customerName,
      customerEmail: o.customerEmail,
      customerPhone: o.customerPhone,
      shippingAddress: o.shippingAddress,
      notes: o.notes,
      items: o.items,
      totalPrice: o.totalPrice,
      totalShipping: o.totalShipping,
      currency: o.currency,
      status: o.status || "ready",
      fulfillmentStatus: o.fulfillmentStatus,
      deliveryStatus: o.deliveryStatus,
      trackingNumber: o.trackingNumber,
      awbGeneratedAt: o.awbGeneratedAt,
      invoiceNumber: o.invoiceNumber,
      invoiceSeries: o.invoiceSeries,
      invoiceStatus: o.invoiceStatus,
      invoiceCreatedAt: o.invoiceCreatedAt,
      paymentMethod: o.paymentMethod,
      createdAt: o.createdAt,
      placedOn: o.placedOn,
      // Open package detection
      openPackageRequested: o.openPackageRequested,
      customerNote: o.customerNote,
      noteAttributes: o.noteAttributes,
      activityHistory: o.activityHistory,
      // Denormalized fields (instant updates)
      isWorked: o.isWorked,
      workedAt: o.workedAt,
      workedBy: o.workedBy,
      workedByName: o.workedByName,
      stockDeducted: o.stockDeducted,
      stockDeductedAt: o.stockDeductedAt,
      printedAwb: o.printedAwb,
      printedInvoice: o.printedInvoice,
      lastPrintedAt: o.lastPrintedAt,
      lastPrintedBy: o.lastPrintedBy,
      // Return status
      isReturned: o.isReturned,
      returnedAt: o.returnedAt,
      returnId: o.returnId,
    }));
  }, [paginatedOrders]);

  // Filter orders
  const filteredOrders = useMemo(() => {
    let result = ordersAsOrderType;
    
    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(order => 
        order.orderNumber?.toLowerCase().includes(searchLower) ||
        order.customerName?.toLowerCase().includes(searchLower) ||
        order.customerPhone?.toLowerCase().includes(searchLower) ||
        order.notes?.toLowerCase().includes(searchLower) ||
        order.items?.some(i => i.name?.toLowerCase().includes(searchLower) || i.sku?.toLowerCase().includes(searchLower))
      );
    }

    // Delivery status filter (normalize diverse Sameday labels)
    if (deliveryStatusFilter) {
      const classifyDeliveryStatus = (rawStatus?: string): "delivered" | "returned" | "in_transit" | "pending" => {
        const status = (rawStatus || "").toLowerCase();
        if (!status) return "pending";

        if (
          status.includes("livrat cu succes") ||
          status.includes("delivered") ||
          status.includes("livrare reusita")
        ) {
          return "delivered";
        }

        if (
          status.includes("retur") ||
          status.includes("return") ||
          status.includes("returned") ||
          status.includes("refuz") ||
          status.includes("refused")
        ) {
          return "returned";
        }

        if (
          status.includes("tranzit") ||
          status.includes("transit") ||
          status.includes("curier") ||
          status.includes("depozit") ||
          status.includes("livrare")
        ) {
          return "in_transit";
        }

        return "pending";
      };

      result = result.filter(order => classifyDeliveryStatus(order.deliveryStatus) === deliveryStatusFilter);
    }
    
    if (docFilters.length > 0) {
      result = result.filter(order => {
        // Data now directly on order (denormalized)
        const hasBeenPrinted = !!(order.printedAwb || order.printedInvoice);
        const isWorked = !!order.isWorked;
        const hasAwb = !!order.trackingNumber;
        const hasInvoice = !!order.invoiceNumber && order.invoiceStatus !== "storno";
        const isFulfilled = order.fulfillmentStatus === "fulfilled";

        const checks: Record<string, boolean> = {
          worked: isWorked,
          not_worked: !isWorked,
          fulfilled: isFulfilled,
          unfulfilled: !isFulfilled,
          printed: hasBeenPrinted,
          not_printed: !hasBeenPrinted && (hasAwb || hasInvoice),
          has_awb: hasAwb,
          no_awb: !hasAwb,
          has_invoice: hasInvoice,
          no_invoice: !hasInvoice,
          awb_only: hasAwb && !hasInvoice,
          invoice_only: !hasAwb && hasInvoice,
          awb_and_invoice: hasAwb && hasInvoice,
          no_documents: !hasAwb && !hasInvoice,
        };

        return docFilters.every((filterKey) => checks[filterKey]);
      });
    }
    
    const getOrderNumberValue = (value?: string) => parseInt(value?.replace(/\D/g, "") || "0", 10);
    const getPrintedTimeValue = (value?: string) => {
      if (!value) return -1;
      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? -1 : parsed;
    };
    const getAwbCreatedTimeValue = (value?: number) => (typeof value === "number" ? value : -1);
    const getInvoiceCreatedTimeValue = (value?: number) => (typeof value === "number" ? value : -1);

    // Sort with order number tiebreaker
    result.sort((a, b) => {
      const orderNumDiff = getOrderNumberValue(b.orderNumber) - getOrderNumberValue(a.orderNumber);
      if (sortBy === "order_number") return orderNumDiff;

      if (sortBy === "printed_time") {
        const diff = getPrintedTimeValue(b.lastPrintedAt) - getPrintedTimeValue(a.lastPrintedAt);
        return diff !== 0 ? diff : orderNumDiff;
      }

      if (sortBy === "awb_created_time") {
        const diff = getAwbCreatedTimeValue(b.awbGeneratedAt) - getAwbCreatedTimeValue(a.awbGeneratedAt);
        return diff !== 0 ? diff : orderNumDiff;
      }

      const diff = getInvoiceCreatedTimeValue(b.invoiceCreatedAt) - getInvoiceCreatedTimeValue(a.invoiceCreatedAt);
      return diff !== 0 ? diff : orderNumDiff;
    });
    
    return result;
  }, [ordersAsOrderType, search, deliveryStatusFilter, docFilters, sortBy]);
  const filteredOrderIdSet = useMemo(
    () => new Set(filteredOrders.map((order) => order._id)),
    [filteredOrders]
  );

  const phoneOrderCounts = useMemo(() => {
    const counts = new Map<string, number>();
    ordersAsOrderType.forEach(order => {
      if (order.customerPhone && order.status !== "cancelled" && !order.trackingNumber) {
        const phone = order.customerPhone.replace(/\s/g, "").replace(/^\+40/, "0");
        counts.set(phone, (counts.get(phone) || 0) + 1);
      }
    });
    return counts;
  }, [ordersAsOrderType]);

  const workedCount = useMemo(() => {
    if (!ordersAsOrderType) return 0;
    return ordersAsOrderType.filter(o => o.isWorked).length;
  }, [ordersAsOrderType]);
  const totalOrdersInList = allOrderIdsInList?.length ?? 0;
  const loadedStats = useMemo(() => ({
    totalRevenue: ordersAsOrderType.reduce((sum, o) => sum + (o.totalPrice || 0), 0),
    awbsGenerated: ordersAsOrderType.filter((o) => !!o.trackingNumber).length,
    invoicesCreated: ordersAsOrderType.filter((o) => !!o.invoiceNumber).length,
  }), [ordersAsOrderType]);
  const aggregatedProducts = useMemo(() => {
    const productMap = new Map<string, { sku: string; name: string; quantity: number }>();
    for (const order of ordersAsOrderType) {
      for (const item of order.items || []) {
        const key = item.sku || item.name || "unknown";
        const existing = productMap.get(key);
        if (existing) {
          existing.quantity += item.quantity || 1;
        } else {
          productMap.set(key, {
            sku: item.sku || "",
            name: item.name || "",
            quantity: item.quantity || 1,
          });
        }
      }
    }
    return Array.from(productMap.values()).sort((a, b) => b.quantity - a.quantity);
  }, [ordersAsOrderType]);

  const hasActiveFilters = !!(search || deliveryStatusFilter || docFilters.length > 0);

  useEffect(() => {
    // Keep selection aligned with current filtered list to avoid bulk actions on hidden/stale rows.
    setSelectedOrders((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Set<string>();
      for (const orderId of prev) {
        if (filteredOrderIdSet.has(orderId)) {
          next.add(orderId);
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [filteredOrderIdSet]);

  // Handlers
  const handleToggleWorked = async (orderId: string) => {
    if (!token) return;
    setProcessingWorked(orderId);
    const order = ordersAsOrderType.find(o => o._id === orderId);
    const newStatus = !order?.isWorked;
    
    try {
      await setWorkedStatus({
        token,
        orderId: orderId as Id<"shopifyOrders">,
        isWorked: newStatus,
      });
    } catch (error: any) {
      toast.error(normalizeUiErrorMessageLocal(error, "Failed to update work status"));
    } finally {
      setProcessingWorked(null);
    }
  };

  const handleGenerateAllAwbs = async () => {
    if (!token) return;
    if (!allOrderIdsInList) {
      toast.info("Se încarcă comenzile listei. Încearcă din nou imediat.");
      return;
    }
    if (allOrderIdsInList.length === 0) {
      toast.info("Lista nu conține comenzi.");
      return;
    }
    setGeneratingAwb(true);
    try {
      const result = await generateBatchAwb({
        token,
        orderIds: allOrderIdsInList as Id<"shopifyOrders">[],
      });
      if (result.summary.successful > 0) toast.success(`Generate ${result.summary.successful} AWB-uri`);
      if (result.summary.failed > 0) toast.warning(`${result.summary.failed} comenzi eșuate`);
    } catch (error: any) {
      toast.error(normalizeUiErrorMessageLocal(error, "Eroare la generare AWB"));
    } finally {
      setGeneratingAwb(false);
    }
  };

  const handleCreateAllInvoices = async () => {
    if (!token) return;
    if (!allOrderIdsInList) {
      toast.info("Se încarcă comenzile listei. Încearcă din nou imediat.");
      return;
    }
    if (allOrderIdsInList.length === 0) {
      toast.info("Lista nu conține comenzi.");
      return;
    }
    setCreatingInvoices(true);
    setIsGeneratingInvoices(true);
    setShowGenerationResultsModal(true);
    setDocumentResults([]);
    try {
      const orderIds = allOrderIdsInList as Id<"shopifyOrders">[];
      const chunkSize = 5;
      const chunks: Id<"shopifyOrders">[][] = [];
      for (let i = 0; i < orderIds.length; i += chunkSize) {
        chunks.push(orderIds.slice(i, i + chunkSize));
      }

      let processed = 0;
      const allResults: DocumentProcessResult[] = [];
      setGenerationProgress({ phase: "Pornire generare facturi", processed, total: orderIds.length });

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        setGenerationProgress({
          phase: `Se procesează lotul ${i + 1}/${chunks.length}`,
          processed,
          total: orderIds.length,
        });
        const result = await createBatchInvoices({ token, orderIds: chunk });
        allResults.push(
          ...result.results.map((r) => ({
            orderId: r.orderId,
            orderNumber: r.orderNumber,
            action: "Generare factură",
            success: r.success,
            message: r.error,
          }))
        );
        processed += chunk.length;
        setGenerationProgress({ phase: "Generare facturi", processed, total: orderIds.length });
      }

      setDocumentResults(allResults);
      const successCount = allResults.filter((r) => r.success).length;
      const failedCount = allResults.length - successCount;
      if (successCount > 0) toast.success(`Create ${successCount} facturi`);
      if (failedCount > 0) toast.warning(`${failedCount} comenzi eșuate`);
    } catch (error: any) {
      toast.error(normalizeUiErrorMessageLocal(error, "Eroare la creare facturi"));
    } finally {
      setCreatingInvoices(false);
      setIsGeneratingInvoices(false);
      setGenerationProgress(null);
    }
  };

  const handleCancelOrder = (orderId: string) => {
    setCancelModalOrderId(orderId);
  };

  const handleConfirmCancel = async (cancelInShopify: boolean) => {
    if (!token || !cancelModalOrderId) return;
    const orderId = cancelModalOrderId;
    setCancelModalProcessing(true);
    setProcessingCancel(orderId);
    try {
      const order = ordersAsOrderType.find(o => o._id === orderId);
      
      // 1. Cancel locally
      await cancelOrder({ token, orderId: orderId as Id<"shopifyOrders"> });
      
      // 2. Restore stock (non-blocking — don't let stock errors prevent modal close)
      try {
        if (order?.items?.length) {
          const adjustments = order.items.filter(i => i.sku).map(i => ({ sku: i.sku!, quantity: i.quantity }));
          if (adjustments.length > 0) await adjustStockBatch({ token, adjustments });
        }
      } catch (stockError: any) {
        toast.error(`Stoc: ${normalizeUiErrorMessageLocal(stockError, "Eroare la restaurare stoc")}`);
      }
      
      // 3. Cancel in Shopify if requested
      if (cancelInShopify && order?.shopifyOrderId) {
        try {
          await cancelOrderInShopify({
            token,
            orderId: orderId as Id<"shopifyOrders">,
            reason: "other",
            notifyCustomer: false,
            restock: false,
          });
          toast.success("Comandă anulată local + Shopify, stoc restaurat");
        } catch (shopifyError: any) {
          toast.success("Comandă anulată local, stoc restaurat");
          toast.error(`Shopify: ${normalizeUiErrorMessageLocal(shopifyError, "Eroare la anulare în Shopify")}`);
        }
      } else {
        toast.success("Comandă anulată, stoc restaurat");
      }
    } catch (error: any) {
      toast.error(normalizeUiErrorMessageLocal(error, "Eroare la anulare"));
    } finally {
      // Always close modal and reset processing states
      setCancelModalOrderId(null);
      setCancelModalProcessing(false);
      setProcessingCancel(null);
    }
  };

  const handleRevertCancel = async (orderId: string) => {
    if (!token) return;
    setProcessingRevert(orderId);
    try {
      const order = ordersAsOrderType.find(o => o._id === orderId);
      await revertCancel({ token, orderId: orderId as Id<"shopifyOrders"> });
      if (order?.items?.length) {
        const adjustments = order.items.filter(i => i.sku).map(i => ({ sku: i.sku!, quantity: -i.quantity }));
        if (adjustments.length > 0) await adjustStockBatch({ token, adjustments });
      }
      toast.success("Comandă restaurată");
    } catch (error: any) {
      toast.error(normalizeUiErrorMessageLocal(error, "Eroare la restaurare"));
    } finally {
      setProcessingRevert(null);
    }
  };

  // Single order actions - open modal
  const handleGenerateAwb = async (orderId: string) => {
    if (!token) return;
    
    setProcessingAwb(orderId);
    setSingleAwbOrderId(orderId);
    try {
      const validationResult = await validateOrdersAddress({ token, orderIds: [orderId as Id<"shopifyOrders">] });
      if (validationResult.invalid.length > 0) {
        setInvalidAddresses(validationResult.invalid);
        setShowAddressValidationModal(true);
      } else {
        setShowAwbModal(true);
      }
    } catch (error) {
      toast.error(normalizeUiErrorMessageLocal(error, "Eroare la validarea adresei"));
    } finally {
      setProcessingAwb(null);
    }
  };

  const handleGenerateInvoice = async (orderId: string) => {
    if (!token) return;
    setProcessingInvoice(orderId);
    try {
      const result = await createInvoice({ token, orderId: orderId as Id<"shopifyOrders"> });
      if (result.alreadyExists) {
        toast.info(`Factură existentă: ${result.invoice?.series}${result.invoice?.number}`);
      } else {
        toast.success(`Factură generată: ${result.invoice?.series}${result.invoice?.number}`);
      }
    } catch (error: any) {
      toast.error(normalizeUiErrorMessageLocal(error, "Eroare la generare factură"));
    } finally {
      setProcessingInvoice(null);
    }
  };

  const handleStornoAwb = async (orderId: string) => {
    if (!token) return;
    setProcessingAwb(orderId);
    try {
      await stornoAwb({ token, orderId: orderId as Id<"shopifyOrders"> });
      toast.success("AWB stornat");
    } catch (error: any) {
      toast.error(normalizeUiErrorMessageLocal(error, "Eroare la stornare AWB"));
    } finally {
      setProcessingAwb(null);
    }
  };

  const handleStornoInvoice = async (orderId: string) => {
    if (!token) return;
    setProcessingInvoice(orderId);
    try {
      await stornoInvoice({ token, orderId: orderId as Id<"shopifyOrders"> });
      toast.success("Factură stornată");
    } catch (error: any) {
      toast.error(normalizeUiErrorMessageLocal(error, "Eroare la stornare factură"));
    } finally {
      setProcessingInvoice(null);
    }
  };

  const handleGenerateBoth = async (orderId: string) => {
    if (!token) return;
    setProcessingBoth(orderId);
    try {
      const awbResult = await generateAwb({ token, orderId: orderId as Id<"shopifyOrders"> });
      toast.success(`AWB generat: ${awbResult.awbNumber}`);
      
      const invoiceResult = await createInvoice({ token, orderId: orderId as Id<"shopifyOrders"> });
      if (invoiceResult.alreadyExists) {
        toast.info(`Factură existentă: ${invoiceResult.invoice?.series}${invoiceResult.invoice?.number}`);
      } else {
        toast.success(`Factură generată: ${invoiceResult.invoice?.series}${invoiceResult.invoice?.number}`);
      }
    } catch (error: any) {
      toast.error(normalizeUiErrorMessageLocal(error, "Eroare la generare documente"));
    } finally {
      setProcessingBoth(null);
    }
  };

  const handlePrintOrder = async (orderId: string, type: "awb" | "invoice" | "both") => {
    if (!token) return;
    setProcessingPrint(orderId);
    const order = filteredOrders?.find(o => o._id === orderId);
    if (!order) return;
    
    try {
      if (type === "awb" || type === "both") {
        if (order.trackingNumber) {
          const result = await downloadAwbPdf({ token, awbNumber: order.trackingNumber, format: "A6" });
          window.open(URL.createObjectURL(base64ToBlob(result.pdf, "application/pdf")), "_blank");
        }
      }
      
      if (type === "invoice" || type === "both") {
        if (order.invoiceNumber && order.invoiceStatus !== "storno") {
          const result = await getInvoicePdf({ token, orderId: orderId as Id<"shopifyOrders"> });
          window.open(result.pdfUrl, "_blank");
        }
      }
      
      await logPrintBatch({ token, orderIds: [orderId as Id<"shopifyOrders">], documentType: type });
      toast.success("Document deschis pentru printare");
    } catch (error: any) {
      toast.error(normalizeUiErrorMessageLocal(error, "Eroare la printare"));
    } finally {
      setProcessingPrint(null);
    }
  };

  const handleDownloadAwbPdf = async (orderId: string) => {
    if (!token) return;
    setDownloadingAwbPdf(orderId);
    const order = filteredOrders?.find(o => o._id === orderId);
    if (!order?.trackingNumber) {
      toast.error("Comanda nu are AWB");
      setDownloadingAwbPdf(null);
      return;
    }
    
    try {
      const result = await downloadAwbPdf({ token, awbNumber: order.trackingNumber, format: "A6" });
      const blob = base64ToBlob(result.pdf, "application/pdf");
      const url = URL.createObjectURL(blob);
      
      // Open in new tab
      window.open(url, "_blank");
      
      // Also trigger download
      const a = document.createElement("a");
      a.href = url;
      a.download = `AWB-${order.trackingNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      // Revoke URL after a delay to allow both operations to complete
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      
      toast.success(`AWB ${order.trackingNumber} deschis și descărcat`);
    } catch (error: any) {
      toast.error(normalizeUiErrorMessageLocal(error, "Eroare la descărcarea AWB-ului"));
    } finally {
      setDownloadingAwbPdf(null);
    }
  };

  const handleDownloadInvoicePdf = async (orderId: string) => {
    if (!token) return;
    setDownloadingInvoicePdf(orderId);
    const order = filteredOrders?.find(o => o._id === orderId);
    if (!order?.invoiceNumber || order.invoiceStatus === "storno") {
      toast.error("Comanda nu are factură validă");
      setDownloadingInvoicePdf(null);
      return;
    }
    
    try {
      const result = await getInvoicePdf({ token, orderId: orderId as Id<"shopifyOrders"> });
      window.open(result.pdfUrl, "_blank");
      toast.success(`Factura ${order.invoiceSeries || ""}${order.invoiceNumber} deschisă`);
    } catch (error: any) {
      toast.error(normalizeUiErrorMessageLocal(error, "Eroare la descărcarea facturii"));
    } finally {
      setDownloadingInvoicePdf(null);
    }
  };

  const normalizeUiErrorMessageLocal = (error: any, fallback: string) => {
    return normalizeUiErrorMessage(error, fallback);
  };

  const tryUpdateShopifyOrderWithProvinceRecovery = async ({
    authToken,
    orderId,
    form,
    shippingAddressData,
    hasAddressChanges,
    customerName,
    customerEmail,
    customerPhone,
    countryCode,
  }: {
    authToken: string;
    orderId: Id<"shopifyOrders">;
    form: EditFormData;
    shippingAddressData: Record<string, string | boolean | undefined>;
    hasAddressChanges: boolean;
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    countryCode?: string;
  }) => {
    const basePayload = {
      token: authToken,
      orderId,
      customerName,
      customerEmail,
      customerPhone,
    };

    try {
      await updateOrderInShopify({
        ...basePayload,
        shippingAddress: hasAddressChanges ? (shippingAddressData as any) : undefined,
      });
      return;
    } catch (shopifyError: any) {
      if (!form.city?.trim()) throw shopifyError;

      let lookupResult: Awaited<ReturnType<typeof lookupPostalCode>>;
      try {
        lookupResult = await lookupPostalCode({
          token: authToken,
          addressLine1: form.addressLine1 || undefined,
          addressLine2: form.addressLine2 || undefined,
          city: form.city,
          state: form.state || undefined,
          country: form.country || "Romania",
          countryCode: countryCode || "RO",
        });
      } catch {
        throw shopifyError;
      }

      const normalizedCounty = (lookupResult.normalizedCounty || "").trim();
      if (!normalizedCounty) throw shopifyError;
      const normalizedCity = (lookupResult.normalizedCity || "").trim();

      const retryShippingAddress: Record<string, string | boolean | undefined> = {
        ...(hasAddressChanges ? shippingAddressData : {}),
        state: normalizedCounty,
        stateEdited: true,
        ...(normalizedCity ? { city: normalizedCity } : {}),
      };
      if (lookupResult.postalCode) {
        retryShippingAddress.postalCode = lookupResult.postalCode;
      }

      toast.info(`Shopify rejected province. Retrying with "${normalizedCounty}".`);
      await updateOrderInShopify({
        ...basePayload,
        shippingAddress: retryShippingAddress as any,
      });
    }
  };

  const handleSaveEdit = async (form: EditFormData, items: OrderItem[], syncToShopify: boolean) => {
    if (!token || !editingOrder) return;
    setSavingEdit(true);
    try {
      // Only include fields that actually changed (avoids Shopify validation on untouched data)
      const orig = editingOrder;
      const origAddr = orig.shippingAddress;
      const shippingAddressData: Record<string, string | boolean | undefined> = {};
      let hasAddressChanges = false;
      
      if ((form.addressLine1 || "") !== (origAddr?.line1 || "")) { shippingAddressData.line1 = form.addressLine1; hasAddressChanges = true; }
      if ((form.addressLine2 || "") !== (origAddr?.line2 || "")) { shippingAddressData.line2 = form.addressLine2; hasAddressChanges = true; }
      if ((form.city || "") !== (origAddr?.city || "")) { shippingAddressData.city = form.city; hasAddressChanges = true; }
      if ((form.state || "") !== (origAddr?.state || "")) { 
        shippingAddressData.state = form.state; 
        shippingAddressData.stateEdited = true;
        hasAddressChanges = true; 
      } else if (origAddr?.stateCode) {
        shippingAddressData.stateCode = origAddr.stateCode;
      }
      if ((form.postalCode || "") !== (origAddr?.postalCode || origAddr?.zipCode || origAddr?.zip || "")) { shippingAddressData.postalCode = form.postalCode; hasAddressChanges = true; }
      if ((form.country || "") !== (origAddr?.country || "Romania")) { shippingAddressData.country = form.country; hasAddressChanges = true; }

      const nameChanged = (form.customerName || "") !== (orig.customerName || "");
      const emailChanged = (form.customerEmail || "") !== (orig.customerEmail || "");
      const phoneChanged = (form.customerPhone || "") !== (orig.customerPhone || "");

      const stockAdjustments: { sku: string; quantity: number }[] = [];
      const originalItems = editingOrder.items || [];
      
      items.forEach(newItem => {
        if (!newItem.sku) return;
        const originalItem = originalItems.find(oi => oi.sku === newItem.sku);
        const originalQty = originalItem?.quantity || 0;
        if (newItem.quantity !== originalQty) {
          stockAdjustments.push({ sku: newItem.sku, quantity: originalQty - newItem.quantity });
        }
      });
      originalItems.forEach(origItem => {
        if (!origItem.sku) return;
        if (!items.find(ei => ei.sku === origItem.sku)) {
          stockAdjustments.push({ sku: origItem.sku, quantity: origItem.quantity });
        }
      });
      items.forEach(newItem => {
        if (!newItem.sku) return;
        if (!originalItems.find(oi => oi.sku === newItem.sku)) {
          stockAdjustments.push({ sku: newItem.sku, quantity: -newItem.quantity });
        }
      });
      
      if (stockAdjustments.length > 0) {
        await adjustStockBatch({ token, adjustments: stockAdjustments });
      }
      
      const discount = form.discount || 0;
      const itemsSubtotal = items.reduce((sum, item) => sum + (item.price || 0) * item.quantity, 0);
      // totalPrice must include shipping and subtract discounts so AWB ramburs is correct
      const newTotal = itemsSubtotal + (editingOrder.totalShipping || 0) - discount;

      if (syncToShopify) {
        await tryUpdateShopifyOrderWithProvinceRecovery({
          authToken: token,
          orderId: editingOrder._id,
          form,
          shippingAddressData,
          hasAddressChanges,
          customerName: nameChanged ? form.customerName : undefined,
          customerEmail: emailChanged ? form.customerEmail : undefined,
          customerPhone: phoneChanged ? form.customerPhone : undefined,
          countryCode: origAddr?.countryCode,
        });
        const normalizedNotes = form.notes ?? "";
        if (normalizedNotes !== (editingOrder.notes || "")) {
          await updateCustomerDetails({ token, orderId: editingOrder._id, notes: normalizedNotes });
        }
        toast.success("Salvat și sincronizat cu Shopify!");
      } else {
        await updateCustomerDetails({
          token,
          orderId: editingOrder._id,
          customerName: nameChanged ? form.customerName : undefined,
          customerEmail: emailChanged ? form.customerEmail : undefined,
          customerPhone: phoneChanged ? form.customerPhone : undefined,
          shippingAddress: hasAddressChanges ? shippingAddressData as any : undefined,
          notes: form.notes ?? "",
        });
        toast.success("Salvat local!");
      }
      
      const itemsChanged = JSON.stringify(items) !== JSON.stringify(editingOrder.items);
      const discountChanged = discount !== (editingOrder.totalDiscounts || 0);
      if (itemsChanged || discountChanged) {
        await updateOrderItems({ token, orderId: editingOrder._id, items, totalPrice: newTotal || editingOrder.totalPrice, totalDiscounts: discount });
      }
      
      setEditingOrder(null);
    } catch (error: any) {
      toast.error(normalizeUiErrorMessageLocal(error, "Eroare la salvare"));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleAddItemToOrder = (sku: { sku: string; name: string; sellPrice?: number; currentStock: number }) => {
    if (!editingOrder) return;
    setEditingOrder({
      ...editingOrder,
      items: [...(editingOrder.items || []), { sku: sku.sku, name: sku.name, quantity: 1, price: sku.sellPrice || 0 }]
    });
    setShowSkuPicker(false);
    setSkuSearch("");
  };

  const handleSelectAll = () => {
    // If ANY orders are selected, deselect all. Otherwise select all visible.
    // This prevents accidentally selecting new orders that arrived via reactivity.
    const allVisibleSelected = filteredOrders.length > 0 && 
      filteredOrders.every(o => selectedOrders.has(o._id));
    if (allVisibleSelected) {
      setSelectedOrders(new Set());
    } else if (selectedOrders.size > 0) {
      // Some are selected but not all - deselect all (safe default)
      setSelectedOrders(new Set());
    } else {
      // None selected - select all visible
      setSelectedOrders(new Set(filteredOrders.map(o => o._id)));
    }
  };

  const handleSelect = (orderId: string) => {
    const newSelected = new Set(selectedOrders);
    if (newSelected.has(orderId)) newSelected.delete(orderId);
    else newSelected.add(orderId);
    setSelectedOrders(newSelected);
  };

  const handleViewMultipleOrders = (phone: string) => {
    const normalizedPhone = phone.replace(/\s/g, "").replace(/^\+40/, "0");
    const matchingOrders = ordersAsOrderType.filter(o => {
      if (o.status === "cancelled" || o.trackingNumber) return false;
      return o.customerPhone?.replace(/\s/g, "").replace(/^\+40/, "0") === normalizedPhone;
    });
    setViewingMultipleOrders({ phone, orders: matchingOrders });
  };

  // Bulk actions
  const getSelectedOrderIds = () =>
    Array.from(selectedOrders).filter((orderId) => filteredOrderIdSet.has(orderId)) as Id<"shopifyOrders">[];

  // Open AWB modal instead of generating directly
  const handleBulkGenerateAwb = async () => {
    if (!token || selectedOrders.size === 0) return;
    
    const orderIds = getSelectedOrderIds();
    if (orderIds.length === 0) return;

    setSingleAwbOrderId(null);
    setProcessingBulk(true);
    
    try {
      const validationResult = await validateOrdersAddress({ token, orderIds });
      if (validationResult.invalid.length > 0) {
        setInvalidAddresses(validationResult.invalid);
        setShowAddressValidationModal(true);
      } else {
        setShowAwbModal(true);
      }
    } catch (error) {
      toast.error(normalizeUiErrorMessageLocal(error, "Eroare la validarea adreselor"));
    } finally {
      setProcessingBulk(false);
    }
  };
  
  // Handle AWB generation from modal with options
  const handleAwbModalConfirm = async (options: { 
    serviceId: number; 
    openPackage: boolean; 
    serviceTaxIds: number[];
    serviceTaxes: Array<{ id: number; code: string }>;
  }) => {
    if (!token) return;
    setAwbModalProcessing(true);
    setDocumentResults([]);
    try {
      // Single order mode
      if (singleAwbOrderId) {
        const result = await generateAwb({ 
          token, 
          orderId: singleAwbOrderId as Id<"shopifyOrders">,
          serviceId: options.serviceId,
          openPackage: options.openPackage,
          serviceTaxIds: options.serviceTaxIds.length > 0 ? options.serviceTaxIds : undefined,
          serviceTaxes: options.serviceTaxes.length > 0 ? options.serviceTaxes : undefined,
        });
        toast.success(`AWB generat: ${result.awbNumber}`);
      } else {
        // Bulk mode
        const orderIds = getSelectedOrderIds();
        if (orderIds.length === 0) return;

        setProcessingBulk(true);
        setIsGeneratingInvoices(true);
        setShowGenerationResultsModal(true);
        setGenerationProgress({
          phase: "Pornire generare AWB-uri",
          processed: 0,
          total: orderIds.length,
        });
        setShowAwbModal(false);

        const chunkSize = 5;
        const chunks: Id<"shopifyOrders">[][] = [];
        for (let i = 0; i < orderIds.length; i += chunkSize) {
          chunks.push(orderIds.slice(i, i + chunkSize));
        }

        let processed = 0;
        let successful = 0;
        const allResults: DocumentProcessResult[] = [];

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          setGenerationProgress({
            phase: `Generare AWB - lot ${i + 1}/${chunks.length}`,
            processed,
            total: orderIds.length,
          });

          const result = await generateBatchAwb({ 
            token, 
            orderIds: chunk,
            serviceId: options.serviceId,
            openPackage: options.openPackage,
            serviceTaxIds: options.serviceTaxIds.length > 0 ? options.serviceTaxIds : undefined,
            serviceTaxes: options.serviceTaxes.length > 0 ? options.serviceTaxes : undefined,
          });

          const chunkResults: DocumentProcessResult[] = result.results.map((r) => ({
            orderId: r.orderId,
            orderNumber: r.orderNumber,
            action: "Generare AWB",
            success: r.success,
            message: r.error,
          }));
          allResults.push(...chunkResults);
          setDocumentResults((prev) => [...prev, ...chunkResults]);
          successful += chunkResults.filter((r) => r.success).length;
          processed += chunk.length;
          setGenerationProgress({
            phase: "Generare AWB-uri",
            processed,
            total: orderIds.length,
          });
        }

        const failed = allResults.length - successful;
        toast.success(`AWB: ${successful} succes, ${failed} erori`);
      }
      setShowAwbModal(false);
      setSingleAwbOrderId(null);
    } catch (error: any) {
      toast.error(normalizeUiErrorMessageLocal(error, "Eroare la generare AWB"));
    } finally {
      setAwbModalProcessing(false);
      setProcessingBulk(false);
      setIsGeneratingInvoices(false);
      setGenerationProgress(null);
    }
  };

  const handleBulkGenerateInvoice = async () => {
    if (!token || selectedOrders.size === 0) return;
    setProcessingBulk(true);
    setIsGeneratingInvoices(true);
    setDocumentResults([]);
    setShowGenerationResultsModal(true);
    try {
      const orderIds = getSelectedOrderIds();
      const chunkSize = 5;
      const chunks: Id<"shopifyOrders">[][] = [];
      for (let i = 0; i < orderIds.length; i += chunkSize) {
        chunks.push(orderIds.slice(i, i + chunkSize));
      }

      let processed = 0;
      const allResults: DocumentProcessResult[] = [];
      setGenerationProgress({ phase: "Pornire generare facturi", processed, total: orderIds.length });

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        setGenerationProgress({
          phase: `Se procesează lotul ${i + 1}/${chunks.length}`,
          processed,
          total: orderIds.length,
        });
        const result = await createBatchInvoices({ token, orderIds: chunk });
        allResults.push(
          ...result.results.map((r) => ({
            orderId: r.orderId,
            orderNumber: r.orderNumber,
            action: "Generare factură",
            success: r.success,
            message: r.error,
          }))
        );
        processed += chunk.length;
        setGenerationProgress({ phase: "Generare facturi", processed, total: orderIds.length });
      }

      setDocumentResults(allResults);
      const successCount = allResults.filter((r) => r.success).length;
      const failedCount = allResults.length - successCount;
      toast.success(`Facturi: ${successCount} succes, ${failedCount} erori`);
    } catch (error: any) {
      toast.error(error.message || "Eroare la generare facturi");
    } finally {
      setProcessingBulk(false);
      setIsGeneratingInvoices(false);
      setGenerationProgress(null);
    }
  };

  const handleBulkGenerateBoth = async () => {
    if (!token || selectedOrders.size === 0) return;
    const orderIds = getSelectedOrderIds();
    if (orderIds.length === 0) return;

    setProcessingBulk(true);
    setDocumentResults([]);
    setShowGenerationResultsModal(true);
    setIsGeneratingInvoices(true);
    setGenerationProgress({
      phase: "Pornire generare documente",
      processed: 0,
      total: orderIds.length * 2,
    });
    try {
      const chunkSize = 5;
      const chunks: Id<"shopifyOrders">[][] = [];
      for (let i = 0; i < orderIds.length; i += chunkSize) {
        chunks.push(orderIds.slice(i, i + chunkSize));
      }

      let processed = 0;
      let awbSuccess = 0;
      let invoiceSuccess = 0;
      const allResults: DocumentProcessResult[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        setGenerationProgress({
          phase: `Generare AWB - lot ${i + 1}/${chunks.length}`,
          processed,
          total: orderIds.length * 2,
        });

        const awbResult = await generateBatchAwb({ token, orderIds: chunk });
        const awbRunResults = awbResult.results.map((r) => ({
          orderId: r.orderId,
          orderNumber: r.orderNumber,
          action: "Generare AWB",
          success: r.success,
          message: r.error,
        }));
        allResults.push(...awbRunResults);
        setDocumentResults((prev) => [...prev, ...awbRunResults]);
        awbSuccess += awbRunResults.filter((r) => r.success).length;
        processed += chunk.length;
        setGenerationProgress({
          phase: "Generare documente",
          processed,
          total: orderIds.length * 2,
        });
      }

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        setGenerationProgress({
          phase: `Generare facturi - lot ${i + 1}/${chunks.length}`,
          processed,
          total: orderIds.length * 2,
        });

        const invoiceResult = await createBatchInvoices({ token, orderIds: chunk });
        const invoiceRunResults = invoiceResult.results.map((r) => ({
          orderId: r.orderId,
          orderNumber: r.orderNumber,
          action: "Generare factură",
          success: r.success,
          message: r.error,
        }));
        allResults.push(...invoiceRunResults);
        setDocumentResults((prev) => [...prev, ...invoiceRunResults]);
        invoiceSuccess += invoiceRunResults.filter((r) => r.success).length;
        processed += chunk.length;
        setGenerationProgress({
          phase: "Generare documente",
          processed,
          total: orderIds.length * 2,
        });
      }

      toast.success(`AWB: ${awbSuccess}/${orderIds.length}, Facturi: ${invoiceSuccess}/${orderIds.length}`);
    } catch (error: any) {
      toast.error(normalizeUiErrorMessageLocal(error, "Eroare la generare documente"));
    } finally {
      setProcessingBulk(false);
      setIsGeneratingInvoices(false);
      setGenerationProgress(null);
    }
  };

  const handleBulkStornoAwb = async () => {
    if (!token || selectedOrders.size === 0) return;
    setProcessingBulk(true);
    try {
      const result = await stornoBatchAwb({ token, orderIds: getSelectedOrderIds() });
      toast.success(`AWB stornate: ${result.summary.successful}`);
      setSelectedOrders(new Set());
    } catch (error: any) {
      toast.error(normalizeUiErrorMessageLocal(error, "Eroare la stornare AWB"));
    } finally {
      setProcessingBulk(false);
    }
  };

  const handleBulkStornoInvoice = async () => {
    if (!token || selectedOrders.size === 0) return;
    setProcessingBulk(true);
    try {
      const result = await stornoBatchInvoices({ token, orderIds: getSelectedOrderIds() });
      toast.success(`Facturi stornate: ${result.summary.successful}`);
      setSelectedOrders(new Set());
    } catch (error: any) {
      toast.error(normalizeUiErrorMessageLocal(error, "Eroare la stornare facturi"));
    } finally {
      setProcessingBulk(false);
    }
  };

  const handleBulkSetWorked = async (isWorked: boolean) => {
    if (!token || selectedOrders.size === 0) return;
    setProcessingBulk(true);
    try {
      await setWorkedStatusBatch({ token, orderIds: getSelectedOrderIds(), isWorked });
      toast.success(isWorked ? "Comenzi marcate ca lucrate" : "Comenzi demarcate");
      setSelectedOrders(new Set());
    } catch (error: any) {
      toast.error(normalizeUiErrorMessageLocal(error, "Eroare"));
    } finally {
      setProcessingBulk(false);
    }
  };

  // Print handlers
  const base64ToBlob = (base64: string, contentType: string) => {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    return new Blob([new Uint8Array(byteNumbers)], { type: contentType });
  };

  const mergePdfs = async (pdfBase64Array: string[]): Promise<Blob> => {
    const mergedPdf = await PDFDocument.create();
    for (const base64 of pdfBase64Array) {
      try {
        const pdfBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        const pdf = await PDFDocument.load(pdfBytes);
        const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        for (const page of pages) {
          mergedPdf.addPage(page);
        }
      } catch (e) {
        console.warn("Nu s-a putut adăuga un PDF la merge:", e);
      }
    }
    const mergedBytes = await mergedPdf.save();
    return new Blob([mergedBytes.buffer as ArrayBuffer], { type: "application/pdf" });
  };

  const openPdfUrls = (urls: string[]): string[] => {
    const blocked: string[] = [];
    for (const url of urls) {
      const opened = window.open(url, "_blank");
      if (!opened) blocked.push(url);
    }
    return blocked;
  };

  const handleOpenPendingAwbPdfs = () => {
    if (pendingAwbPdfUrls.length === 0) return;
    const blocked = openPdfUrls(pendingAwbPdfUrls);
    setPendingAwbPdfUrls(blocked);
  };

  const handleOpenPendingInvoicePdfs = () => {
    if (pendingInvoicePdfUrls.length === 0) return;
    const blocked = openPdfUrls(pendingInvoicePdfUrls);
    setPendingInvoicePdfUrls(blocked);
  };

  const handlePrintAwb = async () => {
    if (!token || selectedOrders.size === 0) return;
    setPrintingDocument(true);
    setPrintProgress(null);
    setPendingAwbPdfUrls([]);
    setPendingInvoicePdfUrls([]);
    setDocumentResults([]);
    try {
      const ordersToProcess = filteredOrders.filter(o => selectedOrders.has(o._id) && o.trackingNumber);
      if (ordersToProcess.length === 0) {
        toast.error("Nicio comandă selectată nu are AWB");
        return;
      }

      // Smaller chunk => visible progress updates instead of long 0/N periods
      const chunkSize = 10;
      const chunks: typeof ordersToProcess[] = [];
      for (let i = 0; i < ordersToProcess.length; i += chunkSize) {
        chunks.push(ordersToProcess.slice(i, i + chunkSize));
      }

      let processed = 0;
      let failedAwbCount = 0;
      const runResults: DocumentProcessResult[] = [];
      const mergedPdf = await PDFDocument.create();
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunk = chunks[chunkIndex];
        const awbToOrder = new Map(chunk.map((o) => [o.trackingNumber!, o]));
        setPrintProgress({
          phase: `Se procesează lotul ${chunkIndex + 1}/${chunks.length}`,
          processed,
          total: ordersToProcess.length,
        });

        const awbNumbers = chunk.map((o) => o.trackingNumber!).filter(Boolean);
        const batchResult = await downloadAwbPdfsBatch({
          token,
          awbNumbers,
          format: "A6",
          delayMs: 350,
        });

        for (const result of batchResult.results) {
          const relatedOrder = awbToOrder.get(result.awbNumber);
          if (!result.pdf) {
            failedAwbCount += 1;
            if (relatedOrder) {
              runResults.push({
                orderId: relatedOrder._id,
                orderNumber: relatedOrder.orderNumber,
                action: "Print AWB",
                success: false,
                message: result.error || "AWB PDF indisponibil",
              });
            }
            continue;
          }
          try {
            const pdfBytes = Uint8Array.from(atob(result.pdf), c => c.charCodeAt(0));
            const pdf = await PDFDocument.load(pdfBytes);
            const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
            for (const page of pages) {
              mergedPdf.addPage(page);
            }
            if (relatedOrder) {
              runResults.push({
                orderId: relatedOrder._id,
                orderNumber: relatedOrder.orderNumber,
                action: "Print AWB",
                success: true,
              });
            }
          } catch {
            failedAwbCount += 1;
            if (relatedOrder) {
              runResults.push({
                orderId: relatedOrder._id,
                orderNumber: relatedOrder.orderNumber,
                action: "Print AWB",
                success: false,
                message: "PDF invalid la procesare",
              });
            }
          }
        }

        processed += chunk.length;
        setPrintProgress({
          phase: "Descărcare și combinare AWB-uri",
          processed,
          total: ordersToProcess.length,
        });
      }

      if (mergedPdf.getPageCount() > 0) {
        const mergedBytes = await mergedPdf.save();
        const blob = new Blob([mergedBytes.buffer as ArrayBuffer], { type: "application/pdf" });
        const objectUrl = URL.createObjectURL(blob);
        const blocked = openPdfUrls([objectUrl]);
        if (blocked.length > 0) {
          setPendingAwbPdfUrls(blocked);
        }
        setTimeout(() => URL.revokeObjectURL(objectUrl), 600_000);
        const hasFailures = runResults.some((r) => !r.success);
        if (blocked.length === 0 && !hasFailures) {
          setShowPrintModal(false);
          setSelectedOrders(new Set());
        }
      } else {
        toast.error("Nu s-a putut genera niciun PDF AWB valid.");
      }
      setDocumentResults(runResults);
      if (failedAwbCount > 0) {
        toast.warning(`${failedAwbCount} AWB-uri nu au putut fi descărcate, restul au fost procesate.`);
      }
      
      await logPrintBatch({ token, orderIds: ordersToProcess.map(o => o._id) as Id<"shopifyOrders">[], documentType: "awb" });
      toast.success(
        `${ordersToProcess.length} AWB-uri combinate pentru printare`
      );
    } catch (error: any) {
      toast.error(normalizeUiErrorMessageLocal(error, "Eroare la printare AWB"));
    } finally {
      setPrintProgress(null);
      setPrintingDocument(false);
    }
  };

  const handlePrintInvoice = async () => {
    if (!token || selectedOrders.size === 0) return;
    setPrintingDocument(true);
    setPrintProgress(null);
    setPendingAwbPdfUrls([]);
    setPendingInvoicePdfUrls([]);
    setDocumentResults([]);
    try {
      const ordersToProcess = filteredOrders.filter(o => selectedOrders.has(o._id) && o.invoiceNumber && o.invoiceStatus !== "storno");
      if (ordersToProcess.length === 0) {
        toast.error("Nicio comandă selectată nu are factură validă");
        return;
      }
      
      // Download all invoice PDFs
      const pdfBase64Array: string[] = [];
      let failedInvoiceCount = 0;
      const runResults: DocumentProcessResult[] = [];
      for (const order of ordersToProcess) {
        setPrintProgress({
          phase: "Descărcare facturi",
          processed: pdfBase64Array.length,
          total: ordersToProcess.length,
        });
        try {
          const result = await getInvoicePdf({ token, orderId: order._id as Id<"shopifyOrders"> });
          if (result.pdf) {
            pdfBase64Array.push(result.pdf);
            runResults.push({
              orderId: order._id,
              orderNumber: order.orderNumber,
              action: "Print factură",
              success: true,
            });
          } else {
            failedInvoiceCount += 1;
            runResults.push({
              orderId: order._id,
              orderNumber: order.orderNumber,
              action: "Print factură",
              success: false,
              message: "PDF factură indisponibil",
            });
          }
        } catch (err: any) {
          failedInvoiceCount += 1;
          runResults.push({
            orderId: order._id,
            orderNumber: order.orderNumber,
            action: "Print factură",
            success: false,
            message: err?.message || "Eroare la descărcare factură",
          });
        }
      }
      
      if (pdfBase64Array.length > 0) {
        // Merge all PDFs into one and open in a single window
        const mergedBlob = await mergePdfs(pdfBase64Array);
        const objectUrl = URL.createObjectURL(mergedBlob);
        const blocked = openPdfUrls([objectUrl]);
        if (blocked.length > 0) {
          setPendingInvoicePdfUrls(blocked);
        }
        setTimeout(() => URL.revokeObjectURL(objectUrl), 600_000);
        const hasFailures = runResults.some((r) => !r.success);
        if (blocked.length === 0 && !hasFailures) {
          setShowPrintModal(false);
          setSelectedOrders(new Set());
        }
      }
      setDocumentResults(runResults);
      
      await logPrintBatch({ token, orderIds: ordersToProcess.map(o => o._id) as Id<"shopifyOrders">[], documentType: "invoice" });
      toast.success(`${ordersToProcess.length} facturi combinate pentru printare`);
      if (failedInvoiceCount > 0) {
        toast.warning(`${failedInvoiceCount} facturi au eșuat, restul au fost procesate.`);
      }
    } catch (error: any) {
      toast.error(normalizeUiErrorMessageLocal(error, "Eroare la printare facturi"));
    } finally {
      setPrintProgress(null);
      setPrintingDocument(false);
    }
  };

  const handlePrintBoth = async () => {
    if (!token || selectedOrders.size === 0) return;
    setPrintingDocument(true);
    setPrintProgress(null);
    setPendingAwbPdfUrls([]);
    setPendingInvoicePdfUrls([]);
    setDocumentResults([]);
    try {
      const ordersToProcess = filteredOrders.filter(o => selectedOrders.has(o._id));
      
      // Collect AWB and invoice PDFs separately (different page sizes: A6 vs A4)
      const awbPdfs: string[] = [];
      const invoicePdfs: string[] = [];
      let failedAwbCount = 0;
      let failedInvoiceCount = 0;
      const runResults: DocumentProcessResult[] = [];
      
      const ordersWithAwb = ordersToProcess.filter((o) => !!o.trackingNumber);
      const awbChunkSize = 10;
      for (let i = 0; i < ordersWithAwb.length; i += awbChunkSize) {
        const awbChunk = ordersWithAwb.slice(i, i + awbChunkSize);
        setPrintProgress({
          phase: "Descărcare AWB + facturi",
          processed: awbPdfs.length + invoicePdfs.length,
          total: ordersToProcess.length * 2,
        });
        const batchResult = await downloadAwbPdfsBatch({
          token,
          awbNumbers: awbChunk.map((o) => o.trackingNumber!),
          format: "A6",
          delayMs: 350,
        });
        const awbToOrder = new Map(awbChunk.map((o) => [o.trackingNumber!, o]));
        for (const result of batchResult.results) {
          const relatedOrder = awbToOrder.get(result.awbNumber);
          if (result.pdf) {
            awbPdfs.push(result.pdf);
            if (relatedOrder) {
              runResults.push({
                orderId: relatedOrder._id,
                orderNumber: relatedOrder.orderNumber,
                action: "Print AWB",
                success: true,
              });
            }
          } else {
            failedAwbCount += 1;
            if (relatedOrder) {
              runResults.push({
                orderId: relatedOrder._id,
                orderNumber: relatedOrder.orderNumber,
                action: "Print AWB",
                success: false,
                message: result.error || "AWB PDF indisponibil",
              });
            }
          }
        }
      }

      for (const order of ordersToProcess) {
        setPrintProgress({
          phase: "Descărcare AWB + facturi",
          processed: awbPdfs.length + invoicePdfs.length,
          total: ordersToProcess.length * 2,
        });
        if (order.invoiceNumber && order.invoiceStatus !== "storno") {
          try {
            const invoiceResult = await getInvoicePdf({ token, orderId: order._id as Id<"shopifyOrders"> });
            if (invoiceResult.pdf) {
              invoicePdfs.push(invoiceResult.pdf);
              runResults.push({
                orderId: order._id,
                orderNumber: order.orderNumber,
                action: "Print factură",
                success: true,
              });
            } else {
              failedInvoiceCount += 1;
              runResults.push({
                orderId: order._id,
                orderNumber: order.orderNumber,
                action: "Print factură",
                success: false,
                message: "PDF factură indisponibil",
              });
            }
          } catch (err: any) {
            failedInvoiceCount += 1;
            runResults.push({
              orderId: order._id,
              orderNumber: order.orderNumber,
              action: "Print factură",
              success: false,
              message: err?.message || "Eroare la descărcare factură",
            });
          }
        }
      }
      
      const awbUrlsToOpen: string[] = [];
      const invoiceUrlsToOpen: string[] = [];
      if (awbPdfs.length > 0) {
        const awbBlob = await mergePdfs(awbPdfs);
        awbUrlsToOpen.push(URL.createObjectURL(awbBlob));
      }
      
      // Open merged invoices in another window
      if (invoicePdfs.length > 0) {
        const invoiceBlob = await mergePdfs(invoicePdfs);
        invoiceUrlsToOpen.push(URL.createObjectURL(invoiceBlob));
      }
      const urlsToOpen = [...awbUrlsToOpen, ...invoiceUrlsToOpen];

      if (urlsToOpen.length > 0) {
        const blocked = openPdfUrls(urlsToOpen);
        if (blocked.length > 0) {
          setPendingAwbPdfUrls(awbUrlsToOpen.filter((u) => blocked.includes(u)));
          setPendingInvoicePdfUrls(invoiceUrlsToOpen.filter((u) => blocked.includes(u)));
        }
        urlsToOpen.forEach((u) => setTimeout(() => URL.revokeObjectURL(u), 600_000));
        const hasFailures = runResults.some((r) => !r.success);
        if (blocked.length === 0 && !hasFailures) {
          setShowPrintModal(false);
          setSelectedOrders(new Set());
        }
      }
      setDocumentResults(runResults);
      
      await logPrintBatch({ token, orderIds: ordersToProcess.map(o => o._id) as Id<"shopifyOrders">[], documentType: "both" });
      const totalDocs = (awbPdfs.length > 0 ? 1 : 0) + (invoicePdfs.length > 0 ? 1 : 0);
      toast.success(`${totalDocs} document${totalDocs > 1 ? "e" : ""} deschis${totalDocs > 1 ? "e" : ""} pentru printare (${awbPdfs.length} AWB + ${invoicePdfs.length} facturi)`);
      if (failedAwbCount > 0 || failedInvoiceCount > 0) {
        toast.warning(`Eșecuri parțiale: ${failedAwbCount} AWB, ${failedInvoiceCount} facturi.`);
      }
    } catch (error: any) {
      toast.error(normalizeUiErrorMessageLocal(error, "Eroare la printare"));
    } finally {
      setPrintProgress(null);
      setPrintingDocument(false);
    }
  };

  const runPrintAction = (
    action: "awb" | "invoice" | "both",
    handler: () => Promise<void>
  ) => {
    setActivePrintAction(action);
    void handler().finally(() => {
      setActivePrintAction(null);
    });
  };

  const handlePrintAwbFromGenerationResults = () => {
    setShowGenerationResultsModal(false);
    setShowPrintModal(true);
    runPrintAction("awb", handlePrintAwb);
  };

  const handlePrintInvoiceFromGenerationResults = () => {
    setShowGenerationResultsModal(false);
    setShowPrintModal(true);
    runPrintAction("invoice", handlePrintInvoice);
  };

  const handlePrintBothFromGenerationResults = () => {
    setShowGenerationResultsModal(false);
    setShowPrintModal(true);
    runPrintAction("both", handlePrintBoth);
  };

  const getDeliveryStatusColor = (status?: string) => {
    if (!status) return "bg-gray-100 text-gray-700";
    const s = status.toLowerCase();
    if (s.includes("livrat cu succes") || s.includes("delivered")) return "bg-green-100 text-green-700";
    if (s.includes("tranzit") || s.includes("transit")) return "bg-blue-100 text-blue-700";
    if (s.includes("retur") || s.includes("return")) return "bg-red-100 text-red-700";
    return "bg-yellow-100 text-yellow-700";
  };

  // Download orders list as text file
  const handleDownloadOrdersList = () => {
    if (!filteredOrders.length || !pickingListMeta) return;
    
    // Sort orders by order number (ascending)
    const sortedOrders = [...filteredOrders].sort((a, b) => {
      const numA = parseInt(a.orderNumber.replace(/\D/g, "")) || 0;
      const numB = parseInt(b.orderNumber.replace(/\D/g, "")) || 0;
      return numA - numB;
    });
    
    // Build the file content
    const docFilterLabelMap: Record<string, string> = {
      worked: "Lucrate",
      not_worked: "Nelucrate",
      fulfilled: "Fulfilled",
      unfulfilled: "Unfulfilled",
      printed: "Printate",
      not_printed: "Neprintate",
      has_awb: "AWB existent",
      no_awb: "Fara AWB",
      has_invoice: "Factura existenta",
      no_invoice: "Fara factura",
      awb_only: "AWB Only",
      invoice_only: "Invoice Only",
      awb_and_invoice: "AWB + Invoice",
      no_documents: "No Documents",
    };
    const filterLabel = docFilters.length === 0
      ? "Toate"
      : docFilters.map((key) => docFilterLabelMap[key] || key).join(" + ");
    
    const lines = [
      `Picking List: ${pickingListMeta.name}`,
      `Data export: ${new Date().toLocaleString("ro-RO")}`,
      `Filtru: ${filterLabel}`,
      `Total comenzi: ${sortedOrders.length}`,
      "",
      "─".repeat(50),
      "NUMERE COMENZI (în ordine crescătoare):",
      "─".repeat(50),
      "",
      ...sortedOrders.map((order, idx) => `${idx + 1}. #${order.orderNumber}`),
      "",
      "─".repeat(50),
      "DETALII COMENZI:",
      "─".repeat(50),
      "",
      ...sortedOrders.map((order) => {
        const status = order.isWorked ? "✓ Lucrat" : "○ Nelucrat";
        const fulfilled = order.fulfillmentStatus === "fulfilled" ? "Fulfilled" : "Unfulfilled";
        return `#${order.orderNumber} | ${order.customerName || "N/A"} | ${order.customerPhone || "N/A"} | ${status} | ${fulfilled}`;
      }),
    ];
    
    const content = lines.join("\n");
    
    // Create and download file
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const safeListName = pickingListMeta.name.replace(/[^a-zA-Z0-9]/g, "_");
    const safeFilterLabel = filterLabel.replace(/[^a-zA-Z0-9]/g, "_");
    link.download = `${safeListName}_${safeFilterLabel}_${new Date().toISOString().split("T")[0]}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast.success(`Descărcat ${sortedOrders.length} comenzi`);
  };

  // Loading state
  if (pickingListMeta === undefined || (token && id && paginatedStatus === "LoadingFirstPage")) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="grid gap-4 md:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 bg-muted rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!pickingListMeta) {
    return (
      <div className="text-center py-12">
        <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground" />
        <h3 className="mt-4 text-lg font-medium">Lista de picking nu a fost găsită</h3>
        <Link to="/picking-lists">
          <Button className="mt-4">Înapoi la liste</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <Link to="/picking-lists" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors w-fit">
          <ArrowLeft className="h-4 w-4" />
          Înapoi la Picking Lists
        </Link>
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-16 h-16 bg-primary/10 rounded-xl">
              <ClipboardList className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{pickingListMeta.name}</h1>
              <p className="text-muted-foreground">
                Creat: {new Date(pickingListMeta.createdAt).toLocaleDateString('ro-RO')}
              </p>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleDownloadOrdersList}
              disabled={filteredOrders.length === 0}
              title="Descarcă lista cu numerele de comenzi (folosește filtrul curent)"
            >
              <Download className="h-4 w-4 mr-2" />
              Download Lista ({filteredOrders.length})
            </Button>
            <Button variant="outline" size="sm"><Printer className="h-4 w-4 mr-2" />Print List</Button>
            <Button size="sm" variant="outline" onClick={handleGenerateAllAwbs} loading={generatingAwb}>
              <Truck className="h-4 w-4 mr-2" />Generate All AWBs
            </Button>
            <Button size="sm" variant="outline" onClick={handleCreateAllInvoices} loading={creatingInvoices}>
              <FileText className="h-4 w-4 mr-2" />Create All Invoices
            </Button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-100"><Package className="h-5 w-5 text-blue-600" /></div>
          <div><p className="text-sm text-muted-foreground">Total Orders</p><p className="text-2xl font-bold">{totalOrdersInList}</p></div>
        </div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-green-100"><DollarSign className="h-5 w-5 text-green-600" /></div>
          <div><p className="text-sm text-muted-foreground">Loaded Revenue</p><p className="text-2xl font-bold">{formatCurrency(loadedStats.totalRevenue)}</p></div>
        </div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-100"><CheckCircle className="h-5 w-5 text-purple-600" /></div>
          <div><p className="text-sm text-muted-foreground">Loaded Worked</p><p className="text-2xl font-bold">{workedCount}</p></div>
        </div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-orange-100"><Truck className="h-5 w-5 text-orange-600" /></div>
          <div><p className="text-sm text-muted-foreground">Loaded AWBs</p><p className="text-2xl font-bold">{loadedStats.awbsGenerated}</p></div>
        </div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-cyan-100"><FileText className="h-5 w-5 text-cyan-600" /></div>
          <div><p className="text-sm text-muted-foreground">Loaded Invoices</p><p className="text-2xl font-bold">{loadedStats.invoicesCreated}</p></div>
        </div></CardContent></Card>
      </div>

      {/* Products to Pick */}
      {aggregatedProducts.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Products in loaded orders ({aggregatedProducts.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {aggregatedProducts.map((product: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{product.name || product.sku}</p>
                    {product.sku && <p className="text-xs text-muted-foreground font-mono">{product.sku}</p>}
                  </div>
                  <Badge variant="default" className="ml-2 text-lg px-3">{product.quantity}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <PickingListFilters
        search={search}
        onSearchChange={setSearch}
        deliveryStatusFilter={deliveryStatusFilter}
        onDeliveryStatusFilterChange={setDeliveryStatusFilter}
        docFilters={docFilters}
        onToggleDocFilter={(filter) =>
          setDocFilters((prev) =>
            prev.includes(filter) ? prev.filter((f) => f !== filter) : [...prev, filter]
          )
        }
        onClearDocFilters={() => setDocFilters([])}
        sortBy={sortBy}
        onSortByChange={setSortBy}
        workedCount={workedCount}
        visibleColumns={visibleColumns}
        onVisibleColumnsChange={setVisibleColumns}
        displayedCount={filteredOrders.length}
        totalCount={totalOrdersInList}
        onResetFilters={() => { setSearch(""); setDeliveryStatusFilter(""); setDocFilters([]); }}
        hasActiveFilters={hasActiveFilters}
      />

      {/* Bulk Actions */}
      <BulkActionsToolbar
        selectedCount={selectedOrders.size}
        onDeselect={() => setSelectedOrders(new Set())}
        onGenerateAwb={handleBulkGenerateAwb}
        onGenerateInvoice={handleBulkGenerateInvoice}
        onGenerateBoth={handleBulkGenerateBoth}
        onStornoAwb={handleBulkStornoAwb}
        onStornoInvoice={handleBulkStornoInvoice}
        onSetWorked={handleBulkSetWorked}
        onPrint={() => setShowPrintModal(true)}
        isProcessing={processingBulk}
      />

      {/* Orders Table */}
      <OrdersTable
        orders={filteredOrders}
        isLoading={token ? paginatedStatus === "LoadingFirstPage" : false}
        selectedOrders={selectedOrders}
        onSelectAll={handleSelectAll}
        onSelectOrder={handleSelect}
        visibleColumns={visibleColumns}
        phoneOrderCounts={phoneOrderCounts}
        orderPickingListMap={new Map(filteredOrders.map(o => [o._id, [pickingListMeta.name]]))}
        onToggleWorked={handleToggleWorked}
        onEditOrder={setEditingOrder}
        onCancelOrder={handleCancelOrder}
        onRevertCancel={handleRevertCancel}
        onAddToPickingList={() => {}}
        onViewMultipleOrders={handleViewMultipleOrders}
        pickingLists={[]}
        showPickingListDropdown={showPickingListDropdown}
        onTogglePickingListDropdown={setShowPickingListDropdown}
        processingCancel={processingCancel}
        processingRevert={processingRevert}
        processingPickingList={processingPickingList}
        processingWorked={processingWorked}
        getDeliveryStatusColor={getDeliveryStatusColor}
        hasFilters={hasActiveFilters}
        displayedCount={filteredOrders.length}
        totalFilteredCount={filteredOrders.length}
        totalLoadedCount={ordersAsOrderType.length}
        canLoadMore={paginatedStatus === "CanLoadMore"}
        onGenerateAwb={handleGenerateAwb}
        onGenerateInvoice={handleGenerateInvoice}
        onGenerateBoth={handleGenerateBoth}
        onStornoAwb={handleStornoAwb}
        onStornoInvoice={handleStornoInvoice}
        processingAwb={processingAwb}
        processingInvoice={processingInvoice}
        processingBoth={processingBoth}
        onPrint={handlePrintOrder}
        processingPrint={processingPrint}
        onDownloadAwbPdf={handleDownloadAwbPdf}
        downloadingAwbPdf={downloadingAwbPdf}
        onDownloadInvoicePdf={handleDownloadInvoicePdf}
        downloadingInvoicePdf={downloadingInvoicePdf}
        onViewHistory={setViewingHistoryOrder}
        onLoadMore={() => loadMoreOrders(100)}
      />

      {/* Modals */}
      <EditOrderModal
        order={editingOrder}
        onClose={() => setEditingOrder(null)}
        onSave={handleSaveEdit}
        isSaving={savingEdit}
        stockForSkus={stockForSkus}
        onShowSkuPicker={() => setShowSkuPicker(true)}
      />
      <SkuPickerModal
        isOpen={showSkuPicker}
        onClose={() => setShowSkuPicker(false)}
        search={skuSearch}
        onSearchChange={setSkuSearch}
        skus={skusWithStock}
        isLoading={skusWithStock === undefined}
        onSelectSku={handleAddItemToOrder}
      />
      <MultipleOrdersModal
        isOpen={!!viewingMultipleOrders}
        phone={viewingMultipleOrders?.phone || ""}
        orders={viewingMultipleOrders?.orders || []}
        onClose={() => setViewingMultipleOrders(null)}
      />
      <PrintModal
        isOpen={showPrintModal}
        onClose={() => {
          setShowPrintModal(false);
          setDocumentResults([]);
        }}
        selectedCount={selectedOrders.size}
        onPrintAwb={() => runPrintAction("awb", handlePrintAwb)}
        onPrintInvoice={() => runPrintAction("invoice", handlePrintInvoice)}
        onPrintBoth={() => runPrintAction("both", handlePrintBoth)}
        isPrinting={printingDocument}
        activeAction={activePrintAction}
        progress={printProgress}
        pendingAwbPdfCount={pendingAwbPdfUrls.length}
        onOpenPendingAwbPdfs={handleOpenPendingAwbPdfs}
        pendingInvoicePdfCount={pendingInvoicePdfUrls.length}
        onOpenPendingInvoicePdfs={handleOpenPendingInvoicePdfs}
        results={documentResults}
        onClearResults={() => setDocumentResults([])}
      />

      <DocumentResultsModal
        isOpen={showGenerationResultsModal}
        onClose={() => {
          setShowGenerationResultsModal(false);
          setDocumentResults([]);
          setGenerationProgress(null);
          setIsGeneratingInvoices(false);
        }}
        title="Rezultate generare documente"
        results={documentResults}
        isProcessing={isGeneratingInvoices}
        progress={generationProgress}
        onPrintAwb={handlePrintAwbFromGenerationResults}
        onPrintInvoice={handlePrintInvoiceFromGenerationResults}
        onPrintBoth={handlePrintBothFromGenerationResults}
      />

      <CreateAwbModal
        isOpen={showAwbModal}
        onClose={() => {
          setShowAwbModal(false);
          setSingleAwbOrderId(null);
        }}
        onConfirm={handleAwbModalConfirm}
        orderCount={singleAwbOrderId ? 1 : selectedOrders.size}
        isProcessing={awbModalProcessing}
        token={token || ""}
      />

      {(() => {
        const cancelOrderData = cancelModalOrderId ? ordersAsOrderType.find(o => o._id === cancelModalOrderId) : null;
        return (
          <CancelOrderModal
            isOpen={!!cancelModalOrderId}
            onClose={() => setCancelModalOrderId(null)}
            onConfirm={handleConfirmCancel}
            orderNumber={cancelOrderData?.orderNumber || ""}
            hasShopifyOrder={!!cancelOrderData?.shopifyOrderId}
            isProcessing={cancelModalProcessing}
          />
        );
      })()}

      {viewingHistoryOrder && (
        <ActivityHistoryModal
          order={viewingHistoryOrder}
          onClose={() => setViewingHistoryOrder(null)}
        />
      )}

      <AddressValidationModal
        isOpen={showAddressValidationModal}
        onClose={() => {
          setShowAddressValidationModal(false);
          setInvalidAddresses([]);
        }}
        onContinue={() => {
          setShowAddressValidationModal(false);
          setInvalidAddresses([]);
          setShowAwbModal(true);
        }}
        invalidAddresses={invalidAddresses}
        token={token || ""}
      />
    </div>
  );
}
