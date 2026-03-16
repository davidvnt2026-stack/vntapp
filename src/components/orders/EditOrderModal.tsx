import { useState, useEffect, useRef } from "react";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "../../contexts/AuthContext";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Card, CardContent } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { X, Truck, Receipt, Plus, Trash2, ClipboardList, Calendar, PenLine, ChevronDown, MapPin, Loader2 } from "lucide-react";
import { formatCurrency, cn } from "../../lib/utils";
import { EditableOrder, OrderItem } from "./types";

interface PickingList {
  _id: string;
  name: string;
}

export interface PickingListSelection {
  useToday: boolean;
  pickingListId?: string;
  newListName?: string;
}

interface EditOrderModalProps {
  order: EditableOrder | null;
  onClose: () => void;
  onSave: (
    form: EditFormData,
    items: OrderItem[],
    syncToShopify: boolean
  ) => Promise<void>;
  onSaveAndAddToPickingList?: (
    form: EditFormData,
    items: OrderItem[],
    syncToShopify: boolean,
    pickingListSelection: PickingListSelection
  ) => Promise<void>;
  isSaving: boolean;
  isSavingAndAdding?: boolean;
  isHydrating?: boolean;
  pickingLists?: PickingList[];
  stockForSkus?: Record<string, number>;
  onShowSkuPicker: () => void;
}

export interface EditFormData {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  notes: string;
  discount: number;
}

export function EditOrderModal({
  order,
  onClose,
  onSave,
  onSaveAndAddToPickingList,
  isSaving,
  isSavingAndAdding,
  isHydrating,
  pickingLists,
  stockForSkus,
  onShowSkuPicker,
}: EditOrderModalProps) {
  const { token } = useAuth();
  const lookupPostalCode = useAction(api.sameday.lookupPostalCode);
  const [fetchingZip, setFetchingZip] = useState(false);
  const [zipFetchResult, setZipFetchResult] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const inferDiscountFromTotals = (currentOrder: EditableOrder | null) => {
    if (!currentOrder) return 0;
    const itemsSubtotal = (currentOrder.items || []).reduce(
      (sum, item) => sum + (item.price || 0) * item.quantity,
      0
    );
    const inferred = itemsSubtotal + (currentOrder.totalShipping || 0) - (currentOrder.totalPrice || 0);
    // Keep only positive inferred discounts and normalize float precision.
    return inferred > 0 ? Math.round(inferred * 100) / 100 : 0;
  };

  const initialDiscount = order?.totalDiscounts ?? inferDiscountFromTotals(order);

  // Tab state removed — single-page layout now
  const [syncToShopify, setSyncToShopify] = useState(true);
  const [showPickingListMenu, setShowPickingListMenu] = useState(false);
  const [showNewListInput, setShowNewListInput] = useState(false);
  const [newListName, setNewListName] = useState("");
  const pickingMenuRef = useRef<HTMLDivElement>(null);
  
  const [form, setForm] = useState<EditFormData>({
    customerName: order?.customerName || "",
    customerEmail: order?.customerEmail || "",
    customerPhone: order?.customerPhone || "",
    addressLine1: order?.shippingAddress?.line1 || "",
    addressLine2: order?.shippingAddress?.line2 || "",
    city: order?.shippingAddress?.city || "",
    state: order?.shippingAddress?.state || "",
    postalCode: order?.shippingAddress?.postalCode || order?.shippingAddress?.zipCode || order?.shippingAddress?.zip || "",
    country: order?.shippingAddress?.country || "Romania",
    notes: order?.notes || "",
    discount: initialDiscount,
  });
  
  const [items, setItems] = useState<OrderItem[]>(order?.items ? [...order.items] : []);

  // Reset form when order changes
  useEffect(() => {
    if (order) {
      setForm({
        customerName: order.customerName || "",
        customerEmail: order.customerEmail || "",
        customerPhone: order.customerPhone || "",
        addressLine1: order.shippingAddress?.line1 || "",
        addressLine2: order.shippingAddress?.line2 || "",
        city: order.shippingAddress?.city || "",
        state: order.shippingAddress?.state || "",
        postalCode: order.shippingAddress?.postalCode || order.shippingAddress?.zipCode || order.shippingAddress?.zip || "",
        country: order.shippingAddress?.country || "Romania",
        notes: order.notes || "",
        discount: order.totalDiscounts ?? inferDiscountFromTotals(order),
      });
      setItems(order.items ? [...order.items] : []);
      setZipFetchResult(null);
    }
  }, [order]);

  // Close picking list menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickingMenuRef.current && !pickingMenuRef.current.contains(e.target as Node)) {
        setShowPickingListMenu(false);
        setShowNewListInput(false);
        setNewListName("");
      }
    };
    if (showPickingListMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showPickingListMenu]);

  if (!order) return null;
  if (isHydrating) {
    return (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-8 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Se incarca datele complete ale comenzii...</span>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleUpdateQuantity = (index: number, quantity: number) => {
    if (quantity < 1) return;
    setItems(prev => prev.map((item, i) => i === index ? { ...item, quantity } : item));
  };

  const handleRemoveItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleFetchZipcode = async () => {
    if (!token || !form.city) {
      setZipFetchResult({ type: "error", message: "Completează cel puțin City" });
      setTimeout(() => setZipFetchResult(null), 3000);
      return;
    }
    setFetchingZip(true);
    setZipFetchResult(null);
    try {
      const result = await lookupPostalCode({
        token,
        addressLine1: form.addressLine1 || undefined,
        addressLine2: form.addressLine2 || undefined,
        city: form.city,
        state: form.state || undefined,
        country: form.country || "Romania",
        countryCode: order?.shippingAddress?.countryCode || "RO",
      });
      // Fill in postalCode; also update province if it's empty, numeric, or looks invalid
      const currentState = (form.state || "").trim();
      const stateNeedsUpdate =
        !currentState ||
        currentState.length < 2 ||
        /\d/.test(currentState); // Contains ANY digit — not a valid province name
      const shouldUpdateState = stateNeedsUpdate && !!result.normalizedCounty;
      const currentCity = (form.city || "").trim();
      const normalizedCity = (result.normalizedCity || "").trim();
      const shouldUpdateCity =
        !!normalizedCity &&
        normalizedCity.toLowerCase() !== currentCity.toLowerCase();
      console.log(`[Preia Zip] postalCode=${result.postalCode}, normalizedCounty=${result.normalizedCounty}, currentState="${currentState}", stateNeedsUpdate=${stateNeedsUpdate}, shouldUpdateState=${shouldUpdateState}`);
      setForm((prev) => ({
        ...prev,
        postalCode: result.postalCode,
        ...(shouldUpdateCity ? { city: normalizedCity } : {}),
        ...(shouldUpdateState ? { state: result.normalizedCounty! } : {}),
      }));
      const parts = [result.postalCode];
      if (result.normalizedCity) parts.push(result.normalizedCity);
      if (shouldUpdateState && result.normalizedCounty) parts.push(`🔄 ${result.normalizedCounty}`);
      setZipFetchResult({ type: "success", message: parts.join(" — ") });
      setTimeout(() => setZipFetchResult(null), 4000);
    } catch (e: any) {
      // Strip Convex error prefix if present (e.g. "[CONVEX A(sameday:lookupPostalCode)] ...")
      let msg = e.message || "Eroare la căutare";
      const convexPrefixMatch = msg.match(/^\[CONVEX [A-Z]\([^\)]+\)\]\s*/);
      if (convexPrefixMatch) msg = msg.slice(convexPrefixMatch[0].length);
      setZipFetchResult({ type: "error", message: msg });
      setTimeout(() => setZipFetchResult(null), 5000);
    } finally {
      setFetchingZip(false);
    }
  };

  const handleSave = () => {
    onSave(form, items, syncToShopify);
  };

  const handlePickingListSelect = (selection: PickingListSelection) => {
    setShowPickingListMenu(false);
    setShowNewListInput(false);
    setNewListName("");
    onSaveAndAddToPickingList?.(form, items, syncToShopify, selection);
  };

  const total = items.reduce((sum, i) => sum + (i.price || 0) * i.quantity, 0);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-5xl max-h-[90vh] overflow-y-auto">
        <CardContent className="pt-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-semibold">
              Edit order {order.orderNumber}
            </h2>
            <Button size="sm" variant="ghost" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Two-column layout */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-0">
            {/* LEFT COLUMN — Order Info */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Order Name</label>
                <Input value={order.orderNumber} disabled />
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Total Price</label>
                  <Input value={order.totalPrice} disabled />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Currency</label>
                  <Input value={order.currency || "RON"} disabled className="w-24" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Shipping Price</label>
                <Input value={order.totalShipping || 0} disabled />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Discount</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.discount || ""}
                  onChange={(e) => setForm({ ...form, discount: parseFloat(e.target.value) || 0 })}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Payment processing</label>
                <Input value={order.paymentMethod || "N/A"} disabled />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Add notes..."
                  className="w-full h-[38px] px-3 py-2 text-sm border border-input rounded-md bg-background resize-none"
                />
              </div>
            </div>

            {/* RIGHT COLUMN — Customer / Shipping */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Customer Name</label>
                <Input
                  value={form.customerName}
                  onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                  placeholder="Customer name"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Address</label>
                <Input
                  value={form.addressLine1}
                  onChange={(e) => setForm({ ...form, addressLine1: e.target.value })}
                  placeholder="Street, number, etc."
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Address Details (optional)</label>
                <Input
                  value={form.addressLine2}
                  onChange={(e) => setForm({ ...form, addressLine2: e.target.value })}
                  placeholder="Apartment, suite, etc."
                />
              </div>
              <div className="grid grid-cols-[7rem_1fr_auto] gap-3 items-end">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Zip</label>
                  <Input
                    value={form.postalCode}
                    onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">City</label>
                  <Input
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-10 px-3 whitespace-nowrap"
                  onClick={handleFetchZipcode}
                  disabled={fetchingZip || !form.city}
                >
                  <MapPin className="h-3.5 w-3.5 mr-1.5" />
                  {fetchingZip ? "Se caută..." : "Preia Zip"}
                </Button>
              </div>
              {zipFetchResult && (
                <p className={cn(
                  "text-xs mt-1",
                  zipFetchResult.type === "success" ? "text-green-600" : "text-red-600"
                )}>
                  {zipFetchResult.type === "success" ? "✓ " : "✗ "}{zipFetchResult.message}
                </p>
              )}
              <div>
                <label className="text-xs font-medium text-muted-foreground">Province</label>
                <Input
                  value={form.state}
                  onChange={(e) => setForm({ ...form, state: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Country</label>
                <Input
                  value={form.country}
                  onChange={(e) => setForm({ ...form, country: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Phone</label>
                  <Input
                    value={form.customerPhone}
                    onChange={(e) => setForm({ ...form, customerPhone: e.target.value })}
                    placeholder="+40 700 000 000"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Email</label>
                  <Input
                    value={form.customerEmail}
                    onChange={(e) => setForm({ ...form, customerEmail: e.target.value })}
                    placeholder="Email"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Invoice / AWB status badges (compact, inline) */}
          {(order.invoiceNumber || order.trackingNumber) && (
            <div className="flex items-center gap-3 mt-4 pt-3 border-t">
              {order.invoiceNumber && (
                <div className="flex items-center gap-2 text-sm">
                  <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Invoice:</span>
                  <span className="font-mono font-medium">{order.invoiceSeries}{order.invoiceNumber}</span>
                  <Badge className={cn(
                    "text-xs",
                    order.invoiceStatus === "storno"
                      ? "bg-red-100 text-red-700"
                      : order.invoiceStatus === "paid"
                        ? "bg-green-100 text-green-700"
                        : "bg-yellow-100 text-yellow-700"
                  )}>
                    {order.invoiceStatus === "storno" ? "Storno" :
                     order.invoiceStatus === "paid" ? "Paid" : "Unpaid"}
                  </Badge>
                </div>
              )}
              {order.trackingNumber && (
                <div className="flex items-center gap-2 text-sm">
                  <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">AWB:</span>
                  <span className="font-mono font-medium">{order.trackingNumber}</span>
                </div>
              )}
            </div>
          )}

          {/* Order Items */}
          <div className="mt-4 pt-3 border-t">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Products</h3>
              <Button size="sm" variant="outline" onClick={onShowSkuPicker}>
                <Plus className="h-4 w-4 mr-1" />
                Add product
              </Button>
            </div>
            
            <div className="space-y-1.5">
              {items.map((item, index) => (
                <div key={index} className="flex items-center gap-3 p-2.5 bg-muted/50 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{item.name}</div>
                    <div className="text-xs text-muted-foreground">
                      SKU: {item.sku || "N/A"} | 
                      Stock: <span className={cn(
                        "font-medium",
                        (stockForSkus?.[item.sku || ""] || 0) < 5 ? "text-red-600" : "text-green-600"
                      )}>
                        {item.sku ? (stockForSkus?.[item.sku] ?? 0) : "N/A"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 w-7 p-0"
                      onClick={() => handleUpdateQuantity(index, item.quantity - 1)}
                      disabled={item.quantity <= 1}
                    >
                      -
                    </Button>
                    <span className="w-7 text-center font-medium text-sm">{item.quantity}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 w-7 p-0"
                      onClick={() => handleUpdateQuantity(index, item.quantity + 1)}
                    >
                      +
                    </Button>
                  </div>
                  <div className="text-sm font-medium w-20 text-right">
                    {formatCurrency((item.price || 0) * item.quantity, order.currency || "RON")}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                    onClick={() => handleRemoveItem(index)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="mt-3 space-y-1 pt-2 border-t text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal:</span>
                <span className="font-medium">{formatCurrency(total, order.currency || "RON")}</span>
              </div>
              <div className={cn(
                "flex justify-between",
                (form.discount || 0) > 0 ? "text-red-500" : "text-muted-foreground"
              )}>
                <span>Discount:</span>
                <span>
                  -{formatCurrency(form.discount || 0, order.currency || "RON")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipping:</span>
                <span className="font-medium">{formatCurrency(order.totalShipping || 0, order.currency || "RON")}</span>
              </div>
              <div className="flex justify-between font-bold text-base pt-1 border-t">
                <span>Total:</span>
                <span className="text-primary">{formatCurrency(total + (order.totalShipping || 0) - (form.discount || 0), order.currency || "RON")}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-4 mt-3 border-t">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={syncToShopify}
                onChange={(e) => setSyncToShopify(e.target.checked)}
                className="rounded border-input h-4 w-4"
              />
              <span className="text-sm text-muted-foreground">Sync to Shopify</span>
            </label>
            <div className="flex gap-3">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleSave} loading={isSaving} disabled={isSavingAndAdding || isHydrating}>
                Save
              </Button>
              {onSaveAndAddToPickingList && (
                <div className="relative" ref={pickingMenuRef}>
                  <Button
                    onClick={() => setShowPickingListMenu(!showPickingListMenu)}
                    loading={isSavingAndAdding}
                    disabled={isSaving || isHydrating}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    <ClipboardList className="h-4 w-4 mr-1.5" />
                    Save + Picking List
                    <ChevronDown className="h-3.5 w-3.5 ml-1" />
                  </Button>

                  {showPickingListMenu && (
                    <div className="absolute bottom-full right-0 mb-2 w-72 bg-card border border-border rounded-lg shadow-lg z-50">
                      <button
                        onClick={() => handlePickingListSelect({ useToday: true })}
                        className="w-full text-left px-3 py-2.5 text-sm hover:bg-accent flex items-center gap-2 border-b font-medium rounded-t-lg"
                      >
                        <Calendar className="h-4 w-4 text-green-600" />
                        <span>Today's Picking List</span>
                      </button>

                      <div className="border-b">
                        {!showNewListInput ? (
                          <button
                            onClick={() => setShowNewListInput(true)}
                            className="w-full text-left px-3 py-2.5 text-sm hover:bg-accent flex items-center gap-2 font-medium"
                          >
                            <PenLine className="h-4 w-4 text-purple-600" />
                            <span>Create new Picking List</span>
                          </button>
                        ) : (
                          <div className="p-2 space-y-2">
                            <Input
                              autoFocus
                              placeholder="Picking list name..."
                              value={newListName}
                              onChange={(e) => setNewListName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && newListName.trim()) {
                                  handlePickingListSelect({ useToday: false, newListName: newListName.trim() });
                                }
                                if (e.key === "Escape") {
                                  setShowNewListInput(false);
                                  setNewListName("");
                                }
                              }}
                              className="h-8 text-sm"
                            />
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                className="h-7 text-xs flex-1"
                                onClick={() => {
                                  if (newListName.trim()) {
                                    handlePickingListSelect({ useToday: false, newListName: newListName.trim() });
                                  }
                                }}
                                disabled={!newListName.trim()}
                              >
                                Create & Add
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs"
                                onClick={() => {
                                  setShowNewListInput(false);
                                  setNewListName("");
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>

                      {pickingLists && pickingLists.length > 0 && (
                        <>
                          <div className="px-3 py-1.5 text-xs text-muted-foreground font-medium uppercase">
                            Existing lists
                          </div>
                          <div className="max-h-40 overflow-y-auto">
                            {pickingLists.map((pl) => (
                              <button
                                key={pl._id}
                                onClick={() => handlePickingListSelect({ useToday: false, pickingListId: pl._id })}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2"
                              >
                                <Plus className="h-4 w-4 text-blue-600" />
                                {pl.name}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
