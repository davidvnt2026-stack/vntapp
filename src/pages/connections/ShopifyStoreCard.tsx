import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Badge } from "../../components/ui/Badge";
import {
  Check,
  Eye,
  EyeOff,
  Key,
  Pencil,
  RefreshCw,
  ShoppingBag,
  Star,
  Store,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

interface ShopifyStore {
  _id: string;
  shopDomain: string;
  displayName: string;
  alias?: string;
  connectionName?: string;
  isPrimary?: boolean;
  isActive?: boolean;
  hasAppCredentials?: boolean;
  appName?: string;
  clientId?: string;
  clientSecretPreview?: string;
}

interface ShopifyStoreCardProps {
  store: ShopifyStore;
  token: string | null;
  editingAliasStoreId: string | null;
  aliasValue: string;
  setAliasValue: (v: string) => void;
  setEditingAliasStoreId: (v: string | null) => void;
  editingCredentialsStoreId: string | null;
  editClientId: string;
  setEditClientId: (v: string) => void;
  editClientSecret: string;
  setEditClientSecret: (v: string) => void;
  editAppName: string;
  setEditAppName: (v: string) => void;
  showEditSecret: boolean;
  setShowEditSecret: (v: boolean) => void;
  syncing: string | null;
  syncingProducts: string | null;
  registeringWebhooks: string | null;
  savingCredentials: boolean;
  updateStoreAlias: (args: { token: string; storeId: Id<"shopifyStoreConnections">; alias: string }) => Promise<unknown>;
  onSync: (shopDomain: string) => void;
  onSyncProducts: (shopDomain: string) => void;
  onRegisterWebhooks: (shopDomain: string) => void;
  onStartEditingCredentials: (store: ShopifyStore) => void;
  onSaveCredentials: () => void;
  onCancelEditingCredentials: () => void;
  onSetPrimary: (storeId: Id<"shopifyStoreConnections">) => void;
  onDisconnect: (storeId: Id<"shopifyStoreConnections">, storeName: string) => void;
}

export function ShopifyStoreCard({
  store,
  token,
  editingAliasStoreId,
  aliasValue,
  setAliasValue,
  setEditingAliasStoreId,
  editingCredentialsStoreId,
  editClientId,
  setEditClientId,
  editClientSecret,
  setEditClientSecret,
  editAppName,
  setEditAppName,
  showEditSecret,
  setShowEditSecret,
  syncing,
  syncingProducts,
  registeringWebhooks,
  savingCredentials,
  updateStoreAlias,
  onSync,
  onSyncProducts,
  onRegisterWebhooks,
  onStartEditingCredentials,
  onSaveCredentials,
  onCancelEditingCredentials,
  onSetPrimary,
  onDisconnect,
}: ShopifyStoreCardProps) {
  const storeId = store._id as Id<"shopifyStoreConnections">;

  return (
    <div className="border border-border rounded-xl hover:shadow-md transition-all group">
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-green-100 group-hover:bg-green-200 transition-colors">
            <Store className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              {editingAliasStoreId === store._id ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={aliasValue}
                    onChange={(e) => setAliasValue(e.target.value)}
                    placeholder="Store alias (e.g., Main Store)"
                    className="h-8 w-40"
                    autoFocus
                    onKeyDown={async (e) => {
                      if (e.key === "Enter" && aliasValue.trim() && token) {
                        try {
                          await updateStoreAlias({
                            token,
                            storeId,
                            alias: aliasValue.trim(),
                          });
                          toast.success("Alias updated!");
                          setEditingAliasStoreId(null);
                        } catch (error: unknown) {
                          toast.error(
                            (error as { message?: string }).message || "Failed to update alias"
                          );
                        }
                      } else if (e.key === "Escape") {
                        setEditingAliasStoreId(null);
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    onClick={async () => {
                      if (aliasValue.trim() && token) {
                        try {
                          await updateStoreAlias({
                            token,
                            storeId,
                            alias: aliasValue.trim(),
                          });
                          toast.success("Alias updated!");
                          setEditingAliasStoreId(null);
                        } catch (error: unknown) {
                          toast.error(
                            (error as { message?: string }).message || "Failed to update alias"
                          );
                        }
                      }
                    }}
                  >
                    <Check className="h-4 w-4 text-green-600" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    onClick={() => setEditingAliasStoreId(null)}
                  >
                    <X className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ) : (
                <>
                  <span className="font-medium">{store.displayName}</span>
                  <button
                    onClick={() => {
                      setEditingAliasStoreId(store._id);
                      setAliasValue(store.alias || "");
                    }}
                    className="p-1 hover:bg-accent rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Edit alias"
                  >
                    <Pencil className="h-3 w-3 text-muted-foreground" />
                  </button>
                </>
              )}
              {store.isPrimary && (
                <Badge variant="success" className="text-xs">
                  <Star className="h-3 w-3 mr-1" />
                  Primary
                </Badge>
              )}
              {store.isActive && (
                <Badge variant="outline" className="text-xs">
                  <Check className="h-3 w-3 mr-1" />
                  Active
                </Badge>
              )}
              {store.hasAppCredentials ? (
                <Badge
                  variant="outline"
                  className="text-xs bg-violet-50 text-violet-700 border-violet-200"
                >
                  <Key className="h-3 w-3 mr-1" />
                  Own App
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs bg-gray-50 text-gray-600">
                  Global App
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{store.shopDomain}</span>
              {store.appName && (
                <span className="text-xs">• {store.appName}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSync(store.shopDomain)}
            loading={syncing === store.shopDomain}
            title="Sync orders from Shopify"
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Orders
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSyncProducts(store.shopDomain)}
            loading={syncingProducts === store.shopDomain}
            title="Sync products/SKUs from Shopify"
          >
            <ShoppingBag className="h-4 w-4 mr-1" />
            Products
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onRegisterWebhooks(store.shopDomain)}
            loading={registeringWebhooks === store.shopDomain}
            title="Enable real-time order sync"
          >
            <Zap className="h-4 w-4 mr-1" />
            Webhooks
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onStartEditingCredentials(store)}
            title="Edit app credentials"
            className="text-violet-600 hover:text-violet-700 hover:bg-violet-50"
          >
            <Key className="h-4 w-4" />
          </Button>
          {!store.isPrimary && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSetPrimary(storeId)}
              title="Set as primary"
            >
              <Star className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDisconnect(storeId, store.connectionName || store.shopDomain)}
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            title="Disconnect"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {editingCredentialsStoreId === store._id && (
        <div className="px-4 pb-4 pt-0">
          <div className="p-4 border border-violet-200 rounded-lg bg-violet-50/50">
            <div className="flex items-center gap-2 mb-3">
              <Key className="h-4 w-4 text-violet-600" />
              <h5 className="font-medium text-sm">Edit App Credentials</h5>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">App Name</label>
                <Input
                  value={editAppName}
                  onChange={(e) => setEditAppName(e.target.value)}
                  placeholder="e.g., My Store App"
                  className="h-9 text-sm bg-white"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Client ID <span className="text-red-500">*</span>
                </label>
                <Input
                  value={editClientId}
                  onChange={(e) => setEditClientId(e.target.value)}
                  placeholder="Shopify App Client ID"
                  className="h-9 text-sm bg-white"
                />
              </div>
            </div>
            <div className="mt-3 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Client Secret
                <span className="text-muted-foreground font-normal ml-1">
                  (leave empty to keep existing)
                </span>
              </label>
              <div className="relative">
                <Input
                  type={showEditSecret ? "text" : "password"}
                  value={editClientSecret}
                  onChange={(e) => setEditClientSecret(e.target.value)}
                  placeholder={store.clientSecretPreview || "Enter new secret"}
                  className="h-9 text-sm bg-white pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowEditSecret(!showEditSecret)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showEditSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button size="sm" onClick={onSaveCredentials} loading={savingCredentials}>
                <Check className="h-4 w-4 mr-1" />
                Save Credentials
              </Button>
              <Button size="sm" variant="outline" onClick={onCancelEditingCredentials}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
