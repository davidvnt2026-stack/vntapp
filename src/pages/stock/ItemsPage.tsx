import React, { useState } from "react";
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
  Edit,
  AlertTriangle,
  Check,
  X,
  Tag,
  ChevronDown,
  ChevronRight,
  Store,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Id } from "../../../convex/_generated/dataModel";

interface SkuFormData {
  sku: string;
  name: string;
  description: string;
  category: string;
  currentStock: string;
  lowStockThreshold: string;
  isBundle: boolean;
  componentSku1: string;
  componentSku2: string;
}

const defaultFormData: SkuFormData = {
  sku: "",
  name: "",
  description: "",
  category: "",
  currentStock: "0",
  lowStockThreshold: "50",
  isBundle: false,
  componentSku1: "",
  componentSku2: "",
};

export function ItemsPage() {
  const { token } = useAuth();
  
  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<Id<"skus"> | null>(null);
  const [formData, setFormData] = useState<SkuFormData>(defaultFormData);
  const [showInactive, setShowInactive] = useState(false);
  const [expandedSkus, setExpandedSkus] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // Queries - use listWithOverrides to include per-store data
  const skus = useQuery(
    api.skus.listWithOverrides,
    token ? { token, includeInactive: showInactive } : "skip"
  );
  const categories = useQuery(api.skus.getCategories, token ? { token } : "skip");
  const lowStockSkus = useQuery(api.skus.getLowStock, token ? { token } : "skip");
  const bundles = useQuery(api.skus.getBundles, token ? { token } : "skip");
  const stockSettings = useQuery(api.settings.get, token ? { token } : "skip");

  const sharedStockEnabled = stockSettings?.sharedStockEnabled ?? false;

  // Mutations
  const createSku = useMutation(api.skus.create);
  const updateSku = useMutation(api.skus.update);
  const deactivateSku = useMutation(api.skus.deactivate);
  const reactivateSku = useMutation(api.skus.reactivate);
  const cleanupJunkSkus = useMutation(api.skus.cleanupJunkSkus);
  const upsertBundle = useMutation(api.skus.upsertBundle);
  const removeBundle = useMutation(api.skus.removeBundle);

  // Filter SKUs
  const filteredSkus = skus?.filter((sku) => {
    const matchesSearch =
      sku.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sku.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !selectedCategory || sku.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });
  const bundleBySku = new Map(
    (bundles || []).filter((b) => b.isActive).map((b) => [b.bundleSku, b])
  );

  // Handlers
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || saving) return;

    setSaving(true);
    try {
      if (editingId) {
        await updateSku({
          token,
          skuId: editingId,
          name: formData.name,
          description: formData.description || undefined,
          category: formData.category || undefined,
          lowStockThreshold: parseInt(formData.lowStockThreshold),
        });
        if (formData.isBundle) {
          if (!formData.componentSku1 || !formData.componentSku2) {
            throw new Error("Selectează ambele SKU-uri componente pentru bundle.");
          }
          await upsertBundle({
            token,
            bundleSku: formData.sku,
            componentSku1: formData.componentSku1,
            componentSku2: formData.componentSku2,
            isActive: true,
          });
        } else {
          await removeBundle({ token, bundleSku: formData.sku });
        }
        toast.success("SKU actualizat cu succes!");
      } else {
        await createSku({
          token,
          sku: formData.sku,
          name: formData.name,
          description: formData.description || undefined,
          category: formData.category || undefined,
          currentStock: parseInt(formData.currentStock),
          lowStockThreshold: parseInt(formData.lowStockThreshold),
        });
        if (formData.isBundle) {
          if (!formData.componentSku1 || !formData.componentSku2) {
            throw new Error("Selectează ambele SKU-uri componente pentru bundle.");
          }
          await upsertBundle({
            token,
            bundleSku: formData.sku,
            componentSku1: formData.componentSku1,
            componentSku2: formData.componentSku2,
            isActive: true,
          });
        }
        toast.success(`SKU ${formData.sku} adăugat cu succes!`);
      }
      setShowAddModal(false);
      setEditingId(null);
      setFormData(defaultFormData);
    } catch (error: any) {
      console.error("Failed to save SKU:", error);
      toast.error(error.message || "Eroare la salvarea SKU-ului. Încearcă din nou.");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (sku: NonNullable<typeof skus>[number]) => {
    const bundle = bundleBySku.get(sku.sku);
    setEditingId(sku._id);
    setFormData({
      sku: sku.sku,
      name: sku.name,
      description: sku.description || "",
      category: sku.category || "",
      currentStock: sku.currentStock.toString(),
      lowStockThreshold: sku.lowStockThreshold.toString(),
      isBundle: !!bundle,
      componentSku1: bundle?.componentSku1 || "",
      componentSku2: bundle?.componentSku2 || "",
    });
    setShowAddModal(true);
  };

  const handleDeactivate = async (skuId: Id<"skus">) => {
    if (!token) return;
    if (confirm("Are you sure you want to deactivate this SKU?")) {
      await deactivateSku({ token, skuId });
    }
  };

  const handleReactivate = async (skuId: Id<"skus">) => {
    if (!token) return;
    await reactivateSku({ token, skuId });
  };

  const handleCleanupJunk = async () => {
    if (!token) return;
    if (!confirm("This will deactivate all auto-generated junk SKUs (SHOPIFY-*, color names, etc.). Continue?")) return;
    try {
      const result = await cleanupJunkSkus({ token });
      toast.success(`Cleaned up ${result.deactivated} junk SKUs`);
    } catch (error: any) {
      toast.error(error.message || "Failed to cleanup junk SKUs");
    }
  };

  const toggleExpanded = (skuCode: string) => {
    setExpandedSkus((prev) => {
      const next = new Set(prev);
      if (next.has(skuCode)) {
        next.delete(skuCode);
      } else {
        next.add(skuCode);
      }
      return next;
    });
  };

  const getStockBadge = (effectiveStock: number, threshold: number) => {
    if (effectiveStock === 0) {
      return <Badge variant="destructive">Out of Stock</Badge>;
    } else if (effectiveStock < threshold) {
      return <Badge variant="warning">Low Stock</Badge>;
    } else if (effectiveStock < threshold * 2) {
      return <Badge variant="secondary">Medium</Badge>;
    }
    return <Badge variant="success">In Stock</Badge>;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Items / SKU Management</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleCleanupJunk} className="text-red-600 border-red-200 hover:bg-red-50">
            <Trash2 className="h-4 w-4 mr-2" />
            Cleanup Junk
          </Button>
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add SKU
          </Button>
        </div>
      </div>

      {/* Low Stock Alert */}
      {lowStockSkus && lowStockSkus.length > 0 && (
        <div className="bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
            <div>
              <p className="font-semibold text-red-800 dark:text-red-200">
                {lowStockSkus.length} SKUs Below Threshold
              </p>
              <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                {lowStockSkus.slice(0, 5).map((s, i) => (
                  <span key={s.sku}>
                    {s.sku}: {(s as any).effectiveStock ?? s.currentStock} pcs
                    {i < Math.min(lowStockSkus.length, 5) - 1 ? ", " : ""}
                  </span>
                ))}
                {lowStockSkus.length > 5 && ` and ${lowStockSkus.length - 5} more...`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search SKU or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Category:</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">All Categories</option>
                {categories?.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-sm">Show Inactive</span>
            </label>
          </div>
        </CardContent>
      </Card>

      {/* SKU Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Package className="h-4 w-4" />
              Total SKUs
            </div>
            <p className="text-2xl font-bold mt-1">{skus?.length ?? 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Tag className="h-4 w-4" />
              Categories
            </div>
            <p className="text-2xl font-bold mt-1">{categories?.length ?? 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-red-600">
              <AlertTriangle className="h-4 w-4" />
              Low Stock
            </div>
            <p className="text-2xl font-bold mt-1 text-red-600">
              {lowStockSkus?.length ?? 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-green-600">
              <Check className="h-4 w-4" />
              In Stock
            </div>
            <p className="text-2xl font-bold mt-1 text-green-600">
              {skus ? skus.length - (lowStockSkus?.length ?? 0) : 0}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* SKU Table */}
      <Card>
        <CardHeader>
          <CardTitle>SKU List ({filteredSkus?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="px-4 py-3 text-left font-medium">SKU</th>
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Category</th>
                  <th className="px-4 py-3 text-right font-medium">Stock</th>
                  <th className="px-4 py-3 text-center font-medium">Status</th>
                  <th className="px-4 py-3 text-center font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSkus?.map((sku) => {
                  const hasOverrides = sharedStockEnabled && sku.storeOverrides && sku.storeOverrides.length > 0;
                  const isExpanded = expandedSkus.has(sku.sku);
                  const effectiveStock = (sku as any).effectiveStock ?? sku.currentStock;
                  const isBundle = (sku as any).isBundle ?? false;
                  const bundleComponents = ((sku as any).bundleComponents || []) as string[];

                  return (
                    <React.Fragment key={sku._id}>
                      <tr
                        className={`border-b hover:bg-muted/50 ${
                          !sku.isActive ? "opacity-50" : ""
                        }`}
                      >
                        <td className="px-4 py-3 font-mono font-medium">
                          <div className="flex items-center gap-1">
                            {hasOverrides && (
                              <button
                                onClick={() => toggleExpanded(sku.sku)}
                                className="p-0.5 hover:bg-muted rounded"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                )}
                              </button>
                            )}
                            {sku.sku}
                            {isBundle && (
                              <Badge variant="outline" className="text-[10px] ml-2">
                                Bundle
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {sku.name}
                          {isBundle && bundleComponents.length === 2 && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {bundleComponents[0]} + {bundleComponents[1]}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {sku.category ? (
                            <Badge variant="outline">{sku.category}</Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {effectiveStock}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {sku.isActive ? (
                            getStockBadge(effectiveStock, sku.lowStockThreshold)
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(sku)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            {sku.isActive ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeactivate(sku._id)}
                              >
                                <X className="h-4 w-4 text-red-600" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleReactivate(sku._id)}
                              >
                                <Check className="h-4 w-4 text-green-600" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Per-store overrides (expandable sub-rows) */}
                      {hasOverrides && isExpanded && sku.storeOverrides.map((override: any) => (
                        <tr
                          key={`${sku._id}-${override.shopDomain}`}
                          className="border-b bg-muted/20"
                        >
                          <td className="px-4 py-2 pl-10">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Store className="h-3 w-3" />
                              {override.shopDomain.replace(".myshopify.com", "")}
                            </div>
                          </td>
                          <td className="px-4 py-2 text-sm text-muted-foreground">
                            {override.displayName || "-"}
                          </td>
                          <td className="px-4 py-2">
                            {override.currency && (
                              <Badge variant="outline" className="text-xs">
                                {override.currency}
                              </Badge>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right text-sm text-muted-foreground italic" colSpan={3}>
                            shared
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}

                {filteredSkus?.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      No SKUs found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg shadow-lg w-full max-w-md p-6 m-4">
            <h2 className="text-xl font-bold mb-4">
              {editingId ? "Edit SKU" : "Add New SKU"}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium">SKU Code *</label>
                <Input
                  value={formData.sku}
                  onChange={(e) =>
                    setFormData({ ...formData, sku: e.target.value.toUpperCase() })
                  }
                  placeholder="e.g., VEL-011"
                  required
                  disabled={!!editingId}
                />
              </div>

              <div>
                <label className="text-sm font-medium">Product Name *</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Product name"
                  required
                />
              </div>

              <div>
                <label className="text-sm font-medium">Description</label>
                <Input
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Optional description"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Category</label>
                <Input
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({ ...formData, category: e.target.value })
                  }
                  placeholder="e.g., Accessories"
                  list="categories"
                />
                <datalist id="categories">
                  {categories?.map((cat) => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {!editingId && (
                  <div>
                    <label className="text-sm font-medium">Initial Stock</label>
                    <Input
                      type="number"
                      value={formData.currentStock}
                      onChange={(e) =>
                        setFormData({ ...formData, currentStock: e.target.value })
                      }
                      placeholder="0"
                    />
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium">Low Stock Threshold</label>
                  <Input
                    type="number"
                    value={formData.lowStockThreshold}
                    onChange={(e) =>
                      setFormData({ ...formData, lowStockThreshold: e.target.value })
                    }
                    placeholder="50"
                  />
                </div>
              </div>

              <div className="space-y-3 border rounded-md p-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isBundle}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        isBundle: e.target.checked,
                        componentSku1: e.target.checked ? formData.componentSku1 : "",
                        componentSku2: e.target.checked ? formData.componentSku2 : "",
                      })
                    }
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm font-medium">Bundle SKU (2 componente)</span>
                </label>
                {formData.isBundle && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-sm font-medium">Componentă 1</label>
                        <select
                          value={formData.componentSku1}
                          onChange={(e) =>
                            setFormData({ ...formData, componentSku1: e.target.value })
                          }
                          className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          required={formData.isBundle}
                        >
                          <option value="">Selectează SKU</option>
                          {skus
                            ?.filter((s) => s.sku !== formData.sku && s.isActive)
                            .map((s) => (
                              <option key={`c1-${s._id}`} value={s.sku}>
                                {s.sku} - {s.name}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-sm font-medium">Componentă 2</label>
                        <select
                          value={formData.componentSku2}
                          onChange={(e) =>
                            setFormData({ ...formData, componentSku2: e.target.value })
                          }
                          className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          required={formData.isBundle}
                        >
                          <option value="">Selectează SKU</option>
                          {skus
                            ?.filter(
                              (s) =>
                                s.sku !== formData.sku &&
                                s.isActive &&
                                s.sku !== formData.componentSku1
                            )
                            .map((s) => (
                              <option key={`c2-${s._id}`} value={s.sku}>
                                {s.sku} - {s.name}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Stocul bundle-ului este calculat automat: min(stoc componenta 1, stoc componenta 2).
                    </p>
                  </>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingId(null);
                    setFormData(defaultFormData);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" loading={saving} disabled={saving}>
                  {editingId ? "Save Changes" : "Add SKU"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
