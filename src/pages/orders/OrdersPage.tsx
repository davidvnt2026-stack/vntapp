import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation, useAction, usePaginatedQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "../../contexts/AuthContext";
import { normalizeUiErrorMessage } from "../../lib/utils";
import { useStore } from "../../contexts/StoreContext";
import { Button } from "../../components/ui/Button";
import { Truck, RefreshCw } from "lucide-react";
import { cn } from "../../lib/utils";
import { toast } from "sonner";
import type { Id } from "../../../convex/_generated/dataModel";
import { base64ToBlob } from "../../lib/pdfUtils";
import { classifyDeliveryStatus, getDeliveryStatusColor } from "./filterUtils";
import { useOrdersPrintHandlers } from "./useOrdersPrintHandlers";
import { useOrdersBulkHandlers } from "./useOrdersBulkHandlers";

// Import modular components
import {
  Order,
  OrderItem,
  EditableOrder,
  ColumnVisibility,
  DEFAULT_VISIBLE_COLUMNS,
  OrdersFilters,
  OrdersTable,
  BulkActionsToolbar,
  EditOrderModal,
  EditFormData,
  PickingListSelection,
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

export function OrdersPage() {
  const { token } = useAuth();
  const { selectedShopDomain } = useStore();

  // ============================================
  // STATE
  // ============================================

  // Filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [fulfillmentFilter, setFulfillmentFilter] = useState("");
  const [deliveryStatusFilter, setDeliveryStatusFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [pendingStartDate, setPendingStartDate] = useState("");
  const [pendingEndDate, setPendingEndDate] = useState("");
  const [spamOnly, setSpamOnly] = useState(false);
  const [displayLimit, setDisplayLimit] = useState(100);
  const [docFilter, setDocFilter] = useState("all");

  // Debounce search input (300ms) to avoid hammering the backend on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const [visibleColumns, setVisibleColumns] = useState<ColumnVisibility>({
    ...DEFAULT_VISIBLE_COLUMNS,
    worked: false,
  });

  // Selection
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());

  // Loading states
  const [syncing, setSyncing] = useState(false);
  const [syncingDeliveryStatus, setSyncingDeliveryStatus] = useState(false);
  const [processingCancel, setProcessingCancel] = useState<string | null>(null);
  const [processingRevert, setProcessingRevert] = useState<string | null>(null);
  const [processingPickingList, setProcessingPickingList] = useState<string | null>(null);
  const [processingBulk, setProcessingBulk] = useState(false);
  const [processingPrint, setProcessingPrint] = useState<string | null>(null);
  const [downloadingAwbPdf, setDownloadingAwbPdf] = useState<string | null>(null);
  const [downloadingInvoicePdf, setDownloadingInvoicePdf] = useState<string | null>(null);

  // Modals
  const [editingOrder, setEditingOrder] = useState<EditableOrder | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [savingEditAndAdding, setSavingEditAndAdding] = useState(false);
  const [showSkuPicker, setShowSkuPicker] = useState(false);
  const [skuSearch, setSkuSearch] = useState("");
  const [viewingMultipleOrders, setViewingMultipleOrders] = useState<{ phone: string; orders: Order[] } | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showGenerationResultsModal, setShowGenerationResultsModal] = useState(false);
  const [isGeneratingInvoices, setIsGeneratingInvoices] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{ phase: string; processed: number; total: number } | null>(null);
  const [printingDocument, setPrintingDocument] = useState(false);
  const [printProgress, setPrintProgress] = useState<{ phase: string; processed: number; total: number } | null>(null);
  const [activePrintAction, setActivePrintAction] = useState<"awb" | "invoice" | "both" | null>(null);
  const [pendingAwbPdfUrls, setPendingAwbPdfUrls] = useState<string[]>([]);
  const [pendingInvoicePdfUrls, setPendingInvoicePdfUrls] = useState<string[]>([]);
  const [documentResults, setDocumentResults] = useState<DocumentProcessResult[]>([]);
  const [showPickingListDropdown, setShowPickingListDropdown] = useState<string | null>(null);
  const [showAwbModal, setShowAwbModal] = useState(false);
  const [showAddressValidationModal, setShowAddressValidationModal] = useState(false);
  const [invalidAddresses, setInvalidAddresses] = useState<InvalidAddress[]>([]);
  const [awbModalProcessing, setAwbModalProcessing] = useState(false);
  const [cancelModalOrderId, setCancelModalOrderId] = useState<string | null>(null);
  const [cancelModalProcessing, setCancelModalProcessing] = useState(false);
  const [viewingHistoryOrder, setViewingHistoryOrder] = useState<Order | null>(null);

  const pickingListDropdownRef = useRef<HTMLDivElement>(null);
  const loadMoreScrollYRef = useRef<number | null>(null);

  // ============================================
  // QUERIES
  // ============================================

  // Paginated orders: initial small load, then load older pages on demand.
  const {
    results: allOrders = [],
    status: paginatedStatus,
    loadMore: loadMoreOrders,
  } = usePaginatedQuery(
    api.orders.listPaginated,
    token
      ? {
          token,
          shopDomain: selectedShopDomain || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        }
      : "skip",
    {
      initialNumItems: 100,
    }
  );

  // Compute spam count client-side from already-loaded orders (avoids extra DB query)
  const spamCount = useMemo(() => {
    if (!allOrders.length) return 0;
    const phoneZipMap = new Map<string, number>();
    allOrders.forEach(order => {
      const phone = order.customerPhone?.replace(/\s/g, "") || "";
      const zip = order.shippingAddress?.postalCode || order.shippingAddress?.zipCode || order.shippingAddress?.zip || "";
      const key = `${phone}_${zip}`;
      phoneZipMap.set(key, (phoneZipMap.get(key) || 0) + 1);
    });
    let count = 0;
    allOrders.forEach(order => {
      const phone = order.customerPhone?.replace(/\s/g, "") || "";
      const zip = order.shippingAddress?.postalCode || order.shippingAddress?.zipCode || order.shippingAddress?.zip || "";
      const key = `${phone}_${zip}`;
      if ((phoneZipMap.get(key) || 0) > 1) count++;
    });
    return count;
  }, [allOrders]);
  const pickingLists = useQuery(api.pickingLists.list, token ? { token, shopDomain: selectedShopDomain || undefined } : "skip");
  const editingOrderFromDb = useQuery(
    api.orders.getById,
    token && editingOrder
      ? { token, id: editingOrder._id as Id<"shopifyOrders"> }
      : "skip"
  );
  const isEditingOrderHydrating = !!editingOrder && editingOrderFromDb === undefined;
  const editingOrderResolved =
    editingOrderFromDb === undefined
      ? editingOrder
      : (editingOrderFromDb as EditableOrder | null);
  const skusWithStock = useQuery(api.skus.getWithStock, token && showSkuPicker ? {
    token,
    search: skuSearch || undefined
  } : "skip");
  const hasClientSideSearchMatch = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    if (term.length < 2) return false;
    const digitsOnly = term.replace(/\D/g, "");
    const isPhoneLike = digitsOnly.length >= 7 && /^\+?[\d\s\-().]+$/.test(debouncedSearch.trim());
    return allOrders.some(order =>
      order.orderNumber?.toLowerCase().includes(term) ||
      order.customerName?.toLowerCase().includes(term) ||
      order.customerPhone?.toLowerCase().includes(term) ||
      (isPhoneLike && (order.customerPhone?.replace(/\D/g, "") || "").includes(digitsOnly)) ||
      order.customerEmail?.toLowerCase().includes(term) ||
      order.notes?.toLowerCase().includes(term) ||
      order.trackingNumber?.toLowerCase().includes(term) ||
      order.items?.some((i: OrderItem) => i.name?.toLowerCase().includes(term) || i.sku?.toLowerCase().includes(term))
    );
  }, [allOrders, debouncedSearch]);

  // Only hit backend fallback when there are no client-side search hits in loaded data.
  const searchFallbackOrders = useQuery(
    api.orders.searchByText,
    token && debouncedSearch.trim().length >= 2 && !hasClientSideSearchMatch
      ? {
          token,
          search: debouncedSearch.trim(),
          shopDomain: selectedShopDomain || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          limit: 150,
        }
      : "skip"
  );

  // Get stock for items in edit modal
  const editItemSkus = editingOrderResolved?.items?.map(i => i.sku).filter(Boolean) as string[] || [];
  const stockForSkus = useQuery(api.skus.getStockForSkus, token && editingOrderResolved && editItemSkus.length > 0 ? {
    token,
    skuCodes: editItemSkus,
  } : "skip");

  useEffect(() => {
    if (editingOrder && editingOrderFromDb === null) {
      toast.error("Comanda nu a putut fi incarcata.");
      setEditingOrder(null);
    }
  }, [editingOrder, editingOrderFromDb]);

  // ============================================
  // MUTATIONS & ACTIONS
  // ============================================

  const syncOrders = useAction(api.shopify.syncOrders);
  const syncAllDeliveryStatuses = useAction(api.sameday.syncAllDeliveryStatuses);
  const addSingleOrder = useMutation(api.pickingLists.addSingleOrder);
  const addOrdersToPickingList = useMutation(api.pickingLists.addOrders);
  const getOrCreateTodayPickingList = useMutation(api.pickingLists.getOrCreateToday);
  const createPickingList = useMutation(api.pickingLists.create);
  const cancelOrder = useMutation(api.orders.cancel);
  const revertCancel = useMutation(api.orders.revertCancel);
  const cancelOrderInShopify = useAction(api.shopify.cancelOrder);
  const updateCustomerDetails = useMutation(api.orders.updateCustomerDetails);
  const updateOrderItems = useMutation(api.orders.updateItems);
  const updateOrderInShopify = useAction(api.shopify.updateOrderInShopify);
  const lookupPostalCode = useAction(api.sameday.lookupPostalCode);
  const adjustStockBatch = useMutation(api.skus.adjustStockBatch);
  const generateBatchAwb = useAction(api.sameday.generateBatchAwb);
  const validateOrdersAddress = useAction(api.sameday.validateOrdersAddress);
  const createInvoice = useAction(api.fgo.createInvoice);
  const createBatchInvoices = useAction(api.fgo.createBatchInvoices);
  const stornoBatchAwb = useAction(api.sameday.stornoBatchAwb);
  const stornoBatchInvoices = useAction(api.fgo.stornoBatchInvoices);
  const downloadAwbPdf = useAction(api.sameday.downloadAwbPdf);
  const downloadAwbPdfsBatch = useAction(api.sameday.downloadAwbPdfsBatch);
  const getInvoicePdf = useAction(api.fgo.getInvoicePdf);
  const logPrintBatch = useMutation(api.orders.logPrintBatch);
  const setWorkedStatusBatch = useMutation(api.orders.setWorkedStatusBatch);

  // ============================================
  // COMPUTED VALUES (all filtering is client-side for instant UX)
  // ============================================

  // Apply all filters client-side
  const filteredOrders = useMemo(() => {
    let result = [...allOrders];

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      const searchDigits = search.replace(/\D/g, "");
      const isPhoneLike = searchDigits.length >= 7 && /^\+?[\d\s\-().]+$/.test(search);
      result = result.filter(order =>
        order.orderNumber?.toLowerCase().includes(searchLower) ||
        order.customerName?.toLowerCase().includes(searchLower) ||
        order.customerPhone?.toLowerCase().includes(searchLower) ||
        (isPhoneLike && (order.customerPhone?.replace(/\D/g, "") || "").includes(searchDigits)) ||
        order.customerEmail?.toLowerCase().includes(searchLower) ||
        order.notes?.toLowerCase().includes(searchLower) ||
        order.trackingNumber?.toLowerCase().includes(searchLower) ||
        order.items?.some((i: OrderItem) => i.name?.toLowerCase().includes(searchLower) || i.sku?.toLowerCase().includes(searchLower))
      );
    }

    // Status filter
    if (statusFilter) {
      result = result.filter(order => order.status === statusFilter);
    }

    // Fulfillment status filter
    if (fulfillmentFilter) {
      result = result.filter(order => order.fulfillmentStatus === fulfillmentFilter);
    }

    // Delivery status filter (normalize diverse Sameday labels)
    if (deliveryStatusFilter) {
      result = result.filter(order => {
        return classifyDeliveryStatus(order.deliveryStatus) === deliveryStatusFilter;
      });
    }

    // Date filters
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      result = result.filter(order => {
        const createdAt = order.createdAt;
        if (typeof createdAt !== "number") return false;
        return new Date(createdAt) >= start;
      });
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      result = result.filter(order => {
        const createdAt = order.createdAt;
        if (typeof createdAt !== "number") return false;
        return new Date(createdAt) <= end;
      });
    }

    // Spam filter (duplicate phone + zip)
    if (spamOnly) {
      const phoneZipMap = new Map<string, number>();
      result.forEach(order => {
        const phone = order.customerPhone?.replace(/\s/g, "") || "";
        const zip = order.shippingAddress?.postalCode || order.shippingAddress?.zipCode || order.shippingAddress?.zip || "";
        const key = `${phone}_${zip}`;
        phoneZipMap.set(key, (phoneZipMap.get(key) || 0) + 1);
      });
      result = result.filter(order => {
        const phone = order.customerPhone?.replace(/\s/g, "") || "";
        const zip = order.shippingAddress?.postalCode || order.shippingAddress?.zipCode || order.shippingAddress?.zip || "";
        const key = `${phone}_${zip}`;
        return (phoneZipMap.get(key) || 0) > 1;
      });
    }

    // Document filter
    if (docFilter !== "all") {
      result = result.filter(order => {
        const hasBeenPrinted = !!(order.printedAwb || order.printedInvoice);
        const isWorked = !!order.isWorked;
        const isReturned = !!order.isReturned;
        const isFulfilled = order.fulfillmentStatus === "fulfilled";
        const hasAwb = !!order.trackingNumber;
        const hasInvoice = !!order.invoiceNumber && order.invoiceStatus !== "storno";

        switch (docFilter) {
          case "worked": return isWorked;
          case "not_worked": return !isWorked;
          case "returned": return isReturned;
          case "not_returned": return !isReturned;
          case "fulfilled": return isFulfilled;
          case "unfulfilled": return !isFulfilled;
          case "printed": return hasBeenPrinted;
          case "not_printed": return !hasBeenPrinted && (hasAwb || hasInvoice);
          case "awb_only": return hasAwb && !hasInvoice;
          case "invoice_only": return !hasAwb && hasInvoice;
          case "awb_and_invoice": return hasAwb && hasInvoice;
          case "no_documents": return !hasAwb && !hasInvoice;
          default: return true;
        }
      });
    }

    // Sort by order number descending (numeric) for consistent display
    result.sort((a, b) => {
      const numA = parseInt(a.orderNumber?.replace(/\D/g, "") || "0", 10);
      const numB = parseInt(b.orderNumber?.replace(/\D/g, "") || "0", 10);
      return numB - numA;
    });

    return result;
  }, [allOrders, search, statusFilter, fulfillmentFilter, deliveryStatusFilter, startDate, endDate, spamOnly, docFilter]);

  const fallbackFilteredOrders = useMemo(() => {
    let result = [...((searchFallbackOrders as Order[] | undefined) || [])];

    if (statusFilter) {
      result = result.filter(order => order.status === statusFilter);
    }
    if (fulfillmentFilter) {
      result = result.filter(order => order.fulfillmentStatus === fulfillmentFilter);
    }
    if (deliveryStatusFilter) {
      result = result.filter(order => {
        return classifyDeliveryStatus(order.deliveryStatus) === deliveryStatusFilter;
      });
    }
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      result = result.filter(order => {
        const createdAt = order.createdAt;
        if (typeof createdAt !== "number") return false;
        return new Date(createdAt) >= start;
      });
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      result = result.filter(order => {
        const createdAt = order.createdAt;
        if (typeof createdAt !== "number") return false;
        return new Date(createdAt) <= end;
      });
    }
    if (spamOnly) {
      const phoneZipMap = new Map<string, number>();
      result.forEach(order => {
        const phone = order.customerPhone?.replace(/\s/g, "") || "";
        const zip = order.shippingAddress?.postalCode || order.shippingAddress?.zipCode || order.shippingAddress?.zip || "";
        const key = `${phone}_${zip}`;
        phoneZipMap.set(key, (phoneZipMap.get(key) || 0) + 1);
      });
      result = result.filter(order => {
        const phone = order.customerPhone?.replace(/\s/g, "") || "";
        const zip = order.shippingAddress?.postalCode || order.shippingAddress?.zipCode || order.shippingAddress?.zip || "";
        const key = `${phone}_${zip}`;
        return (phoneZipMap.get(key) || 0) > 1;
      });
    }
    if (docFilter !== "all") {
      result = result.filter(order => {
        const hasBeenPrinted = !!(order.printedAwb || order.printedInvoice);
        const isWorked = !!order.isWorked;
        const isReturned = !!order.isReturned;
        const isFulfilled = order.fulfillmentStatus === "fulfilled";
        const hasAwb = !!order.trackingNumber;
        const hasInvoice = !!order.invoiceNumber && order.invoiceStatus !== "storno";

        switch (docFilter) {
          case "worked": return isWorked;
          case "not_worked": return !isWorked;
          case "returned": return isReturned;
          case "not_returned": return !isReturned;
          case "fulfilled": return isFulfilled;
          case "unfulfilled": return !isFulfilled;
          case "printed": return hasBeenPrinted;
          case "not_printed": return !hasBeenPrinted && (hasAwb || hasInvoice);
          case "awb_only": return hasAwb && !hasInvoice;
          case "invoice_only": return !hasAwb && hasInvoice;
          case "awb_and_invoice": return hasAwb && hasInvoice;
          case "no_documents": return !hasAwb && !hasInvoice;
          default: return true;
        }
      });
    }

    result.sort((a, b) => {
      const numA = parseInt(a.orderNumber?.replace(/\D/g, "") || "0", 10);
      const numB = parseInt(b.orderNumber?.replace(/\D/g, "") || "0", 10);
      return numB - numA;
    });

    return result;
  }, [searchFallbackOrders, statusFilter, fulfillmentFilter, deliveryStatusFilter, startDate, endDate, spamOnly, docFilter]);

  const effectiveFilteredOrders = useMemo(() => {
    if (!search.trim()) return filteredOrders;
    if (filteredOrders.length > 0) return filteredOrders;
    return fallbackFilteredOrders;
  }, [filteredOrders, search, fallbackFilteredOrders]);

  const displayedOrders = effectiveFilteredOrders?.slice(0, displayLimit) as Order[];
  useEffect(() => {
    if (loadMoreScrollYRef.current === null) return;
    const targetY = loadMoreScrollYRef.current;
    // Keep viewport anchored where user clicked "Load more"
    requestAnimationFrame(() => {
      window.scrollTo({ top: targetY });
    });
    const timer = window.setTimeout(() => {
      window.scrollTo({ top: targetY });
      loadMoreScrollYRef.current = null;
    }, 120);
    return () => window.clearTimeout(timer);
  }, [displayedOrders.length, allOrders.length]);

  const filteredOrderIdSet = useMemo(
    () => new Set<string>(effectiveFilteredOrders.map((order) => String(order._id))),
    [effectiveFilteredOrders]
  );
  const displayedOrderIds = displayedOrders.map((order) => order._id as Id<"shopifyOrders">);
  const pickingListMappings = useQuery(
    api.pickingLists.getOrderPickingListMappingsForOrders,
    token
      ? {
          token,
          orderIds: displayedOrderIds,
          shopDomain: selectedShopDomain || undefined,
        }
      : "skip"
  );

  const phoneOrderCounts = useMemo(() => {
    const counts = new Map<string, number>();
    allOrders.forEach(order => {
      if (order.customerPhone && order.status !== "cancelled" && !order.trackingNumber) {
        const phone = order.customerPhone.replace(/\s/g, "").replace(/^\+40/, "0");
        counts.set(phone, (counts.get(phone) || 0) + 1);
      }
    });
    return counts;
  }, [allOrders]);

  const workedCount = useMemo(() => {
    if (!effectiveFilteredOrders) return 0;
    return effectiveFilteredOrders.filter(o => o.isWorked).length;
  }, [effectiveFilteredOrders]);

  // Create a map of orderId -> picking list names
  const orderPickingListMap = useMemo(() => {
    if (!pickingListMappings) return new Map<string, string[]>();
    const map = new Map<string, string[]>();
    for (const mapping of pickingListMappings) {
      const existing = map.get(mapping.orderId) || [];
      existing.push(mapping.pickingListName);
      map.set(mapping.orderId, existing);
    }
    return map;
  }, [pickingListMappings]);

  const hasActiveFilters = !!(startDate || endDate || spamOnly || statusFilter || fulfillmentFilter || deliveryStatusFilter || docFilter !== "all");

  const getSelectedOrderIds = () =>
    Array.from(selectedOrders).filter((orderId) => filteredOrderIdSet.has(orderId)) as Id<"shopifyOrders">[];

  const selectedOrdersWithOpenPackage = useMemo(() => {
    if (!displayedOrders) return { count: 0, hasAny: false };
    const selectedOrderData = displayedOrders.filter(o => selectedOrders.has(o._id));
    const count = selectedOrderData.filter(o => o.openPackageRequested).length;
    return { count, hasAny: count > 0 };
  }, [displayedOrders, selectedOrders]);

  const bulkHandlers = useOrdersBulkHandlers({
    token,
    selectedOrders,
    selectedShopDomain,
    getSelectedOrderIds,
    setSelectedOrders,
    setProcessingBulk,
    setDocumentResults,
    setShowGenerationResultsModal,
    setShowAwbModal,
    setShowAddressValidationModal,
    setInvalidAddresses,
    validateOrdersAddress,
    setGenerationProgress,
    setIsGeneratingInvoices,
    setAwbModalProcessing,
    generateBatchAwb,
    createBatchInvoices,
    stornoBatchAwb,
    stornoBatchInvoices,
    setWorkedStatusBatch,
    addOrdersToPickingList,
    getOrCreateTodayPickingList,
    createPickingList,
  });

  const printHandlers = useOrdersPrintHandlers({
    token,
    displayedOrders,
    selectedOrders,
    pendingAwbPdfUrls,
    pendingInvoicePdfUrls,
    setPrintingDocument,
    setPrintProgress,
    setPendingAwbPdfUrls,
    setPendingInvoicePdfUrls,
    setDocumentResults,
    setShowPrintModal,
    setSelectedOrders,
    downloadAwbPdfsBatch,
    getInvoicePdf,
    logPrintBatch,
  });

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
    runPrintAction("awb", printHandlers.handlePrintAwb);
  };

  const handlePrintInvoiceFromGenerationResults = () => {
    setShowGenerationResultsModal(false);
    setShowPrintModal(true);
    runPrintAction("invoice", printHandlers.handlePrintInvoice);
  };

  const handlePrintBothFromGenerationResults = () => {
    setShowGenerationResultsModal(false);
    setShowPrintModal(true);
    runPrintAction("both", printHandlers.handlePrintBoth);
  };

  // ============================================
  // EFFECTS
  // ============================================

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickingListDropdownRef.current && !pickingListDropdownRef.current.contains(e.target as Node)) {
        setShowPickingListDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

  // ============================================
  // HANDLERS
  // ============================================

  const handleSync = async () => {
    if (!token) return;
    setSyncing(true);
    try {
      const result = await syncOrders({ token, shopDomain: selectedShopDomain || undefined });
      toast.success(result.message);
    } catch (error: any) {
      toast.error(normalizeUiErrorMessageLocal(error, "Eroare la sincronizare"));
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncDeliveryStatuses = async () => {
    if (!token) return;
    setSyncingDeliveryStatus(true);
    try {
      const result = await syncAllDeliveryStatuses({ token });
      toast.success(`Sincronizat ${result.synced} statusuri, ${result.failed} erori`);
    } catch (error: any) {
      toast.error(normalizeUiErrorMessageLocal(error, "Eroare la sincronizare status livrare"));
    } finally {
      setSyncingDeliveryStatus(false);
    }
  };

  const handleAddToPickingList = async (orderId: string, useToday: boolean, pickingListId?: Id<"pickingLists">) => {
    if (!token) return;
    setProcessingPickingList(orderId);
    try {
      const result = await addSingleOrder({
        token,
        orderId: orderId as Id<"shopifyOrders">,
        useToday,
        pickingListId,
        shopDomain: selectedShopDomain || undefined,
      });
      if (result.alreadyExists) {
        toast.info(`Comanda există deja în ${result.pickingListName}`);
      } else {
        toast.success(`Adăugat în ${result.pickingListName}`);
      }
      setShowPickingListDropdown(null);
    } catch (error: any) {
      toast.error(normalizeUiErrorMessageLocal(error, "Eroare la adăugare"));
    } finally {
      setProcessingPickingList(null);
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
      const order = allOrders.find(o => o._id === orderId);

      // 1. Cancel locally
      await cancelOrder({ token, orderId: orderId as Id<"shopifyOrders"> });

      // 2. Restore stock (non-blocking — don't let stock errors prevent modal close)
      try {
        if (order?.items && order.items.length > 0) {
          const adjustments = order.items
            .filter((item: OrderItem) => item.sku)
            .map((item: OrderItem) => ({ sku: item.sku!, quantity: item.quantity }));
          if (adjustments.length > 0) {
            await adjustStockBatch({ token, adjustments });
          }
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
            restock: false, // We handle stock ourselves
          });
          toast.success("Comandă anulată local + Shopify, stoc restaurat");
        } catch (shopifyError: any) {
          toast.success("Comandă anulată local, stoc restaurat");
          toast.error(normalizeUiErrorMessageLocal(shopifyError, "Eroare la anulare în Shopify"));
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
      const order = allOrders.find(o => o._id === orderId);
      const result = await revertCancel({ token, orderId: orderId as Id<"shopifyOrders"> });

      if (order?.items && order.items.length > 0) {
        const adjustments = order.items
          .filter((item: OrderItem) => item.sku)
          .map((item: OrderItem) => ({ sku: item.sku!, quantity: -item.quantity }));
        if (adjustments.length > 0) {
          await adjustStockBatch({ token, adjustments });
        }
      }
      toast.success(`Comandă restaurată la: ${result.newStatus}, stoc dedus`);
    } catch (error: any) {
      toast.error(normalizeUiErrorMessageLocal(error, "Eroare la restaurare"));
    } finally {
      setProcessingRevert(null);
    }
  };

  const handlePrintOrder = async (orderId: string, type: "awb" | "invoice" | "both") => {
    if (!token) return;
    setProcessingPrint(orderId);
    const order = displayedOrders?.find(o => o._id === orderId);
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
    const order = displayedOrders?.find(o => o._id === orderId);
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
    const order = displayedOrders?.find(o => o._id === orderId);
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
    const editingOrder = editingOrderResolved;
    if (isEditingOrderHydrating) {
      toast.error("Se incarca datele complete ale comenzii. Incearca din nou in cateva secunde.");
      return;
    }
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
        // Province unchanged — send the safe province_code instead of name
        shippingAddressData.stateCode = origAddr.stateCode;
      }
      if ((form.postalCode || "") !== (origAddr?.postalCode || origAddr?.zipCode || origAddr?.zip || "")) { shippingAddressData.postalCode = form.postalCode; hasAddressChanges = true; }
      if ((form.country || "") !== (origAddr?.country || "Romania")) { shippingAddressData.country = form.country; hasAddressChanges = true; }

      const nameChanged = (form.customerName || "") !== (orig.customerName || "");
      const emailChanged = (form.customerEmail || "") !== (orig.customerEmail || "");
      const phoneChanged = (form.customerPhone || "") !== (orig.customerPhone || "");

      // Calculate stock adjustments
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
          await updateCustomerDetails({
            token,
            orderId: editingOrder._id,
            notes: normalizedNotes,
          });
        }
        toast.success("Salvat și sincronizat cu Shopify!");
      } else {
        await updateCustomerDetails({
          token,
          orderId: editingOrder._id,
          customerName: form.customerName || undefined,
          customerEmail: form.customerEmail || undefined,
          customerPhone: form.customerPhone || undefined,
          shippingAddress: shippingAddressData,
          notes: form.notes ?? "",
        });
        toast.success("Salvat local!");
      }

      const itemsChanged = JSON.stringify(items) !== JSON.stringify(editingOrder.items);
      const discountChanged = discount !== (editingOrder.totalDiscounts || 0);
      if (itemsChanged || discountChanged) {
        await updateOrderItems({
          token,
          orderId: editingOrder._id,
          items: items,
          totalPrice: newTotal || editingOrder.totalPrice,
          totalDiscounts: discount,
        });
      }

      setEditingOrder(null);
    } catch (error: any) {
      toast.error(normalizeUiErrorMessageLocal(error, "Eroare la salvare"));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleSaveEditAndAddToPickingList = async (
    form: EditFormData,
    items: OrderItem[],
    syncToShopify: boolean,
    pickingListSelection: PickingListSelection
  ) => {
    const editingOrder = editingOrderResolved;
    if (isEditingOrderHydrating) {
      toast.error("Se incarca datele complete ale comenzii. Incearca din nou in cateva secunde.");
      return;
    }
    if (!token || !editingOrder) return;
    setSavingEditAndAdding(true);
    try {
      // Only include fields that actually changed (avoids Shopify validation on untouched data)
      const orig2 = editingOrder;
      const origAddr2 = orig2.shippingAddress;
      const shippingAddressData: Record<string, string | boolean | undefined> = {};
      let hasAddressChanges2 = false;

      if ((form.addressLine1 || "") !== (origAddr2?.line1 || "")) { shippingAddressData.line1 = form.addressLine1; hasAddressChanges2 = true; }
      if ((form.addressLine2 || "") !== (origAddr2?.line2 || "")) { shippingAddressData.line2 = form.addressLine2; hasAddressChanges2 = true; }
      if ((form.city || "") !== (origAddr2?.city || "")) { shippingAddressData.city = form.city; hasAddressChanges2 = true; }
      if ((form.state || "") !== (origAddr2?.state || "")) {
        shippingAddressData.state = form.state;
        shippingAddressData.stateEdited = true;
        hasAddressChanges2 = true;
      } else if (origAddr2?.stateCode) {
        shippingAddressData.stateCode = origAddr2.stateCode;
      }
      if ((form.postalCode || "") !== (origAddr2?.postalCode || origAddr2?.zipCode || origAddr2?.zip || "")) { shippingAddressData.postalCode = form.postalCode; hasAddressChanges2 = true; }
      if ((form.country || "") !== (origAddr2?.country || "Romania")) { shippingAddressData.country = form.country; hasAddressChanges2 = true; }

      const nameChanged2 = (form.customerName || "") !== (orig2.customerName || "");
      const emailChanged2 = (form.customerEmail || "") !== (orig2.customerEmail || "");
      const phoneChanged2 = (form.customerPhone || "") !== (orig2.customerPhone || "");

      // Calculate stock adjustments
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
      const newTotal = itemsSubtotal + (editingOrder.totalShipping || 0) - discount;

      if (syncToShopify) {
        await tryUpdateShopifyOrderWithProvinceRecovery({
          authToken: token,
          orderId: editingOrder._id,
          form,
          shippingAddressData,
          hasAddressChanges: hasAddressChanges2,
          customerName: nameChanged2 ? form.customerName : undefined,
          customerEmail: emailChanged2 ? form.customerEmail : undefined,
          customerPhone: phoneChanged2 ? form.customerPhone : undefined,
          countryCode: origAddr2?.countryCode,
        });
        const normalizedNotes = form.notes ?? "";
        if (normalizedNotes !== (editingOrder.notes || "")) {
          await updateCustomerDetails({
            token,
            orderId: editingOrder._id,
            notes: normalizedNotes,
          });
        }
      } else {
        await updateCustomerDetails({
          token,
          orderId: editingOrder._id,
          customerName: form.customerName || undefined,
          customerEmail: form.customerEmail || undefined,
          customerPhone: form.customerPhone || undefined,
          shippingAddress: shippingAddressData,
          notes: form.notes ?? "",
        });
      }

      const itemsChanged = JSON.stringify(items) !== JSON.stringify(editingOrder.items);
      const discountChanged = discount !== (editingOrder.totalDiscounts || 0);
      if (itemsChanged || discountChanged) {
        await updateOrderItems({
          token,
          orderId: editingOrder._id,
          items: items,
          totalPrice: newTotal || editingOrder.totalPrice,
          totalDiscounts: discount,
        });
      }

      // Add to picking list based on selection
      let pickingListId: Id<"pickingLists"> | undefined;

      if (pickingListSelection.newListName) {
        // Create a new picking list first
        const newListId = await createPickingList({
          token,
          name: pickingListSelection.newListName,
          shopDomain: selectedShopDomain || undefined,
        });
        pickingListId = newListId;
      } else if (pickingListSelection.pickingListId) {
        pickingListId = pickingListSelection.pickingListId as Id<"pickingLists">;
      }

      const result = await addSingleOrder({
        token,
        orderId: editingOrder._id,
        useToday: pickingListSelection.useToday,
        pickingListId,
        shopDomain: selectedShopDomain || undefined,
      });

      if (result.alreadyExists) {
        toast.success(`Salvat! Comanda exista deja în "${result.pickingListName}"`);
      } else {
        toast.success(`Salvat și adăugat în "${result.pickingListName}"`);
      }

      setEditingOrder(null);
    } catch (error: any) {
      toast.error(normalizeUiErrorMessageLocal(error, "Eroare la salvare"));
    } finally {
      setSavingEditAndAdding(false);
    }
  };

  const handleAddItemToOrder = (sku: { sku: string; name: string; sellPrice?: number; currentStock: number }) => {
    if (!editingOrder) return;
    setEditingOrder({
      ...editingOrder,
      items: [
        ...(editingOrder.items || []),
        { sku: sku.sku, name: sku.name, quantity: 1, price: sku.sellPrice || 0 }
      ]
    });
    setShowSkuPicker(false);
    setSkuSearch("");
  };

  const handleSelectAll = () => {
    if (!displayedOrders) return;
    // If ANY orders are selected, deselect all. Otherwise select all visible.
    // This prevents accidentally selecting new orders that arrived via reactivity.
    const allVisibleSelected = displayedOrders.length > 0 &&
      displayedOrders.every(o => selectedOrders.has(o._id));
    if (allVisibleSelected) {
      setSelectedOrders(new Set());
    } else if (selectedOrders.size > 0) {
      // Some are selected but not all - deselect all (safe default)
      setSelectedOrders(new Set());
    } else {
      // None selected - select all visible
      setSelectedOrders(new Set(displayedOrders.map(o => o._id)));
    }
  };

  const handleSelect = (orderId: string) => {
    const newSelected = new Set(selectedOrders);
    if (newSelected.has(orderId)) {
      newSelected.delete(orderId);
    } else {
      newSelected.add(orderId);
    }
    setSelectedOrders(newSelected);
  };

  const handleViewMultipleOrders = (phone: string) => {
    const normalizedPhone = phone.replace(/\s/g, "").replace(/^\+40/, "0");
    const matchingOrders = allOrders.filter(o => {
      if (o.status === "cancelled") return false;
      if (o.trackingNumber) return false;
      const orderPhone = o.customerPhone?.replace(/\s/g, "").replace(/^\+40/, "0");
      return orderPhone === normalizedPhone;
    }) as Order[];
    setViewingMultipleOrders({ phone, orders: matchingOrders });
  };

  const normalizeUiErrorMessageLocal = (error: any, fallback: string) => {
    return normalizeUiErrorMessage(error, fallback);
  };

  // Single invoice action (icon in row): no results modal, just toast.
  const handleGenerateInvoice = async (orderId: string) => {
    if (!token) return;
    try {
      const result = await createInvoice({ token, orderId: orderId as Id<"shopifyOrders"> });
      if (result.alreadyExists) {
        toast.info(`Factura există deja: ${result.invoice?.series || ""}${result.invoice?.number || ""}`);
      } else {
        toast.success(`Factură generată: ${result.invoice?.series || ""}${result.invoice?.number || ""}`);
      }
    } catch (error: any) {
      toast.error(normalizeUiErrorMessageLocal(error, "Eroare la generare factură"));
    }
  };

  const handleResetFilters = () => {
    setPendingStartDate("");
    setPendingEndDate("");
    setStartDate("");
    setEndDate("");
    setSpamOnly(false);
    setStatusFilter("");
    setFulfillmentFilter("");
    setDeliveryStatusFilter("");
    setDocFilter("all");
  };

  const handleApplyDateFilter = () => {
    setStartDate(pendingStartDate);
    setEndDate(pendingEndDate);
    setDisplayLimit(100);
  };

  const handleClearDateFilter = () => {
    setPendingStartDate("");
    setPendingEndDate("");
    setStartDate("");
    setEndDate("");
    setDisplayLimit(100);
  };

  const handleLoadMoreOrders = () => {
    const loadedFilteredCount = effectiveFilteredOrders?.length || 0;
    loadMoreScrollYRef.current = window.scrollY;
    // Prevent focused button from being kept in view while DOM grows.
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setDisplayLimit((prev) => Math.min(prev + 100, 1000));
    if (displayedOrders.length >= loadedFilteredCount && paginatedStatus === "CanLoadMore") {
      loadMoreOrders(100);
    }
  };

  const handleCreateAndAddSingleOrder = async (orderId: string, name: string) => {
    if (!token) return;
    setProcessingPickingList(orderId);
    try {
      const newListId = await createPickingList({
        token,
        name,
        shopDomain: selectedShopDomain || undefined
      });
      const result = await addSingleOrder({
        token,
        orderId: orderId as Id<"shopifyOrders">,
        pickingListId: newListId,
        shopDomain: selectedShopDomain || undefined,
      });
      if (result.alreadyExists) {
        toast.info(`Comanda există deja în "${name}"`);
      } else {
        toast.success(`"${name}" creat și comanda adăugată`);
      }
      setShowPickingListDropdown(null);
    } catch (error: any) {
      toast.error(normalizeUiErrorMessageLocal(error, "Eroare la creare picking list"));
    } finally {
      setProcessingPickingList(null);
    }
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">Orders</h1>
        <div className="flex gap-2">
          <Button onClick={handleSyncDeliveryStatuses} loading={syncingDeliveryStatus} variant="outline">
            <Truck className={cn("h-4 w-4 mr-2", syncingDeliveryStatus && "animate-spin")} />
            Sync Delivery Status
          </Button>
          <Button onClick={handleSync} loading={syncing}>
            <RefreshCw className={cn("h-4 w-4 mr-2", syncing && "animate-spin")} />
            Sync Orders
          </Button>
        </div>
      </div>

      {/* Filters */}
      <OrdersFilters
        startDate={pendingStartDate}
        endDate={pendingEndDate}
        onStartDateChange={setPendingStartDate}
        onEndDateChange={setPendingEndDate}
        onApplyDateFilter={handleApplyDateFilter}
        onClearDateFilter={handleClearDateFilter}
        isDateFilterDirty={pendingStartDate !== startDate || pendingEndDate !== endDate}
        hasDateFilterApplied={!!(startDate || endDate)}
        statusFilter={statusFilter}
        fulfillmentFilter={fulfillmentFilter}
        deliveryStatusFilter={deliveryStatusFilter}
        onStatusFilterChange={setStatusFilter}
        onFulfillmentFilterChange={setFulfillmentFilter}
        onDeliveryStatusFilterChange={setDeliveryStatusFilter}
        spamOnly={spamOnly}
        spamCount={spamCount}
        onSpamOnlyChange={setSpamOnly}
        search={search}
        onSearchChange={setSearch}
        docFilter={docFilter}
        onDocFilterChange={setDocFilter}
        workedCount={workedCount}
        visibleColumns={visibleColumns}
        onVisibleColumnsChange={setVisibleColumns}
        displayedCount={displayedOrders?.length || 0}
        filteredCount={effectiveFilteredOrders?.length || 0}
        totalCount={allOrders.length || 0}
        canLoadMore={paginatedStatus === "CanLoadMore"}
        onResetFilters={handleResetFilters}
        hasActiveFilters={hasActiveFilters}
      />

      {/* Bulk Actions */}
      <BulkActionsToolbar
        selectedCount={selectedOrders.size}
        onDeselect={() => setSelectedOrders(new Set())}
        onGenerateAwb={bulkHandlers.handleBulkGenerateAwb}
        onGenerateInvoice={bulkHandlers.handleBulkGenerateInvoice}
        onGenerateBoth={bulkHandlers.handleBulkGenerateBoth}
        onStornoAwb={bulkHandlers.handleBulkStornoAwb}
        onStornoInvoice={bulkHandlers.handleBulkStornoInvoice}
        onPrint={() => setShowPrintModal(true)}
        isProcessing={processingBulk}
        pickingLists={pickingLists}
        onAddToPickingList={bulkHandlers.handleBulkAddToPickingList}
        onAddToPickingListToday={bulkHandlers.handleBulkAddToPickingListToday}
        onCreateAndAddToPickingList={bulkHandlers.handleBulkCreateAndAddToPickingList}
      />

      {/* Table */}
      <OrdersTable
        orders={displayedOrders}
        isLoading={token ? paginatedStatus === "LoadingFirstPage" : false}
        selectedOrders={selectedOrders}
        onSelectAll={handleSelectAll}
        onSelectOrder={handleSelect}
        visibleColumns={visibleColumns}
        phoneOrderCounts={phoneOrderCounts}
        orderPickingListMap={orderPickingListMap}
        canToggleWorked={false}
        onEditOrder={setEditingOrder}
        onCancelOrder={handleCancelOrder}
        onRevertCancel={handleRevertCancel}
        onAddToPickingList={handleAddToPickingList}
        onCreateAndAddToPickingList={handleCreateAndAddSingleOrder}
        onViewMultipleOrders={handleViewMultipleOrders}
        pickingLists={pickingLists}
        showPickingListDropdown={showPickingListDropdown}
        onTogglePickingListDropdown={setShowPickingListDropdown}
        processingCancel={processingCancel}
        processingRevert={processingRevert}
        processingPickingList={processingPickingList}
        getDeliveryStatusColor={getDeliveryStatusColor}
        emptyStateTitle={search.trim() && filteredOrders.length === 0 && searchFallbackOrders === undefined ? "Cautam comanda.." : undefined}
        hasFilters={hasActiveFilters || !!search}
        displayedCount={displayedOrders?.length || 0}
        totalFilteredCount={effectiveFilteredOrders?.length || 0}
        totalLoadedCount={allOrders.length || 0}
        canLoadMore={paginatedStatus === "CanLoadMore"}
        onLoadMore={handleLoadMoreOrders}
        onGenerateInvoice={handleGenerateInvoice}
        onPrint={handlePrintOrder}
        processingPrint={processingPrint}
        onDownloadAwbPdf={handleDownloadAwbPdf}
        downloadingAwbPdf={downloadingAwbPdf}
        onDownloadInvoicePdf={handleDownloadInvoicePdf}
        downloadingInvoicePdf={downloadingInvoicePdf}
        onViewHistory={setViewingHistoryOrder}
      />

      {/* Modals */}
      <EditOrderModal
        order={editingOrderResolved}
        isHydrating={isEditingOrderHydrating}
        onClose={() => setEditingOrder(null)}
        onSave={handleSaveEdit}
        onSaveAndAddToPickingList={handleSaveEditAndAddToPickingList}
        isSaving={savingEdit}
        isSavingAndAdding={savingEditAndAdding}
        pickingLists={pickingLists ?? []}
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
        onPrintAwb={() => runPrintAction("awb", printHandlers.handlePrintAwb)}
        onPrintInvoice={() => runPrintAction("invoice", printHandlers.handlePrintInvoice)}
        onPrintBoth={() => runPrintAction("both", printHandlers.handlePrintBoth)}
        isPrinting={printingDocument}
        activeAction={activePrintAction}
        progress={printProgress}
        pendingAwbPdfCount={pendingAwbPdfUrls.length}
        onOpenPendingAwbPdfs={printHandlers.handleOpenPendingAwbPdfs}
        pendingInvoicePdfCount={pendingInvoicePdfUrls.length}
        onOpenPendingInvoicePdfs={printHandlers.handleOpenPendingInvoicePdfs}
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
        onClose={() => setShowAwbModal(false)}
        onConfirm={bulkHandlers.handleAwbModalConfirm}
        orderCount={selectedOrders.size}
        isProcessing={awbModalProcessing}
        token={token || ""}
        defaultOpenPackage={selectedOrdersWithOpenPackage.hasAny}
        openPackageRequestedCount={selectedOrdersWithOpenPackage.count}
      />

      {(() => {
        const cancelOrder = cancelModalOrderId ? allOrders.find(o => o._id === cancelModalOrderId) : null;
        return (
          <CancelOrderModal
            isOpen={!!cancelModalOrderId}
            onClose={() => setCancelModalOrderId(null)}
            onConfirm={handleConfirmCancel}
            orderNumber={cancelOrder?.orderNumber || ""}
            hasShopifyOrder={!!cancelOrder?.shopifyOrderId}
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
        onContinue={(skippedOrderIds) => {
          setShowAddressValidationModal(false);
          setInvalidAddresses([]);
          if (skippedOrderIds.length > 0) {
            let remainingSelectedCount = 0;
            setSelectedOrders((prev) => {
              const next = new Set(prev);
              skippedOrderIds.forEach((orderId) => next.delete(orderId));
              remainingSelectedCount = next.size;
              return next;
            });

            if (remainingSelectedCount === 0) {
              toast.error("Nu au rămas comenzi valide pentru generare AWB.");
              return;
            }
            toast.info(`Se sar ${skippedOrderIds.length} comenzi cu localitate nevalidată.`);
          }
          setShowAwbModal(true);
        }}
        invalidAddresses={invalidAddresses}
        token={token || ""}
      />
    </div>
  );
}
