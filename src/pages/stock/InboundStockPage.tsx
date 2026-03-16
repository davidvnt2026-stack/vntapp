import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "../../contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Badge } from "../../components/ui/Badge";
import {
  Package,
  Plus,
  Search,
  Check,
  Truck,
  Calendar,
  Clock,
  Ban,
  Trash2,
  ArrowRightLeft,
  AlertTriangle,
} from "lucide-react";
import { formatCurrency } from "../../lib/utils";
import { format } from "date-fns";
import { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";

interface InboundFormData {
  date: string;
  sku: string;
  quantity: string;
  supplier: string;
  purchaseOrderNumber: string;
  unitCost: string;
  notes: string;
  status: "pending" | "received";
}

interface TransferFormData {
  date: string;
  sku: string;
  quantity: string;
  destination: string;
  notes: string;
}

const defaultFormData: InboundFormData = {
  date: format(new Date(), "yyyy-MM-dd"),
  sku: "",
  quantity: "",
  supplier: "",
  purchaseOrderNumber: "",
  unitCost: "",
  notes: "",
  status: "received",
};

const defaultTransferFormData: TransferFormData = {
  date: format(new Date(), "yyyy-MM-dd"),
  sku: "",
  quantity: "",
  destination: "",
  notes: "",
};

export function InboundStockPage() {
  const { token } = useAuth();
  
  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<Id<"inboundStock"> | null>(null);
  const [processingInboundId, setProcessingInboundId] = useState<Id<"inboundStock"> | null>(null);
  const [formData, setFormData] = useState<InboundFormData>(defaultFormData);
  const [transferFormData, setTransferFormData] = useState<TransferFormData>(defaultTransferFormData);

  // Queries
  const inboundRecords = useQuery(
    api.inboundStock.list,
    token ? { token, status: statusFilter || undefined } : "skip"
  );
  const pendingRecords = useQuery(api.inboundStock.getPending, token ? { token } : "skip");
  const skus = useQuery(api.skus.list, token ? { token } : "skip");
  const suppliers = useQuery(api.inboundStock.getSuppliers, token ? { token } : "skip");

  // Mutations
  const createInbound = useMutation(api.inboundStock.create);
  const markReceived = useMutation(api.inboundStock.markReceived);
  const cancelInbound = useMutation(api.inboundStock.cancel);
  const createTransfer = useMutation(api.inboundStock.createTransfer);
  const removeInbound = useMutation(api.inboundStock.remove);

  // Filter records
  const filteredRecords = inboundRecords?.filter((record) => {
    const matchesSearch =
      record.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.supplier?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.purchaseOrderNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.transferDestination?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  // Calculate totals
  const totalQuantity = filteredRecords?.reduce((sum, r) => sum + r.quantity, 0) ?? 0;
  const receivedCount = filteredRecords?.filter((r) => r.status === "received").length ?? 0;
  const pendingCount = filteredRecords?.filter((r) => r.status === "pending").length ?? 0;
  const transferredCount = filteredRecords?.filter((r) => r.status === "transferred").length ?? 0;
  const transferInTableCount =
    filteredRecords?.filter((r) => r.status === "transferred" || r.status === "in_transfer").length ?? 0;
  const inboundInTableCount = Math.max(0, (filteredRecords?.length ?? 0) - transferInTableCount);

  // Handlers
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    try {
      await createInbound({
        token,
        date: formData.date,
        sku: formData.sku,
        quantity: parseInt(formData.quantity),
        supplier: formData.supplier || undefined,
        purchaseOrderNumber: formData.purchaseOrderNumber || undefined,
        unitCost: formData.unitCost ? parseFloat(formData.unitCost) : undefined,
        notes: formData.notes || undefined,
        status: formData.status,
        autoUpdateStock: formData.status === "received",
      });
      setShowAddModal(false);
      setFormData(defaultFormData);
    } catch (error) {
      console.error("Failed to create inbound record:", error);
    }
  };

  const handleMarkReceived = async (inboundId: Id<"inboundStock">) => {
    if (!token) return;
    setProcessingInboundId(inboundId);
    try {
      await markReceived({ token, inboundId });
      toast.success("Înregistrarea a fost marcată ca recepționată.");
    } catch (error) {
      console.error("Failed to mark as received:", error);
      toast.error(error instanceof Error ? error.message : "Nu am putut marca înregistrarea ca recepționată.");
    } finally {
      setProcessingInboundId(null);
    }
  };

  const handleCancel = async (inboundId: Id<"inboundStock">) => {
    if (!token) return;
    if (confirm("Are you sure you want to cancel this inbound record?")) {
      try {
        await cancelInbound({ token, inboundId });
      } catch (error) {
        console.error("Failed to cancel:", error);
      }
    }
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    try {
      await createTransfer({
        token,
        date: transferFormData.date,
        sku: transferFormData.sku,
        quantity: parseInt(transferFormData.quantity),
        destination: transferFormData.destination,
        notes: transferFormData.notes || undefined,
      });
      setShowTransferModal(false);
      setTransferFormData(defaultTransferFormData);
    } catch (error) {
      console.error("Failed to create transfer:", error);
    }
  };

  const handleDelete = async (inboundId: Id<"inboundStock">) => {
    if (!token) return;
    try {
      const result = await removeInbound({ token, inboundId, adjustStock: true });
      if (result.stockAdjusted) {
        console.log(`Stock adjusted: -${result.adjustedQuantity} for ${result.sku}`);
      }
      setShowDeleteConfirm(null);
    } catch (error) {
      console.error("Failed to delete:", error);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "received":
        return <Badge variant="success">Recepționat</Badge>;
      case "pending":
        return <Badge variant="warning">În așteptare</Badge>;
      case "in_transfer":
        return <Badge variant="default" className="bg-blue-500 hover:bg-blue-600">În transfer</Badge>;
      case "transferred":
        return <Badge variant="default" className="bg-indigo-500 hover:bg-indigo-600">Transferat</Badge>;
      case "cancelled":
        return <Badge variant="secondary">Anulat</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Inbound Stock</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowTransferModal(true)}>
            <ArrowRightLeft className="h-4 w-4 mr-2" />
            Transfer Stoc
          </Button>
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Adaugă Inbound
          </Button>
        </div>
      </div>

      {/* Pending & Transfer Alerts */}
      {pendingRecords && pendingRecords.length > 0 && (
        <div className="bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Clock className="h-5 w-5 text-amber-600 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-800 dark:text-amber-200">
                {pendingRecords.length} Livrări în așteptare
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                Ai stoc de intrare care așteaptă să fie marcat ca recepționat
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Package className="h-4 w-4" />
              Total Înregistrări
            </div>
            <p className="text-2xl font-bold mt-1">{inboundRecords?.length ?? 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-green-600">
              <Check className="h-4 w-4" />
              Recepționate
            </div>
            <p className="text-2xl font-bold mt-1 text-green-600">{receivedCount}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-amber-600">
              <Clock className="h-4 w-4" />
              În Așteptare
            </div>
            <p className="text-2xl font-bold mt-1 text-amber-600">{pendingCount}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-blue-600">
              <ArrowRightLeft className="h-4 w-4" />
              Transferate
            </div>
            <p className="text-2xl font-bold mt-1 text-blue-600">{transferredCount}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Truck className="h-4 w-4" />
              Total Unități
            </div>
            <p className="text-2xl font-bold mt-1">{totalQuantity.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search SKU, supplier, or PO..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Status:</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Toate</option>
                <option value="pending">În așteptare</option>
                <option value="in_transfer">În transfer (legacy)</option>
                <option value="transferred">Transferat</option>
                <option value="received">Recepționat</option>
                <option value="cancelled">Anulat</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stock Records Table */}
      <Card>
        <CardHeader>
          <CardTitle>Înregistrări Stoc ({filteredRecords?.length ?? 0})</CardTitle>
          <p className="text-sm text-muted-foreground">
            Include: {inboundInTableCount} inbound + {transferInTableCount} transferuri
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="px-4 py-3 text-left font-medium">Data</th>
                  <th className="px-4 py-3 text-left font-medium">SKU</th>
                  <th className="px-4 py-3 text-center font-medium">Tip</th>
                  <th className="px-4 py-3 text-right font-medium">Cantitate</th>
                  <th className="px-4 py-3 text-left font-medium">Furnizor / Destinație</th>
                  <th className="px-4 py-3 text-left font-medium">PO #</th>
                  <th className="px-4 py-3 text-right font-medium">Preț Unit</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 text-center font-medium">Status</th>
                  <th className="px-4 py-3 text-center font-medium">Acțiuni</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords?.map((record) => (
                  <tr
                    key={record._id}
                    className={`border-b hover:bg-muted/50 ${
                      record.status === "cancelled" ? "opacity-50" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        {record.date}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono font-medium">{record.sku}</td>
                    <td className="px-4 py-3 text-center">
                      {record.status === "in_transfer" || record.status === "transferred" ? (
                        <Badge variant="info">Transfer</Badge>
                      ) : (
                        <Badge variant="secondary">Inbound</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {record.quantity.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      {record.status === "in_transfer" || record.status === "transferred" ? (
                        <span className="text-blue-600 flex items-center gap-1">
                          <ArrowRightLeft className="h-3 w-3" />
                          {record.transferDestination || "-"}
                        </span>
                      ) : (
                        record.supplier || "-"
                      )}
                    </td>
                    <td className="px-4 py-3">{record.purchaseOrderNumber || "-"}</td>
                    <td className="px-4 py-3 text-right">
                      {record.unitCost ? formatCurrency(record.unitCost) : "-"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {record.totalCost ? formatCurrency(record.totalCost) : "-"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {getStatusBadge(record.status)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        {record.status === "pending" && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleMarkReceived(record._id)}
                              disabled={processingInboundId === record._id}
                              title="Marchează recepționat"
                            >
                              <Check className="h-4 w-4 text-green-600 mr-1" />
                              Recepționat
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCancel(record._id)}
                              title="Anulează"
                            >
                              <Ban className="h-4 w-4 text-red-600" />
                            </Button>
                          </>
                        )}
                        {record.status === "in_transfer" && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCancel(record._id)}
                              title="Anulează (legacy)"
                            >
                              <Ban className="h-4 w-4 text-red-600" />
                            </Button>
                          </>
                        )}
                        {record.status !== "cancelled" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowDeleteConfirm(record._id)}
                            title="Șterge (va anula și modificarea stocului)"
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredRecords?.length === 0 && (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      Nu s-au găsit înregistrări
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg shadow-lg w-full max-w-md p-6 m-4">
            <h2 className="text-xl font-bold mb-4">Adaugă Stoc de Intrare</h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium">Data *</label>
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="text-sm font-medium">SKU *</label>
                <select
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  required
                >
                  <option value="">Selectează SKU...</option>
                  {skus?.map((sku) => (
                    <option key={sku._id} value={sku.sku}>
                      {sku.sku} - {sku.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium">Cantitate *</label>
                <Input
                  type="number"
                  value={formData.quantity}
                  onChange={(e) =>
                    setFormData({ ...formData, quantity: e.target.value })
                  }
                  placeholder="Introdu cantitatea"
                  min="1"
                  required
                />
              </div>

              <div>
                <label className="text-sm font-medium">Furnizor</label>
                <Input
                  value={formData.supplier}
                  onChange={(e) =>
                    setFormData({ ...formData, supplier: e.target.value })
                  }
                  placeholder="Nume furnizor"
                  list="suppliers"
                />
                <datalist id="suppliers">
                  {suppliers?.map((sup) => (
                    <option key={sup} value={sup} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="text-sm font-medium">Nr. Comandă Achiziție</label>
                <Input
                  value={formData.purchaseOrderNumber}
                  onChange={(e) =>
                    setFormData({ ...formData, purchaseOrderNumber: e.target.value })
                  }
                  placeholder="Nr. PO"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Preț Unitar (RON)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.unitCost}
                  onChange={(e) =>
                    setFormData({ ...formData, unitCost: e.target.value })
                  }
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Note</label>
                <Input
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Note opționale"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Status</label>
                <div className="flex gap-4 mt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="status"
                      value="received"
                      checked={formData.status === "received"}
                      onChange={() => setFormData({ ...formData, status: "received" })}
                    />
                    <span>Recepționat (actualizează stoc)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="status"
                      value="pending"
                      checked={formData.status === "pending"}
                      onChange={() => setFormData({ ...formData, status: "pending" })}
                    />
                    <span>În așteptare</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowAddModal(false);
                    setFormData(defaultFormData);
                  }}
                >
                  Anulează
                </Button>
                <Button type="submit">Adaugă</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transfer Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg shadow-lg w-full max-w-md p-6 m-4">
            <h2 className="text-xl font-bold mb-4">Transfer Stoc la Alt Depozit</h2>

            <form onSubmit={handleTransferSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium">Selectează SKU</label>
                <select
                  value={transferFormData.sku}
                  onChange={(e) => setTransferFormData({ ...transferFormData, sku: e.target.value })}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  required
                >
                  <option value="">Alege un SKU</option>
                  {skus?.map((sku) => (
                    <option key={sku._id} value={sku.sku}>
                      {sku.sku} - {sku.name} (Stoc: {sku.currentStock})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium">Destinație *</label>
                <Input
                  value={transferFormData.destination}
                  onChange={(e) => setTransferFormData({ ...transferFormData, destination: e.target.value })}
                  placeholder="Ex: Depozit București, FAN Courier, etc."
                  required
                />
              </div>

              <div>
                <label className="text-sm font-medium">Cantitate de transferat *</label>
                <Input
                  type="number"
                  value={transferFormData.quantity}
                  onChange={(e) => setTransferFormData({ ...transferFormData, quantity: e.target.value })}
                  placeholder="Introdu cantitatea"
                  min="1"
                  required
                />
              </div>

              <div>
                <label className="text-sm font-medium">Note (opțional)</label>
                <textarea
                  value={transferFormData.notes}
                  onChange={(e) => setTransferFormData({ ...transferFormData, notes: e.target.value })}
                  placeholder="Note adiționale..."
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px]"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowTransferModal(false);
                    setTransferFormData(defaultTransferFormData);
                  }}
                >
                  Anulează
                </Button>
                <Button type="submit">
                  <ArrowRightLeft className="h-4 w-4 mr-2" />
                  Transferă
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg shadow-lg w-full max-w-md p-6 m-4">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Confirmare Ștergere</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Această acțiune va șterge înregistrarea de stoc și va anula modificările făcute în stoc.
                </p>
              </div>
            </div>

            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mb-4">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                <strong>Atenție:</strong> Dacă această înregistrare a adăugat stoc (status "Recepționat"), 
                ștergerea va deduce automat cantitatea din stocul curent.
              </p>
            </div>

            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowDeleteConfirm(null)}
              >
                Anulează
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleDelete(showDeleteConfirm)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Șterge și Anulează Stoc
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
