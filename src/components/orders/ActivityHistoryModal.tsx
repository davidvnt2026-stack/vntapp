import { X, Loader2 } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { cn } from "../../lib/utils";
import { useAuth } from "../../contexts/AuthContext";
import { Order, ActivityHistoryEntry } from "./types";

interface ActivityHistoryModalProps {
  order: Order;
  onClose: () => void;
}

type ActivitySource = "manual" | "automatic" | "unknown";

const ACTION_CONFIG: Record<
  string,
  { label: string; color: string; source: ActivitySource }
> = {
  // AWB / Tracking
  awb_generated: { label: "AWB Generat", color: "bg-blue-100 text-blue-700", source: "manual" },
  awb_cancelled: { label: "AWB Anulat", color: "bg-red-100 text-red-700", source: "manual" },
  // Invoice
  invoice_created: { label: "Factură Generată", color: "bg-green-100 text-green-700", source: "manual" },
  invoice_stornoed: { label: "Factură Stornată", color: "bg-red-100 text-red-700", source: "manual" },
  // Delivery
  delivery_status_changed: { label: "Status Livrare", color: "bg-cyan-100 text-cyan-700", source: "automatic" },
  // Worked
  marked_worked: { label: "Lucrat", color: "bg-emerald-100 text-emerald-700", source: "manual" },
  unmarked_worked: { label: "Demarcat", color: "bg-amber-100 text-amber-700", source: "manual" },
  // Print
  printed: { label: "Printat", color: "bg-purple-100 text-purple-700", source: "manual" },
  // Returns
  order_marked_returned: { label: "Retur", color: "bg-orange-100 text-orange-700", source: "manual" },
  return_unmarked: { label: "Retur Anulat", color: "bg-orange-100 text-orange-600", source: "manual" },
  return_stock_added: { label: "Retur Stoc", color: "bg-orange-100 text-orange-700", source: "manual" },
  // Order lifecycle
  created: { label: "Creat", color: "bg-gray-100 text-gray-700", source: "automatic" },
  webhook_created: { label: "Webhook", color: "bg-gray-100 text-gray-600", source: "automatic" },
  webhook_update: { label: "Webhook Update", color: "bg-gray-100 text-gray-600", source: "automatic" },
  // Edits
  notes_updated: { label: "Notita Editata", color: "bg-indigo-100 text-indigo-700", source: "manual" },
  phone_updated: { label: "Telefon Editat", color: "bg-indigo-100 text-indigo-700", source: "manual" },
  address_updated: { label: "Adresă Editată", color: "bg-indigo-100 text-indigo-700", source: "manual" },
  items_updated: { label: "Produse Editate", color: "bg-indigo-100 text-indigo-700", source: "manual" },
  customer_details_updated: { label: "Client Editat", color: "bg-indigo-100 text-indigo-700", source: "manual" },
  status_changed: { label: "Status Schimbat", color: "bg-yellow-100 text-yellow-700", source: "manual" },
  // Cancel
  cancelled: { label: "Anulat", color: "bg-red-100 text-red-700", source: "manual" },
  revert_cancel: { label: "Restaurat", color: "bg-green-100 text-green-700", source: "manual" },
  cancel_reverted: { label: "Restaurat", color: "bg-green-100 text-green-700", source: "manual" },
};

function getActionConfig(
  action: string
): { label: string; color: string; source: ActivitySource } {
  return (
    ACTION_CONFIG[action] || {
      label: action,
      color: "bg-gray-100 text-gray-600",
      source: "unknown",
    }
  );
}

function getSourceLabel(source: ActivitySource): string {
  if (source === "manual") return "Manual";
  if (source === "automatic") return "Automatic";
  return "Necunoscut";
}

function formatTimestamp(ts: string): { date: string; time: string } {
  try {
    const d = new Date(ts);
    return {
      date: d.toLocaleDateString("ro-RO", { day: "2-digit", month: "2-digit", year: "numeric" }),
      time: d.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    };
  } catch {
    return { date: ts, time: "" };
  }
}

function renderDetails(entry: ActivityHistoryEntry) {
  const details = entry.details;
  if (!details) return null;

  const items: { label: string; value: string }[] = [];

  if (details.awbNumber) items.push({ label: "AWB", value: String(details.awbNumber) });
  if (details.trackingCompany) items.push({ label: "Curier", value: String(details.trackingCompany) });
  if (details.invoiceNumber) items.push({ label: "Factură", value: `${details.invoiceSeries || ""}${details.invoiceNumber}` });
  if (details.oldStatus && details.newStatus) items.push({ label: "Status", value: `${details.oldStatus} → ${details.newStatus}` });
  if (details.documentType) items.push({ label: "Document", value: String(details.documentType) });
  if (details.isWorked !== undefined) items.push({ label: "Lucrat", value: details.isWorked ? "Da" : "Nu" });
  if (details.stockDeducted !== undefined) items.push({ label: "Stoc Dedus", value: details.stockDeducted ? "Da" : "Nu" });

  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
      {items.map((item, i) => (
        <span key={i} className="text-xs text-muted-foreground">
          <span className="font-medium">{item.label}:</span> <span className="font-mono">{item.value}</span>
        </span>
      ))}
    </div>
  );
}

export function ActivityHistoryModal({ order, onClose }: ActivityHistoryModalProps) {
  const { token } = useAuth();
  const shouldFetchFullOrder = order.activityHistory === undefined;

  // Fetch full order document (listPaginated projection strips activityHistory)
  const fullOrder = useQuery(
    api.orders.getById,
    token && shouldFetchFullOrder
      ? { token, id: order._id as Id<"shopifyOrders"> }
      : "skip"
  );

  const entries = [...((fullOrder?.activityHistory ?? order.activityHistory) || [])].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const isLoading = fullOrder === undefined && token;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[85vh] flex flex-col">
        <CardHeader className="flex-shrink-0 flex flex-row items-center justify-between pb-4">
          <CardTitle className="text-lg">
            Istoric Activitate — #{order.orderNumber}
          </CardTitle>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-accent rounded-md text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto pb-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              <span>Se încarcă istoricul...</span>
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg font-medium">Nicio activitate înregistrată</p>
              <p className="text-sm mt-1">Acțiunile viitoare vor fi afișate aici.</p>
            </div>
          ) : (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-[18px] top-2 bottom-2 w-px bg-border" />

              <div className="space-y-0">
                {entries.map((entry, idx) => {
                  const config = getActionConfig(entry.action);
                  const ts = formatTimestamp(entry.timestamp);
                  const isFirst = idx === 0;

                  return (
                    <div key={idx} className="relative flex gap-3 pb-4">
                      {/* Timeline dot */}
                      <div className="relative z-10 flex-shrink-0 mt-1.5">
                        <div
                          className={cn(
                            "w-[10px] h-[10px] rounded-full border-2 border-background",
                            isFirst ? "bg-primary" : "bg-muted-foreground/40"
                          )}
                        />
                      </div>

                      {/* Content */}
                      <div className={cn(
                        "flex-1 min-w-0 rounded-lg p-3 -mt-0.5",
                        isFirst ? "bg-primary/5 border border-primary/20" : "hover:bg-muted/50"
                      )}>
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={cn("text-[11px] px-2 py-0 font-medium", config.color)}>
                              {config.label} ({getSourceLabel(config.source)})
                            </Badge>
                            {entry.userName && (
                              <span className="text-xs text-muted-foreground">
                                de {entry.userName}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground whitespace-nowrap">
                            <span>{ts.date}</span>
                            {ts.time && <span className="ml-1 font-mono">{ts.time}</span>}
                          </div>
                        </div>
                        <p className="text-sm mt-1">{entry.description}</p>
                        {renderDetails(entry)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
