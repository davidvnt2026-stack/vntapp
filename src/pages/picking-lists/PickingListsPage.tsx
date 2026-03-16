import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "../../contexts/AuthContext";
import { useStore } from "../../contexts/StoreContext";
import { Button } from "../../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Input } from "../../components/ui/Input";
import {
  ClipboardList,
  ChevronRight,
  Package,
  Eye,
  Plus,
  Trash2,
  Calendar,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import type { Id } from "../../../convex/_generated/dataModel";

export function PickingListsPage() {
  const { token } = useAuth();
  const { selectedShopDomain } = useStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const pickingLists = useQuery(
    api.pickingLists.list,
    token ? { token, shopDomain: selectedShopDomain || undefined } : "skip"
  );
  
  const createPickingList = useMutation(api.pickingLists.create);
  const deletePickingList = useMutation(api.pickingLists.remove);

  const handleCreate = async () => {
    if (!token || !newListName.trim()) return;
    setCreating(true);
    try {
      await createPickingList({ token, name: newListName.trim(), shopDomain: selectedShopDomain || undefined });
      toast.success(`Picking list "${newListName}" creat`);
      setNewListName("");
      setShowCreateModal(false);
    } catch (error: any) {
      toast.error(error.message || "Eroare la creare");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: Id<"pickingLists">, name: string) => {
    if (!token) return;
    if (!confirm(`Sigur vrei să ștergi "${name}"?`)) return;
    
    setDeletingId(id);
    try {
      await deletePickingList({ token, pickingListId: id });
      toast.success(`Picking list "${name}" șters`);
    } catch (error: any) {
      toast.error(error.message || "Eroare la ștergere");
    } finally {
      setDeletingId(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending": return "bg-yellow-100 text-yellow-700";
      case "in_progress": return "bg-blue-100 text-blue-700";
      case "completed": return "bg-green-100 text-green-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending": return "În așteptare";
      case "in_progress": return "În lucru";
      case "completed": return "Finalizat";
      default: return status;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ClipboardList className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Picking Lists</h1>
            <p className="text-muted-foreground">Gestionează liste de picking pentru comenzi</p>
          </div>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Picking List Nou
        </Button>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>Creează Picking List Nou</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Quick option - Use Today's Date */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Opțiune rapidă</label>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2 h-auto py-3"
                  onClick={() => {
                    const today = new Date();
                    const day = today.getDate().toString().padStart(2, "0");
                    const month = (today.getMonth() + 1).toString().padStart(2, "0");
                    const year = today.getFullYear();
                    setNewListName(`Picking List ${day}.${month}.${year}`);
                  }}
                >
                  <Calendar className="h-4 w-4 text-primary" />
                  <div className="flex flex-col items-start">
                    <span>Folosește data de azi</span>
                    <span className="text-xs text-muted-foreground">
                      Picking List {new Date().getDate().toString().padStart(2, "0")}.{(new Date().getMonth() + 1).toString().padStart(2, "0")}.{new Date().getFullYear()}
                    </span>
                  </div>
                </Button>
              </div>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">sau</span>
                </div>
              </div>

              {/* Custom name input */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Nume personalizat</label>
                <Input
                  placeholder="Ex: Comenzi urgente, Black Friday, etc."
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && newListName.trim() && handleCreate()}
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => { setShowCreateModal(false); setNewListName(""); }}>
                  Anulează
                </Button>
                <Button onClick={handleCreate} loading={creating} disabled={!newListName.trim()}>
                  Creează
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Picking Lists */}
      <Card>
        <CardHeader>
          <CardTitle>Liste de Picking</CardTitle>
        </CardHeader>
        <CardContent>
          {pickingLists === undefined ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse flex items-center gap-4 p-4 border rounded-lg">
                  <div className="h-12 w-16 bg-muted rounded" />
                  <div className="flex-1">
                    <div className="h-4 w-48 bg-muted rounded mb-2" />
                    <div className="h-3 w-32 bg-muted rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : pickingLists.length === 0 ? (
            <div className="py-12 text-center">
              <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground" />
              <h3 className="mt-4 text-lg font-medium">Nicio listă de picking</h3>
              <p className="mt-2 text-muted-foreground">
                Creează o listă nouă și adaugă comenzi din pagina Orders
              </p>
              <Button className="mt-4" onClick={() => setShowCreateModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Creează Prima Listă
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {pickingLists.map((list) => (
                <div
                  key={list._id}
                  className="flex items-center gap-4 p-4 border rounded-lg hover:border-primary/50 hover:bg-accent/50 transition-all group"
                >
                  {/* Date/Icon */}
                  <div className="flex flex-col items-center justify-center min-w-[60px] h-14 bg-primary/10 rounded-lg">
                    <Calendar className="h-5 w-5 text-primary" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{list.name}</span>
                      <Badge className={getStatusColor(list.status)}>
                        {getStatusLabel(list.status)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Package className="h-3.5 w-3.5" />
                        {list.orderCount} comenzi
                      </span>
                      <span>
                        Creat: {new Date(list.createdAt).toLocaleDateString('ro-RO')}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <Link to={`/picking-lists/${list._id}`}>
                      <Button variant="ghost" size="sm">
                        <Eye className="h-4 w-4 mr-1" />
                        Vezi
                      </Button>
                    </Link>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault();
                        handleDelete(list._id, list.name);
                      }}
                      disabled={deletingId === list._id}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      {deletingId === list._id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                    <Link to={`/picking-lists/${list._id}`}>
                      <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Help Text */}
      <Card className="bg-muted/30">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <ClipboardList className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h4 className="font-medium">Cum funcționează?</h4>
              <p className="text-sm text-muted-foreground mt-1">
                1. Creează o listă de picking nouă<br />
                2. Mergi la pagina <Link to="/orders" className="text-primary hover:underline">Orders</Link> și folosește butonul <span className="inline-flex items-center px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium"><Plus className="h-3 w-3 mr-0.5" />+</span> pentru a adăuga comenzi<br />
                3. Poți selecta mai multe comenzi și le poți adăuga toate odată<br />
                4. Deschide lista pentru a vedea toate comenzile și a genera AWB/facturi
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
