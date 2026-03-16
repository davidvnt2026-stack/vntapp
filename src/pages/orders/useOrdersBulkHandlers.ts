import { toast } from "sonner";
import type { Id } from "../../../convex/_generated/dataModel";
import type { DocumentProcessResult } from "../../components/orders";
import { normalizeUiErrorMessage } from "../../lib/utils";

export interface UseOrdersBulkHandlersParams {
  token: string | null;
  selectedOrders: Set<string>;
  selectedShopDomain: string | null;
  getSelectedOrderIds: () => Id<"shopifyOrders">[];
  setSelectedOrders: (v: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  setProcessingBulk: (v: boolean) => void;
  setDocumentResults: (v: DocumentProcessResult[] | ((prev: DocumentProcessResult[]) => DocumentProcessResult[])) => void;
  setShowGenerationResultsModal: (v: boolean) => void;
  setShowAwbModal: (v: boolean) => void;
  setShowAddressValidationModal: (v: boolean) => void;
  setInvalidAddresses: (v: any[]) => void;
  validateOrdersAddress: (args: { token: string; orderIds: Id<"shopifyOrders">[] }) => Promise<{ valid: string[]; invalid: any[] }>;
  setGenerationProgress: (v: { phase: string; processed: number; total: number } | null) => void;
  setIsGeneratingInvoices: (v: boolean) => void;
  setAwbModalProcessing: (v: boolean) => void;
  generateBatchAwb: (args: {
    token: string;
    orderIds: Id<"shopifyOrders">[];
    serviceId?: number;
    openPackage?: boolean;
    serviceTaxIds?: number[];
    serviceTaxes?: Array<{ id: number; code: string }>;
  }) => Promise<{
    results: Array<{ orderId: string; orderNumber: string; success: boolean; error?: string }>;
    summary: { successful: number; failed: number; total: number };
  }>;
  createBatchInvoices: (args: {
    token: string;
    orderIds: Id<"shopifyOrders">[];
  }) => Promise<{
    results: Array<{ orderId: string; orderNumber: string; success: boolean; error?: string }>;
    summary: { successful: number; failed: number; total: number };
  }>;
  stornoBatchAwb: (args: {
    token: string;
    orderIds: Id<"shopifyOrders">[];
  }) => Promise<{ summary: { successful: number; failed: number } }>;
  stornoBatchInvoices: (args: {
    token: string;
    orderIds: Id<"shopifyOrders">[];
  }) => Promise<{ summary: { successful: number; failed: number } }>;
  setWorkedStatusBatch: (args: {
    token: string;
    orderIds: Id<"shopifyOrders">[];
    isWorked: boolean;
  }) => Promise<unknown>;
  addOrdersToPickingList: (args: {
    token: string;
    pickingListId: Id<"pickingLists">;
    orderIds: Id<"shopifyOrders">[];
  }) => Promise<{ addedCount: number; skippedCount: number; pickingListName: string }>;
  getOrCreateTodayPickingList: (args: {
    token: string;
    shopDomain?: string;
  }) => Promise<{ id: Id<"pickingLists">; name: string }>;
  createPickingList: (args: {
    token: string;
    name: string;
    shopDomain?: string;
  }) => Promise<Id<"pickingLists">>;
}

export function useOrdersBulkHandlers(params: UseOrdersBulkHandlersParams) {
  const {
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
  } = params;

  const truncateErrorMessage = (message?: string) => {
    return normalizeUiErrorMessage({ message }, "");
  };
  const getResultErrorMessage = (message?: string) =>
    truncateErrorMessage(message) || "Eroare necunoscută";

  const handleBulkGenerateAwb = async () => {
    if (!token || selectedOrders.size === 0) return;
    
    const orderIds = getSelectedOrderIds();
    if (orderIds.length === 0) return;

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
      toast.error(normalizeUiErrorMessage(error, "Eroare la validarea adreselor"));
    } finally {
      setProcessingBulk(false);
    }
  };

  const handleAwbModalConfirm = async (options: {
    serviceId: number;
    openPackage: boolean;
    serviceTaxIds: number[];
    serviceTaxes: Array<{ id: number; code: string }>;
  }) => {
    if (!token || selectedOrders.size === 0) return;
    const orderIds = getSelectedOrderIds();
    if (orderIds.length === 0) return;

    setAwbModalProcessing(true);
    setProcessingBulk(true);
    setDocumentResults([]);
    setShowGenerationResultsModal(true);
    setIsGeneratingInvoices(true);
    setGenerationProgress({
      phase: "Pornire generare AWB-uri",
      processed: 0,
      total: orderIds.length,
    });
    setShowAwbModal(false);
    try {
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
          message: truncateErrorMessage(r.error),
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
      toast.success(`AWB generate: ${successful} succes, ${failed} erori`);
      if (failed > 0) {
        allResults
          .filter((r) => !r.success)
          .forEach((r) => toast.error(`#${r.orderNumber}: ${getResultErrorMessage(r.message)}`));
      }

    } catch (error: unknown) {
      toast.error(normalizeUiErrorMessage(error, "Eroare la generare AWB"));
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
      setGenerationProgress({
        phase: "Pornire generare facturi",
        processed,
        total: orderIds.length,
      });

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
            message: truncateErrorMessage(r.error),
          }))
        );
        processed += chunk.length;
        setGenerationProgress({
          phase: "Generare facturi",
          processed,
          total: orderIds.length,
        });
      }

      setDocumentResults(allResults);
      const successful = allResults.filter((r) => r.success).length;
      const failed = allResults.length - successful;
      toast.success(`Facturi generate: ${successful} succes, ${failed} erori`);
      if (failed > 0) {
        allResults
          .filter((r) => !r.success)
          .forEach((r) => toast.error(`#${r.orderNumber}: ${getResultErrorMessage(r.message)}`));
      }
    } catch (error: unknown) {
      toast.error(normalizeUiErrorMessage(error, "Eroare la generare facturi"));
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

        const awbResult = await generateBatchAwb({
          token,
          orderIds: chunk,
        });

        const awbRunResults = awbResult.results.map((r) => ({
          orderId: r.orderId,
          orderNumber: r.orderNumber,
          action: "Generare AWB",
          success: r.success,
          message: truncateErrorMessage(r.error),
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

        const invoiceResult = await createBatchInvoices({
          token,
          orderIds: chunk,
        });

        const invoiceRunResults = invoiceResult.results.map((r) => ({
          orderId: r.orderId,
          orderNumber: r.orderNumber,
          action: "Generare factură",
          success: r.success,
          message: truncateErrorMessage(r.error),
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

      const awbFailed = orderIds.length - awbSuccess;
      const invoiceFailed = orderIds.length - invoiceSuccess;
      toast.success(`AWB: ${awbSuccess}/${orderIds.length}, Facturi: ${invoiceSuccess}/${orderIds.length}`);
      if (awbFailed + invoiceFailed > 0) {
        allResults
          .filter((r) => !r.success)
          .forEach((r) => toast.error(`#${r.orderNumber}: ${getResultErrorMessage(r.message)}`));
      }
    } catch (error: unknown) {
      toast.error(normalizeUiErrorMessage(error, "Eroare la generare documente"));
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
      const result = await stornoBatchAwb({
        token,
        orderIds: getSelectedOrderIds(),
      });
      toast.success(
        `AWB stornate: ${result.summary.successful} succes, ${result.summary.failed} erori`
      );
      setSelectedOrders(new Set());
    } catch (error: unknown) {
      toast.error(normalizeUiErrorMessage(error, "Eroare la stornare AWB"));
    } finally {
      setProcessingBulk(false);
    }
  };

  const handleBulkStornoInvoice = async () => {
    if (!token || selectedOrders.size === 0) return;
    setProcessingBulk(true);
    try {
      const result = await stornoBatchInvoices({
        token,
        orderIds: getSelectedOrderIds(),
      });
      toast.success(
        `Facturi stornate: ${result.summary.successful} succes, ${result.summary.failed} erori`
      );
      setSelectedOrders(new Set());
    } catch (error: unknown) {
      toast.error(normalizeUiErrorMessage(error, "Eroare la stornare facturi"));
    } finally {
      setProcessingBulk(false);
    }
  };

  const handleBulkSetWorked = async (isWorked: boolean) => {
    if (!token || selectedOrders.size === 0) return;
    setProcessingBulk(true);
    try {
      await setWorkedStatusBatch({
        token,
        orderIds: getSelectedOrderIds(),
        isWorked,
      });
      toast.success(
        isWorked ? "Comenzi marcate ca lucrate" : "Comenzi demarcate"
      );
      setSelectedOrders(new Set());
    } catch (error: unknown) {
      toast.error(normalizeUiErrorMessage(error, "Eroare"));
    } finally {
      setProcessingBulk(false);
    }
  };

  const handleBulkAddToPickingList = async (pickingListId: Id<"pickingLists">) => {
    if (!token || selectedOrders.size === 0) return;
    setProcessingBulk(true);
    try {
      const result = await addOrdersToPickingList({
        token,
        pickingListId,
        orderIds: getSelectedOrderIds(),
      });
      if (result.addedCount > 0) {
        toast.success(
          `${result.addedCount} comenzi adăugate în "${result.pickingListName}"`
        );
      }
      if (result.skippedCount > 0) {
        toast.info(`${result.skippedCount} comenzi existau deja în listă`);
      }
      setSelectedOrders(new Set());
    } catch (error: unknown) {
      toast.error(normalizeUiErrorMessage(error, "Eroare la adăugare în picking list"));
    } finally {
      setProcessingBulk(false);
    }
  };

  const handleBulkAddToPickingListToday = async () => {
    if (!token || selectedOrders.size === 0) return;
    setProcessingBulk(true);
    try {
      const todayResult = await getOrCreateTodayPickingList({
        token,
        shopDomain: selectedShopDomain || undefined,
      });
      const result = await addOrdersToPickingList({
        token,
        pickingListId: todayResult.id,
        orderIds: getSelectedOrderIds(),
      });
      if (result.addedCount > 0) {
        toast.success(
          `${result.addedCount} comenzi adăugate în "${todayResult.name}"`
        );
      }
      if (result.skippedCount > 0) {
        toast.info(`${result.skippedCount} comenzi existau deja în listă`);
      }
      setSelectedOrders(new Set());
    } catch (error: unknown) {
      toast.error(normalizeUiErrorMessage(error, "Eroare la adăugare în picking list"));
    } finally {
      setProcessingBulk(false);
    }
  };

  const handleBulkCreateAndAddToPickingList = async (name: string) => {
    if (!token || selectedOrders.size === 0) return;
    setProcessingBulk(true);
    try {
      const newListId = await createPickingList({
        token,
        name,
        shopDomain: selectedShopDomain || undefined,
      });
      const result = await addOrdersToPickingList({
        token,
        pickingListId: newListId,
        orderIds: getSelectedOrderIds(),
      });
      toast.success(`"${name}" creat cu ${result.addedCount} comenzi`);
      setSelectedOrders(new Set());
    } catch (error: unknown) {
      toast.error(normalizeUiErrorMessage(error, "Eroare la creare picking list"));
    } finally {
      setProcessingBulk(false);
    }
  };

  return {
    handleBulkGenerateAwb,
    handleAwbModalConfirm,
    handleBulkGenerateInvoice,
    handleBulkGenerateBoth,
    handleBulkStornoAwb,
    handleBulkStornoInvoice,
    handleBulkSetWorked,
    handleBulkAddToPickingList,
    handleBulkAddToPickingListToday,
    handleBulkCreateAndAddToPickingList,
  };
}
