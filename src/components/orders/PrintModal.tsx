import { Button } from "../ui/Button";
import { Card, CardContent } from "../ui/Card";
import { X, Printer, Truck, Receipt, FileText, Loader2 } from "lucide-react";

export type DocumentProcessResult = {
  orderId?: string;
  orderNumber: string;
  action: string;
  success: boolean;
  message?: string;
};

interface PrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCount: number;
  onPrintAwb: () => void;
  onPrintInvoice: () => void;
  onPrintBoth: () => void;
  isPrinting: boolean;
  progress?: { phase: string; processed: number; total: number } | null;
  pendingPdfCount?: number;
  onOpenPendingPdfs?: () => void;
  pendingAwbPdfCount?: number;
  onOpenPendingAwbPdfs?: () => void;
  pendingInvoicePdfCount?: number;
  onOpenPendingInvoicePdfs?: () => void;
  activeAction?: "awb" | "invoice" | "both" | null;
  results?: DocumentProcessResult[];
  onClearResults?: () => void;
}

export function PrintModal({
  isOpen,
  onClose,
  selectedCount,
  onPrintAwb,
  onPrintInvoice,
  onPrintBoth,
  isPrinting,
  progress,
  pendingPdfCount = 0,
  onOpenPendingPdfs,
  pendingAwbPdfCount = 0,
  onOpenPendingAwbPdfs,
  pendingInvoicePdfCount = 0,
  onOpenPendingInvoicePdfs,
  activeAction = null,
  results = [],
  onClearResults,
}: PrintModalProps) {
  if (!isOpen) return null;

  const successCount = results.filter((r) => r.success).length;
  const failedCount = results.length - successCount;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Printer className="h-5 w-5" />
              Print Documents
            </h2>
            <Button size="sm" variant="ghost" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="text-sm text-muted-foreground mb-4">
            {selectedCount} comenzi selectate
          </div>

          <div className="space-y-3">
            {/* Print AWBs */}
            <Button
              variant="outline"
              className={`w-full justify-start h-auto py-3 ${activeAction === "awb" ? "ring-2 ring-blue-300" : ""}`}
              onClick={onPrintAwb}
              disabled={isPrinting}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Truck className="h-5 w-5 text-blue-600" />
                </div>
                <div className="text-left">
                  <div className="font-medium">Print AWBs (A6)</div>
                  <div className="text-xs text-muted-foreground">Deschide AWB-urile pentru printare</div>
                </div>
              </div>
              {isPrinting && activeAction === "awb" && <Loader2 className="h-4 w-4 ml-auto animate-spin" />}
            </Button>

            {/* Print Invoice */}
            <Button
              variant="outline"
              className={`w-full justify-start h-auto py-3 ${activeAction === "invoice" ? "ring-2 ring-green-300" : ""}`}
              onClick={onPrintInvoice}
              disabled={isPrinting}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Receipt className="h-5 w-5 text-green-600" />
                </div>
                <div className="text-left">
                  <div className="font-medium">Print Facturi (A4)</div>
                  <div className="text-xs text-muted-foreground">Deschide facturile pentru printare</div>
                </div>
              </div>
              {isPrinting && activeAction === "invoice" && <Loader2 className="h-4 w-4 ml-auto animate-spin" />}
            </Button>

            {/* Print Both */}
            <Button
              className={`w-full justify-start h-auto py-3 bg-primary ${activeAction === "both" ? "ring-2 ring-primary/40" : ""}`}
              onClick={onPrintBoth}
              disabled={isPrinting}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="text-left">
                  <div className="font-medium">Print Ambele</div>
                  <div className="text-xs opacity-80">AWB (A6) + Factură (A4)</div>
                </div>
              </div>
              {isPrinting && activeAction === "both" && <Loader2 className="h-4 w-4 ml-auto animate-spin" />}
            </Button>
          </div>

          {isPrinting && progress && (
            <div className="mt-4 p-3 rounded-md border bg-muted/40">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-medium">
                  {activeAction === "awb"
                    ? "Rulează: Print AWB"
                    : activeAction === "invoice"
                      ? "Rulează: Print factură"
                      : activeAction === "both"
                        ? "Rulează: Print ambele"
                        : "Se procesează"}
                </span>
                <span>{Math.min(progress.processed, progress.total)}/{progress.total}</span>
              </div>
              <p className="text-xs text-muted-foreground mb-2">{progress.phase}</p>
              <div className="h-2 w-full rounded bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{
                    width: `${progress.total > 0 ? Math.min(100, Math.round((progress.processed / progress.total) * 100)) : 0}%`,
                  }}
                />
              </div>
            </div>
          )}

          {(pendingAwbPdfCount > 0 || pendingInvoicePdfCount > 0) && (
            <div className="mt-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {pendingAwbPdfCount > 0 && onOpenPendingAwbPdfs && (
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={onOpenPendingAwbPdfs}
                  >
                    Deschide PDF AWB ({pendingAwbPdfCount})
                  </Button>
                )}
                {pendingInvoicePdfCount > 0 && onOpenPendingInvoicePdfs && (
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={onOpenPendingInvoicePdfs}
                  >
                    Deschide PDF Factură ({pendingInvoicePdfCount})
                  </Button>
                )}
              </div>
            </div>
          )}

          {pendingAwbPdfCount === 0 &&
            pendingInvoicePdfCount === 0 &&
            pendingPdfCount > 0 &&
            onOpenPendingPdfs && (
              <div className="mt-3">
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={onOpenPendingPdfs}
                >
                  Deschide PDF-urile ({pendingPdfCount})
                </Button>
              </div>
            )}

          <div className="mt-4 pt-4 border-t text-xs text-muted-foreground">
            <p>💡 Documentele se vor deschide în tab-uri noi pentru printare manuală.</p>
            <p className="mt-1">📄 AWB-urile sunt în format A6. La printare, selectează "Actual size".</p>
          </div>

          {results.length > 0 && (
            <div className="mt-4 pt-4 border-t">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-medium">Rezultate procesare</p>
                  <p className="text-xs text-muted-foreground">
                    {successCount} succes / {failedCount} erori
                  </p>
                </div>
                {onClearResults && (
                  <Button size="sm" variant="ghost" onClick={onClearResults}>
                    Curăță
                  </Button>
                )}
              </div>

              <div className="max-h-64 overflow-auto rounded-md border">
                <div className="divide-y">
                  {results.map((result, idx) => (
                    <div key={`${result.action}-${result.orderNumber}-${idx}`} className="p-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">
                          #{result.orderNumber} - {result.action}
                        </span>
                        <span className={result.success ? "text-green-600" : "text-red-600"}>
                          {result.success ? "Succes" : "Eroare"}
                        </span>
                      </div>
                      {result.message && (
                        <p className="text-muted-foreground mt-1 break-words">{result.message}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
