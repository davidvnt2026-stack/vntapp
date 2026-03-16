import { Button } from "../../components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Plus, ShoppingBag, Store } from "lucide-react";
import { ShopifyAddStoreForm } from "./ShopifyAddStoreForm";
import { ShopifyStoreCard } from "./ShopifyStoreCard";

interface ShopifySectionProps {
  hasStores: boolean;
  shopifyStores: Array<{
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
  }> | undefined;
  showAddShopify: boolean;
  setShowAddShopify: (v: boolean) => void;
  shopDomain: string;
  setShopDomain: (v: string) => void;
  storeClientId: string;
  setStoreClientId: (v: string) => void;
  storeClientSecret: string;
  setStoreClientSecret: (v: string) => void;
  storeAppName: string;
  setStoreAppName: (v: string) => void;
  showStoreSecret: boolean;
  setShowStoreSecret: (v: boolean) => void;
  connectingShopify: boolean;
  editingCredentialsStoreId: string | null;
  editClientId: string;
  setEditClientId: (v: string) => void;
  editClientSecret: string;
  setEditClientSecret: (v: string) => void;
  editAppName: string;
  setEditAppName: (v: string) => void;
  showEditSecret: boolean;
  setShowEditSecret: (v: boolean) => void;
  savingCredentials: boolean;
  syncing: string | null;
  syncingProducts: string | null;
  registeringWebhooks: string | null;
  editingAliasStoreId: string | null;
  aliasValue: string;
  setAliasValue: (v: string) => void;
  setEditingAliasStoreId: (v: string | null) => void;
  token: string | null;
  onConnect: () => void;
  onResetAddStoreForm: () => void;
  onSaveCredentials: () => void;
  onStartEditingCredentials: (store: { _id: string; clientId?: string; appName?: string }) => void;
  onCancelEditingCredentials: () => void;
  onSync: (shopDomain: string) => void;
  onSyncProducts: (shopDomain: string) => void;
  onRegisterWebhooks: (shopDomain: string) => void;
  onSetPrimary: (storeId: import("../../../convex/_generated/dataModel").Id<"shopifyStoreConnections">) => void;
  onDisconnect: (storeId: import("../../../convex/_generated/dataModel").Id<"shopifyStoreConnections">, storeName: string) => void;
  updateStoreAlias: (args: {
    token: string;
    storeId: import("../../../convex/_generated/dataModel").Id<"shopifyStoreConnections">;
    alias: string;
  }) => Promise<unknown>;
}

export function ShopifySection({
  hasStores,
  shopifyStores,
  showAddShopify,
  setShowAddShopify,
  shopDomain,
  setShopDomain,
  storeClientId,
  setStoreClientId,
  storeClientSecret,
  setStoreClientSecret,
  storeAppName,
  setStoreAppName,
  showStoreSecret,
  setShowStoreSecret,
  connectingShopify,
  editingCredentialsStoreId,
  editClientId,
  setEditClientId,
  editClientSecret,
  setEditClientSecret,
  editAppName,
  setEditAppName,
  showEditSecret,
  setShowEditSecret,
  savingCredentials,
  syncing,
  syncingProducts,
  registeringWebhooks,
  editingAliasStoreId,
  aliasValue,
  setAliasValue,
  setEditingAliasStoreId,
  token,
  onConnect,
  onResetAddStoreForm,
  onSaveCredentials,
  onStartEditingCredentials,
  onCancelEditingCredentials,
  onSync,
  onSyncProducts,
  onRegisterWebhooks,
  onSetPrimary,
  onDisconnect,
  updateStoreAlias,
}: ShopifySectionProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-gradient-to-br from-green-400 to-emerald-600 text-white shadow-lg shadow-green-500/25">
          <ShoppingBag className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">Shopify Integration</h2>
          <p className="text-sm text-muted-foreground">
            Connect your Shopify stores to sync orders and products
          </p>
        </div>
      </div>

      <Card
        className={`border-2 transition-all ${
          hasStores ? "border-green-500/30" : "border-violet-500/50 shadow-lg shadow-violet-500/10"
        }`}
      >
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${hasStores ? "bg-green-100" : "bg-violet-100"}`}>
                <Store className={`h-5 w-5 ${hasStores ? "text-green-600" : "text-violet-600"}`} />
              </div>
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  Connected Stores
                  {hasStores && shopifyStores && (
                    <Badge variant="success" className="text-xs">
                      {shopifyStores.length} {shopifyStores.length === 1 ? "store" : "stores"}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  {hasStores
                    ? "Manage your connected Shopify stores"
                    : "Add your first Shopify store to get started"}
                </CardDescription>
              </div>
            </div>
            <Button onClick={() => setShowAddShopify(true)} className="shadow-lg shadow-violet-500/25">
              <Plus className="h-4 w-4 mr-2" />
              Add Store
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {showAddShopify && (
            <ShopifyAddStoreForm
              shopDomain={shopDomain}
              setShopDomain={setShopDomain}
              storeClientId={storeClientId}
              setStoreClientId={setStoreClientId}
              storeClientSecret={storeClientSecret}
              setStoreClientSecret={setStoreClientSecret}
              storeAppName={storeAppName}
              setStoreAppName={setStoreAppName}
              showStoreSecret={showStoreSecret}
              setShowStoreSecret={setShowStoreSecret}
              connectingShopify={connectingShopify}
              onConnect={onConnect}
              onCancel={onResetAddStoreForm}
            />
          )}

          {shopifyStores && shopifyStores.length > 0 ? (
            <div className="space-y-3">
              {shopifyStores.map((store) => (
                <ShopifyStoreCard
                  key={store._id}
                  store={store}
                  token={token}
                  editingAliasStoreId={editingAliasStoreId}
                  aliasValue={aliasValue}
                  setAliasValue={setAliasValue}
                  setEditingAliasStoreId={setEditingAliasStoreId}
                  editingCredentialsStoreId={editingCredentialsStoreId}
                  editClientId={editClientId}
                  setEditClientId={setEditClientId}
                  editClientSecret={editClientSecret}
                  setEditClientSecret={setEditClientSecret}
                  editAppName={editAppName}
                  setEditAppName={setEditAppName}
                  showEditSecret={showEditSecret}
                  setShowEditSecret={setShowEditSecret}
                  syncing={syncing}
                  syncingProducts={syncingProducts}
                  registeringWebhooks={registeringWebhooks}
                  savingCredentials={savingCredentials}
                  updateStoreAlias={updateStoreAlias}
                  onSync={onSync}
                  onSyncProducts={onSyncProducts}
                  onRegisterWebhooks={onRegisterWebhooks}
                  onStartEditingCredentials={onStartEditingCredentials}
                  onSaveCredentials={onSaveCredentials}
                  onCancelEditingCredentials={onCancelEditingCredentials}
                  onSetPrimary={onSetPrimary}
                  onDisconnect={onDisconnect}
                />
              ))}
            </div>
          ) : !showAddShopify ? (
            <div className="text-center py-10">
              <div className="inline-flex p-4 rounded-2xl bg-violet-100 mb-4">
                <Store className="h-10 w-10 text-violet-600" />
              </div>
              <h3 className="font-medium text-lg mb-1">No stores connected yet</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Click "Add Store" to connect your first Shopify store
              </p>
              <Button onClick={() => setShowAddShopify(true)} variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Store
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
