import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "../contexts/AuthContext";
import { useImpersonation } from "../contexts/ImpersonationContext";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/Card";
import { 
  User, 
  Lock, 
  Eye,
  EyeOff,
  Package,
  Link2,
  Truck,
  Share2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

export function SettingsPage() {
  const { user, token } = useAuth();
  const { impersonatedUser, isImpersonating } = useImpersonation();
  
  // Use impersonated user's info when impersonating
  const displayUser = isImpersonating && impersonatedUser ? impersonatedUser : user;
  const [name, setName] = useState(displayUser?.name || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Stock management state
  const [stockManagement, setStockManagement] = useState<"shopify" | "local">("shopify");
  const [autoDeductStock, setAutoDeductStock] = useState(true);
  const [sharedStockEnabled, setSharedStockEnabled] = useState(false);
  const [linkedStoreIds, setLinkedStoreIds] = useState<string[]>([]);
  const [savingStock, setSavingStock] = useState(false);

  // Courier settings state
  const [courierPickupAddress, setCourierPickupAddress] = useState("");
  const [savingCourier, setSavingCourier] = useState(false);

  // Migration state
  const [migrating, setMigrating] = useState(false);
  const [migrationDryRun, setMigrationDryRun] = useState<any>(null);
  const [backfillingFlags, setBackfillingFlags] = useState(false);
  const [backfillDryRun, setBackfillDryRun] = useState<any>(null);


  const updateProfile = useMutation(api.auth.updateProfile);
  const changePassword = useMutation(api.auth.changePassword);

  // Stock settings
  const stockSettings = useQuery(api.settings.get, token ? { token } : "skip");
  const updateStockSettings = useMutation(api.settings.updateStockSettings);
  const updateCourierSettings = useMutation(api.settings.updateCourierSettings);
  const migrateStock = useMutation(api.orders.migrateDeductStockForWorkedOrders);
  const backfillStockFlags = useMutation(api.orders.backfillStockDeductedFlagsOnly);

  // Store connections (for shared stock linking)
  const storeConnections = useQuery(api.shopifyOauth.getStores, token ? { token } : "skip");
  

  // Update name when impersonation changes
  useEffect(() => {
    setName(displayUser?.name || "");
  }, [displayUser]);

  // Load stock settings
  useEffect(() => {
    if (stockSettings) {
      setStockManagement(stockSettings.stockManagement as "shopify" | "local");
      setAutoDeductStock(stockSettings.autoDeductStock);
      setSharedStockEnabled(stockSettings.sharedStockEnabled ?? false);
      setLinkedStoreIds(stockSettings.linkedStoreIds ?? []);
      setCourierPickupAddress(stockSettings.courierPickupAddress || "");
    }
  }, [stockSettings]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setSavingProfile(true);
    try {
      await updateProfile({ token, name: name.trim() || undefined });
      toast.success("Profile updated");
    } catch (error: any) {
      toast.error(error.message || "Failed to update profile");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setSavingPassword(true);
    try {
      await changePassword({ token, currentPassword, newPassword });
      toast.success("Password changed");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      toast.error(error.message || "Failed to change password");
    } finally {
      setSavingPassword(false);
    }
  };

  const handleSaveStockSettings = async () => {
    if (!token) return;

    setSavingStock(true);
    try {
      await updateStockSettings({
        token,
        stockManagement,
        autoDeductStock,
        sharedStockEnabled,
        linkedStoreIds,
      });
      toast.success("Stock settings saved");
    } catch (error: any) {
      toast.error(error.message || "Failed to save stock settings");
    } finally {
      setSavingStock(false);
    }
  };

  const handleToggleLinkedStore = (shopDomain: string) => {
    setLinkedStoreIds((prev) =>
      prev.includes(shopDomain)
        ? prev.filter((d) => d !== shopDomain)
        : [...prev, shopDomain]
    );
  };

  const runStockMigrationInBatches = async (dryRun: boolean) => {
    if (!token) return null;

    let cursor: string | undefined = undefined;
    let pagesProcessed = 0;
    let totalOrdersProcessed = 0;
    const skuTotals = new Map<string, { sku: string; totalDeducted: number; oldStock: number }>();

    while (true) {
      const result: any = await migrateStock({
        token,
        dryRun,
        cursor,
        batchSize: 150,
      });

      if (!result?.success) {
        throw new Error(result?.error || "Eroare la migrare");
      }

      totalOrdersProcessed += result.ordersProcessed || 0;
      pagesProcessed += 1;

      for (const adj of result.skuAdjustments || []) {
        const existing = skuTotals.get(adj.sku);
        if (existing) {
          existing.totalDeducted += adj.totalDeducted || 0;
        } else {
          skuTotals.set(adj.sku, {
            sku: adj.sku,
            totalDeducted: adj.totalDeducted || 0,
            oldStock: adj.oldStock || 0,
          });
        }
      }

      if (result.isDone) break;
      if (!result.nextCursor) {
        throw new Error("Migrare oprită: cursor invalid pentru pagina următoare.");
      }
      cursor = result.nextCursor || undefined;

      // Guardrail to prevent accidental infinite loops if cursor handling breaks.
      if (pagesProcessed > 500) {
        throw new Error("Migrare oprită: prea multe pagini procesate.");
      }
    }

    const skuAdjustments = Array.from(skuTotals.values()).map((adj) => ({
      ...adj,
      newStock: Math.max(0, adj.oldStock - adj.totalDeducted),
    }));

    return {
      success: true,
      dryRun,
      ordersProcessed: totalOrdersProcessed,
      skuAdjustments,
      pagesProcessed,
      message:
        totalOrdersProcessed === 0
          ? "No orders to migrate. All worked orders already have stock deducted."
          : undefined,
    };
  };

  const handleMigrationDryRun = async () => {
    if (!token) return;
    setMigrating(true);
    try {
      const result = await runStockMigrationInBatches(true);
      if (!result) return;
      setMigrationDryRun(result);
      if (result.ordersProcessed === 0) {
        toast.info(result.message || "Nicio comandă de migrat.");
      }
    } catch (error: any) {
      toast.error(error.message || "Eroare la verificare migrare");
    } finally {
      setMigrating(false);
    }
  };

  const handleMigrationExecute = async () => {
    if (!token) return;
    setMigrating(true);
    try {
      const result = await runStockMigrationInBatches(false);
      if (!result) return;
      toast.success(`Migrare completă: ${result.ordersProcessed} comenzi, ${result.skuAdjustments?.length || 0} SKU-uri ajustate.`);
      setMigrationDryRun(null);
    } catch (error: any) {
      toast.error(error.message || "Eroare la migrare");
    } finally {
      setMigrating(false);
    }
  };

  const runBackfillFlagsInBatches = async (dryRun: boolean) => {
    if (!token) return null;

    let cursor: string | undefined = undefined;
    let pagesProcessed = 0;
    let totalOrdersProcessed = 0;

    while (true) {
      const result: any = await backfillStockFlags({
        token,
        dryRun,
        cursor,
        batchSize: 200,
      });

      if (!result?.success) {
        throw new Error(result?.error || "Eroare la backfill");
      }

      totalOrdersProcessed += result.ordersProcessed || 0;
      pagesProcessed += 1;

      if (result.isDone) break;
      if (!result.nextCursor) {
        throw new Error("Backfill oprit: cursor invalid pentru pagina următoare.");
      }
      cursor = result.nextCursor || undefined;

      if (pagesProcessed > 500) {
        throw new Error("Backfill oprit: prea multe pagini procesate.");
      }
    }

    return {
      success: true,
      dryRun,
      ordersProcessed: totalOrdersProcessed,
      pagesProcessed,
      message:
        totalOrdersProcessed === 0
          ? "Nicio comandă de reparat. Flagurile sunt deja setate."
          : undefined,
    };
  };

  const handleBackfillDryRun = async () => {
    if (!token) return;
    setBackfillingFlags(true);
    try {
      const result = await runBackfillFlagsInBatches(true);
      if (!result) return;
      setBackfillDryRun(result);
      if (result.ordersProcessed === 0) {
        toast.info(result.message || "Nicio comandă de reparat.");
      }
    } catch (error: any) {
      toast.error(error.message || "Eroare la verificare backfill");
    } finally {
      setBackfillingFlags(false);
    }
  };

  const handleBackfillExecute = async () => {
    if (!token) return;
    setBackfillingFlags(true);
    try {
      const result = await runBackfillFlagsInBatches(false);
      if (!result) return;
      toast.success(`Backfill complet: ${result.ordersProcessed} comenzi actualizate.`);
      setBackfillDryRun(null);
    } catch (error: any) {
      toast.error(error.message || "Eroare la backfill");
    } finally {
      setBackfillingFlags(false);
    }
  };

  const handleSaveCourierSettings = async () => {
    if (!token) return;

    setSavingCourier(true);
    try {
      await updateCourierSettings({
        token,
        courierPickupAddress: courierPickupAddress.trim() || undefined,
      });
      toast.success("Courier settings saved");
    } catch (error: any) {
      toast.error(error.message || "Failed to save courier settings");
    } finally {
      setSavingCourier(false);
    }
  };


  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your account settings
        </p>
      </div>

      <div className="grid gap-6 max-w-2xl">
        {/* Profile Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>Profile</CardTitle>
                <CardDescription>Update your personal information</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Email</label>
                <Input value={displayUser?.email || ""} disabled />
                <p className="text-xs text-muted-foreground">
                  Email cannot be changed
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                />
              </div>
              <Button type="submit" loading={savingProfile}>
                Save Changes
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Password Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Lock className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>Password</CardTitle>
                <CardDescription>Change your password</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Current Password</label>
                <div className="relative">
                  <Input
                    type={showPasswords ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">New Password</label>
                <div className="relative">
                  <Input
                    type={showPasswords ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Confirm New Password</label>
                <div className="relative">
                  <Input
                    type={showPasswords ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords(!showPasswords)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPasswords ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
              <Button type="submit" loading={savingPassword}>
                Change Password
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Stock Management Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-100">
                <Package className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <CardTitle>Stock Management</CardTitle>
                <CardDescription>Configure how inventory is tracked</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <label className="text-sm font-medium">Stock Source</label>
              <div className="grid gap-3">
                <label className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${stockManagement === "shopify" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}>
                  <input
                    type="radio"
                    name="stockManagement"
                    value="shopify"
                    checked={stockManagement === "shopify"}
                    onChange={() => setStockManagement("shopify")}
                    className="mt-1"
                  />
                  <div>
                    <div className="font-medium">Use Shopify Inventory</div>
                    <p className="text-sm text-muted-foreground">
                      Stock levels are synced from Shopify. Use this if Shopify is your source of truth.
                    </p>
                  </div>
                </label>
                <label className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${stockManagement === "local" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}>
                  <input
                    type="radio"
                    name="stockManagement"
                    value="local"
                    checked={stockManagement === "local"}
                    onChange={() => setStockManagement("local")}
                    className="mt-1"
                  />
                  <div>
                    <div className="font-medium">Use Local Inventory</div>
                    <p className="text-sm text-muted-foreground">
                      Manage stock locally. Orders deduct stock, inbound shipments add stock.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {stockManagement === "local" && (
              <div className="p-4 rounded-lg bg-muted/50 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoDeductStock}
                    onChange={(e) => setAutoDeductStock(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300"
                  />
                  <div>
                    <div className="font-medium text-sm">Auto-deduct stock on new orders</div>
                    <p className="text-xs text-muted-foreground">
                      When a new order comes in from Shopify, automatically reduce stock for each item
                    </p>
                  </div>
                </label>
              </div>
            )}

            {/* Shared Stock Section */}
            {stockManagement === "local" && (
              <div className="border rounded-lg overflow-hidden">
                <div className="p-4 bg-muted/30 border-b">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sharedStockEnabled}
                      onChange={(e) => setSharedStockEnabled(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300"
                    />
                    <div className="flex items-center gap-2">
                      <Share2 className="h-4 w-4 text-purple-500" />
                      <div>
                        <div className="font-medium text-sm">Shared Stock Across Stores</div>
                        <p className="text-xs text-muted-foreground">
                          Link multiple Shopify stores to share one inventory pool. Same SKU = same stock.
                        </p>
                      </div>
                    </div>
                  </label>
                </div>

                {sharedStockEnabled && (
                  <div className="p-4 space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Select which stores share the same inventory. Products with the same SKU across these stores will share a single stock count.
                    </p>

                    {storeConnections && storeConnections.length > 0 ? (
                      <div className="space-y-2">
                        {storeConnections.filter((s: any) => s.isActive).map((store: any) => (
                          <label
                            key={store.shopDomain}
                            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                              linkedStoreIds.includes(store.shopDomain)
                                ? "border-purple-300 bg-purple-50"
                                : "border-border hover:bg-muted/50"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={linkedStoreIds.includes(store.shopDomain)}
                              onChange={() => handleToggleLinkedStore(store.shopDomain)}
                              className="w-4 h-4 rounded border-gray-300"
                            />
                            <div>
                              <div className="font-medium text-sm">
                                {store.displayName || store.shopDomain}
                              </div>
                              <p className="text-xs text-muted-foreground font-mono">
                                {store.shopDomain}
                              </p>
                            </div>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                        No Shopify stores connected. Go to{" "}
                        <Link to="/connections" className="text-primary underline">
                          Connections
                        </Link>{" "}
                        to add stores first.
                      </div>
                    )}

                    {linkedStoreIds.length > 0 && (
                      <div className="p-3 rounded-lg bg-purple-50 border border-purple-200">
                        <p className="text-sm font-medium text-purple-800">
                          {linkedStoreIds.length} store{linkedStoreIds.length > 1 ? "s" : ""} linked
                        </p>
                        <p className="text-xs text-purple-600 mt-1">
                          Each store can have different product names, prices, and currencies for the same SKU — but they'll share one stock count.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <Button onClick={handleSaveStockSettings} loading={savingStock}>
              Save Stock Settings
            </Button>

            {/* Migration Section - only visible for local stock */}
            {stockManagement === "local" && (
              <div className="border-t pt-6 mt-6">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  <h3 className="font-medium text-sm">Migrare Stoc — Comenzi Lucrate</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Dacă ai comenzi marcate ca „lucrate" înainte de activarea deducerii automate de stoc,
                  folosește acest instrument pentru a deduce stocul retroactiv.
                </p>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={handleMigrationDryRun}
                    loading={migrating}
                  >
                    Verifică (Dry Run)
                  </Button>
                  {migrationDryRun && migrationDryRun.ordersProcessed > 0 && (
                    <Button
                      variant="destructive"
                      onClick={handleMigrationExecute}
                      loading={migrating}
                    >
                      Execută Migrare ({migrationDryRun.ordersProcessed} comenzi)
                    </Button>
                  )}
                </div>

                {migrationDryRun && migrationDryRun.ordersProcessed > 0 && (
                  <div className="mt-4 p-4 rounded-lg bg-amber-50 border border-amber-200 space-y-3">
                    <p className="text-sm font-medium text-amber-800">
                      {migrationDryRun.dryRun ? "Preview — nicio modificare încă:" : "Rezultat:"}
                    </p>
                    <p className="text-sm text-amber-700">
                      {migrationDryRun.ordersProcessed} comenzi lucrate fără stoc dedus
                    </p>
                    {migrationDryRun.skuAdjustments && migrationDryRun.skuAdjustments.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="text-xs w-full">
                          <thead>
                            <tr className="text-left border-b border-amber-300">
                              <th className="py-1 pr-4">SKU</th>
                              <th className="py-1 pr-4">Stoc actual</th>
                              <th className="py-1 pr-4">De dedus</th>
                              <th className="py-1">Stoc nou</th>
                            </tr>
                          </thead>
                          <tbody>
                            {migrationDryRun.skuAdjustments.map((adj: any) => (
                              <tr key={adj.sku} className="border-b border-amber-100">
                                <td className="py-1 pr-4 font-mono">{adj.sku}</td>
                                <td className="py-1 pr-4">{adj.oldStock}</td>
                                <td className="py-1 pr-4 text-red-600">-{adj.totalDeducted}</td>
                                <td className="py-1 font-medium">{adj.newStock}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-6 pt-6 border-t">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="h-5 w-5 text-blue-500" />
                    <h3 className="font-medium text-sm">Reparare Flaguri — Stock Deducted</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Dacă stocul a fost dedus, dar pe comandă nu apare flagul „Stoc dedus",
                    folosește acest backfill. Nu mai modifică stocul, doar setează flagurile lipsă.
                  </p>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={handleBackfillDryRun}
                      loading={backfillingFlags}
                    >
                      Verifică Backfill (Dry Run)
                    </Button>
                    {backfillDryRun && backfillDryRun.ordersProcessed > 0 && (
                      <Button
                        variant="default"
                        onClick={handleBackfillExecute}
                        loading={backfillingFlags}
                      >
                        Execută Backfill ({backfillDryRun.ordersProcessed} comenzi)
                      </Button>
                    )}
                  </div>

                  {backfillDryRun && (
                    <div className="mt-4 p-4 rounded-lg bg-blue-50 border border-blue-200">
                      <p className="text-sm font-medium text-blue-800">
                        {backfillDryRun.dryRun ? "Preview backfill:" : "Rezultat backfill:"}
                      </p>
                      <p className="text-sm text-blue-700 mt-1">
                        {backfillDryRun.ordersProcessed} comenzi vor primi / au primit flagurile de stock dedus.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Courier Settings */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <Truck className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <CardTitle>Courier Settings</CardTitle>
                <CardDescription>Configure your Sameday courier pickup address</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Punct de Ridicare (Pickup Address)</label>
              <Input
                value={courierPickupAddress}
                onChange={(e) => setCourierPickupAddress(e.target.value)}
                placeholder="e.g. NUME COMPANIE, Bihor, Oradea, Str. Exemplu nr 123"
              />
              <p className="text-xs text-muted-foreground">
                This should match exactly the "Punct de ridicare" value from your Sameday export (Column F).
                When you upload a Sameday XLSX in Courier Summary, only rows matching this address will be shown.
              </p>
            </div>

            {courierPickupAddress && (
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                <p className="text-sm font-medium text-blue-800">Current Pickup Address:</p>
                <p className="text-sm text-blue-700 font-mono mt-1">{courierPickupAddress}</p>
              </div>
            )}

            <Button onClick={handleSaveCourierSettings} loading={savingCourier}>
              Save Courier Settings
            </Button>
          </CardContent>
        </Card>


        {/* Integrations Link */}
        <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-100">
                  <Link2 className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <h3 className="font-medium">External Integrations</h3>
                  <p className="text-sm text-muted-foreground">
                    Configure Shopify, Sameday, FGO and other integrations
                  </p>
                </div>
              </div>
              <Link to="/connections">
                <Button variant="outline" className="bg-white hover:bg-green-50">
                  Go to Connections
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Account Info */}
        <Card>
          <CardHeader>
            <CardTitle>Account Information</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Account ID</dt>
                <dd className="font-mono">{user?._id?.slice(0, 8)}...</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Member Since</dt>
                <dd>
                  {user?.createdAt
                    ? new Date(user.createdAt).toLocaleDateString("ro-RO", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })
                    : "N/A"}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
