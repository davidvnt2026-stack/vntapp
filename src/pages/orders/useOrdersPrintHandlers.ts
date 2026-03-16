import { PDFDocument } from "pdf-lib";
import { toast } from "sonner";
import type { Id } from "../../../convex/_generated/dataModel";
import { mergePdfs, openPdfUrls } from "../../lib/pdfUtils";
import type { Order, DocumentProcessResult } from "../../components/orders";

export interface UseOrdersPrintHandlersParams {
  token: string | null;
  displayedOrders: Order[];
  selectedOrders: Set<string>;
  pendingAwbPdfUrls: string[];
  pendingInvoicePdfUrls: string[];
  setPrintingDocument: (v: boolean) => void;
  setPrintProgress: (v: { phase: string; processed: number; total: number } | null) => void;
  setPendingAwbPdfUrls: (v: string[]) => void;
  setPendingInvoicePdfUrls: (v: string[]) => void;
  setDocumentResults: (v: DocumentProcessResult[] | ((prev: DocumentProcessResult[]) => DocumentProcessResult[])) => void;
  setShowPrintModal: (v: boolean) => void;
  setSelectedOrders: (v: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  downloadAwbPdfsBatch: (args: {
    token: string;
    awbNumbers: string[];
    format: string;
    delayMs: number;
  }) => Promise<{ results: Array<{ awbNumber: string; pdf?: string; error?: string }> }>;
  getInvoicePdf: (args: { token: string; orderId: Id<"shopifyOrders"> }) => Promise<{ pdf?: string; pdfUrl?: string }>;
  logPrintBatch: (args: {
    token: string;
    orderIds: Id<"shopifyOrders">[];
    documentType: "awb" | "invoice" | "both";
  }) => Promise<unknown>;
}

export function useOrdersPrintHandlers(params: UseOrdersPrintHandlersParams) {
  const {
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
  } = params;

  const handleOpenPendingAwbPdfs = () => {
    if (pendingAwbPdfUrls.length === 0) return;
    const blocked = openPdfUrls(pendingAwbPdfUrls);
    setPendingAwbPdfUrls(blocked);
    if (blocked.length === 0) {
      toast.success("Toate PDF-urile au fost deschise.");
    }
  };

  const handleOpenPendingInvoicePdfs = () => {
    if (pendingInvoicePdfUrls.length === 0) return;
    const blocked = openPdfUrls(pendingInvoicePdfUrls);
    setPendingInvoicePdfUrls(blocked);
    if (blocked.length === 0) {
      toast.success("Toate PDF-urile au fost deschise.");
    }
  };

  const handlePrintAwb = async () => {
    if (!token || selectedOrders.size === 0) return;
    setPrintingDocument(true);
    setPrintProgress(null);
    setPendingAwbPdfUrls([]);
    setPendingInvoicePdfUrls([]);
    setDocumentResults([]);
    try {
      const ordersToProcess =
        displayedOrders?.filter((o) => selectedOrders.has(o._id) && o.trackingNumber) || [];
      if (ordersToProcess.length === 0) {
        toast.error("Nicio comandă selectată nu are AWB");
        return;
      }

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
            const pdfBytes = Uint8Array.from(atob(result.pdf), (c) => c.charCodeAt(0));
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
          phase: `Descărcare și combinare AWB-uri`,
          processed,
          total: ordersToProcess.length,
        });
      }

      if (mergedPdf.getPageCount() > 0) {
        const mergedBytes = await mergedPdf.save();
        const blob = new Blob([mergedBytes.buffer as ArrayBuffer], {
          type: "application/pdf",
        });
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
        toast.warning(
          `${failedAwbCount} AWB-uri nu au putut fi descărcate, restul au fost procesate.`
        );
      }

      await logPrintBatch({
        token,
        orderIds: ordersToProcess.map((o) => o._id) as Id<"shopifyOrders">[],
        documentType: "awb",
      });
      toast.success(`${ordersToProcess.length} AWB-uri combinate pentru printare`);
    } catch (error: unknown) {
      toast.error((error as Error).message || "Eroare la printare AWB");
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
      const ordersToProcess =
        displayedOrders?.filter(
          (o) =>
            selectedOrders.has(o._id) && o.invoiceNumber && o.invoiceStatus !== "storno"
        ) || [];
      if (ordersToProcess.length === 0) {
        toast.error("Nicio comandă selectată nu are factură validă");
        return;
      }

      const pdfBase64Array: string[] = [];
      let failedInvoiceCount = 0;
      const runResults: DocumentProcessResult[] = [];
      for (const order of ordersToProcess) {
        try {
          const result = await getInvoicePdf({
            token,
            orderId: order._id as Id<"shopifyOrders">,
          });
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
        } catch (err: unknown) {
          failedInvoiceCount += 1;
          runResults.push({
            orderId: order._id,
            orderNumber: order.orderNumber,
            action: "Print factură",
            success: false,
            message: (err as Error)?.message || "Eroare la descărcare factură",
          });
        }
      }

      if (pdfBase64Array.length > 0) {
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

      await logPrintBatch({
        token,
        orderIds: ordersToProcess.map((o) => o._id) as Id<"shopifyOrders">[],
        documentType: "invoice",
      });
      toast.success(`${ordersToProcess.length} facturi combinate pentru printare`);
      if (failedInvoiceCount > 0) {
        toast.warning(
          `${failedInvoiceCount} facturi au eșuat, restul au fost procesate.`
        );
      }
    } catch (error: unknown) {
      toast.error((error as Error).message || "Eroare la printare facturi");
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
      const ordersToProcess =
        displayedOrders?.filter((o) => selectedOrders.has(o._id)) || [];

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
            const invoiceResult = await getInvoicePdf({
              token,
              orderId: order._id as Id<"shopifyOrders">,
            });
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
          } catch (err: unknown) {
            failedInvoiceCount += 1;
            runResults.push({
              orderId: order._id,
              orderNumber: order.orderNumber,
              action: "Print factură",
              success: false,
              message: (err as Error)?.message || "Eroare la descărcare factură",
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

      await logPrintBatch({
        token,
        orderIds: ordersToProcess.map((o) => o._id) as Id<"shopifyOrders">[],
        documentType: "both",
      });
      const totalDocs =
        (awbPdfs.length > 0 ? 1 : 0) + (invoicePdfs.length > 0 ? 1 : 0);
      toast.success(
        `${totalDocs} document${totalDocs > 1 ? "e" : ""} deschis${totalDocs > 1 ? "e" : ""} pentru printare (${awbPdfs.length} AWB + ${invoicePdfs.length} facturi)`
      );
      if (failedAwbCount > 0 || failedInvoiceCount > 0) {
        toast.warning(
          `Eșecuri parțiale: ${failedAwbCount} AWB, ${failedInvoiceCount} facturi.`
        );
      }
    } catch (error: unknown) {
      toast.error((error as Error).message || "Eroare la printare");
    } finally {
      setPrintProgress(null);
      setPrintingDocument(false);
    }
  };

  return {
    handleOpenPendingAwbPdfs,
    handleOpenPendingInvoicePdfs,
    handlePrintAwb,
    handlePrintInvoice,
    handlePrintBoth,
  };
}
