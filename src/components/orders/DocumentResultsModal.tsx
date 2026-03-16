import { Button } from "../ui/Button";
import { Card, CardContent } from "../ui/Card";
import { CheckCircle2, AlertCircle, FileCheck2, X, Loader2 } from "lucide-react";
import type { DocumentProcessResult } from "./PrintModal";

interface DocumentResultsModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  results: DocumentProcessResult[];
  isProcessing?: boolean;
  progress?: { phase: string; processed: number; total: number } | null;
  onPrintAwb?: () => void;
  onPrintInvoice?: () => void;
  onPrintBoth?: () => void;
}

export function DocumentResultsModal({
  isOpen,
  onClose,
  title = "Rezultate generare documente",
  results,
  isProcessing = false,
  progress = null,
  onPrintAwb,
  onPrintInvoice,
  onPrintBoth,
}: DocumentResultsModalProps) {
  if (!isOpen) return null;

  const ERROR_MESSAGE_MAX_LENGTH = 150;
  const truncateMessage = (message?: string) => {
    if (!message) return undefined;
    const normalized = message.trim();
    if (!normalized) return undefined;
    if (normalized.length <= ERROR_MESSAGE_MAX_LENGTH) return normalized;
    return `${normalized.slice(0, ERROR_MESSAGE_MAX_LENGTH - 1).trimEnd()}…`;
  };

  const successCount = results.filter((r) => r.success).length;
  const failedCount = results.length - successCount;
  const awbResults = results.filter((r) => r.action.toLowerCase().includes("awb"));
  const invoiceResults = results.filter((r) => r.action.toLowerCase().includes("factur"));
  const hasMixedActions = awbResults.length > 0 && invoiceResults.length > 0;
  const awbSuccess = awbResults.filter((r) => r.success).length;
  const awbFailed = awbResults.length - awbSuccess;
  const invoiceSuccess = invoiceResults.filter((r) => r.success).length;
  const invoiceFailed = invoiceResults.length - invoiceSuccess;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-4xl">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <FileCheck2 className="h-5 w-5" />
              {title}
            </h2>
            <Button size="sm" variant="ghost" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          {hasMixedActions ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="rounded-md border p-3 bg-green-50">
                <p className="text-xs text-muted-foreground">AWB - Succes</p>
                <p className="text-2xl font-bold text-green-700">{awbSuccess}</p>
              </div>
              <div className="rounded-md border p-3 bg-red-50">
                <p className="text-xs text-muted-foreground">AWB - Erori</p>
                <p className="text-2xl font-bold text-red-700">{awbFailed}</p>
              </div>
              <div className="rounded-md border p-3 bg-green-50">
                <p className="text-xs text-muted-foreground">Facturi - Succes</p>
                <p className="text-2xl font-bold text-green-700">{invoiceSuccess}</p>
              </div>
              <div className="rounded-md border p-3 bg-red-50">
                <p className="text-xs text-muted-foreground">Facturi - Erori</p>
                <p className="text-2xl font-bold text-red-700">{invoiceFailed}</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-md border p-3 bg-green-50">
                <p className="text-xs text-muted-foreground">Succes</p>
                <p className="text-2xl font-bold text-green-700">{successCount}</p>
              </div>
              <div className="rounded-md border p-3 bg-red-50">
                <p className="text-xs text-muted-foreground">Erori</p>
                <p className="text-2xl font-bold text-red-700">{failedCount}</p>
              </div>
            </div>
          )}

          {isProcessing && progress && (
            <div className="mb-4 p-3 rounded-md border bg-muted/40">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-medium inline-flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {progress.phase}
                </span>
                <span>{Math.min(progress.processed, progress.total)}/{progress.total}</span>
              </div>
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

          {results.length === 0 ? (
            <div className="max-h-80 overflow-auto rounded-md border">
              <div className="p-4 text-sm text-muted-foreground">Nu există rezultate.</div>
            </div>
          ) : hasMixedActions ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="max-h-80 overflow-auto rounded-md border">
                <div className="p-3 text-sm font-semibold border-b bg-muted/40">Rezultate AWB</div>
                <div className="divide-y">
                  {awbResults.map((result, idx) => (
                    <div key={`awb-${result.orderNumber}-${idx}`} className="p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">#{result.orderNumber}</span>
                        <span className={`inline-flex items-center gap-1 ${result.success ? "text-green-600" : "text-red-600"}`}>
                          {result.success ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                          {result.success ? "Succes" : "Eroare"}
                        </span>
                      </div>
                      {result.message && (
                        <p className="text-muted-foreground mt-1 break-words">{truncateMessage(result.message)}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="max-h-80 overflow-auto rounded-md border">
                <div className="p-3 text-sm font-semibold border-b bg-muted/40">Rezultate Facturi</div>
                <div className="divide-y">
                  {invoiceResults.map((result, idx) => (
                    <div key={`inv-${result.orderNumber}-${idx}`} className="p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">#{result.orderNumber}</span>
                        <span className={`inline-flex items-center gap-1 ${result.success ? "text-green-600" : "text-red-600"}`}>
                          {result.success ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                          {result.success ? "Succes" : "Eroare"}
                        </span>
                      </div>
                      {result.message && (
                        <p className="text-muted-foreground mt-1 break-words">{truncateMessage(result.message)}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="max-h-80 overflow-auto rounded-md border">
              <div className="divide-y">
                {results.map((result, idx) => (
                  <div key={`${result.action}-${result.orderNumber}-${idx}`} className="p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        #{result.orderNumber} - {result.action}
                      </span>
                      <span className={`inline-flex items-center gap-1 ${result.success ? "text-green-600" : "text-red-600"}`}>
                        {result.success ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                        {result.success ? "Succes" : "Eroare"}
                      </span>
                    </div>
                    {result.message && (
                      <p className="text-muted-foreground mt-1 break-words">{truncateMessage(result.message)}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isProcessing && (onPrintAwb || onPrintInvoice || onPrintBoth) && (
            <div className="mt-4 p-3 rounded-md border bg-muted/30">
              <p className="text-xs text-muted-foreground mb-2">
                Acțiuni rapide de print
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {onPrintAwb && (
                  <Button variant="outline" onClick={onPrintAwb}>
                    Print AWB
                  </Button>
                )}
                {onPrintInvoice && (
                  <Button variant="outline" onClick={onPrintInvoice}>
                    Print invoice
                  </Button>
                )}
                {onPrintBoth && (
                  <Button onClick={onPrintBoth}>
                    Print both
                  </Button>
                )}
              </div>
            </div>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <Button onClick={onClose} disabled={isProcessing}>Închide</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
