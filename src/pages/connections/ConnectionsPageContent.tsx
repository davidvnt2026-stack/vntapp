import { useConnections } from "./useConnections";
import { ShopifySection } from "./ShopifySection";
import { OtherIntegrationsSection } from "./OtherIntegrationsSection";
import { SetupTipsCard } from "./SetupTipsCard";

export function ConnectionsPageContent() {
  const hook = useConnections();

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Connections</h1>
          <p className="text-muted-foreground mt-1">
            Configure your external service integrations
          </p>
        </div>
      </div>

      <ShopifySection
        hasStores={!!hook.hasStores}
        shopifyStores={hook.shopifyStores as Array<{
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
        }> | undefined}
        showAddShopify={hook.showAddShopify}
        setShowAddShopify={hook.setShowAddShopify}
        shopDomain={hook.shopDomain}
        setShopDomain={hook.setShopDomain}
        storeClientId={hook.storeClientId}
        setStoreClientId={hook.setStoreClientId}
        storeClientSecret={hook.storeClientSecret}
        setStoreClientSecret={hook.setStoreClientSecret}
        storeAppName={hook.storeAppName}
        setStoreAppName={hook.setStoreAppName}
        showStoreSecret={hook.showStoreSecret}
        setShowStoreSecret={hook.setShowStoreSecret}
        connectingShopify={hook.connectingShopify}
        editingCredentialsStoreId={hook.editingCredentialsStoreId}
        editClientId={hook.editClientId}
        setEditClientId={hook.setEditClientId}
        editClientSecret={hook.editClientSecret}
        setEditClientSecret={hook.setEditClientSecret}
        editAppName={hook.editAppName}
        setEditAppName={hook.setEditAppName}
        showEditSecret={hook.showEditSecret}
        setShowEditSecret={hook.setShowEditSecret}
        savingCredentials={hook.savingCredentials}
        syncing={hook.syncing}
        syncingProducts={hook.syncingProducts}
        registeringWebhooks={hook.registeringWebhooks}
        editingAliasStoreId={hook.editingAliasStoreId}
        aliasValue={hook.aliasValue}
        setAliasValue={hook.setAliasValue}
        setEditingAliasStoreId={hook.setEditingAliasStoreId}
        token={hook.token}
        onConnect={hook.handleConnectShopifyOAuth}
        onResetAddStoreForm={hook.resetAddStoreForm}
        onSaveCredentials={hook.handleSaveStoreCredentials}
        onStartEditingCredentials={hook.startEditingCredentials}
        onCancelEditingCredentials={hook.cancelEditingCredentials}
        onSync={hook.handleSync}
        onSyncProducts={hook.handleSyncProducts}
        onRegisterWebhooks={hook.handleRegisterWebhooks}
        onSetPrimary={hook.handleSetPrimary}
        onDisconnect={hook.handleDisconnectStore}
        updateStoreAlias={hook.updateStoreAlias}
      />

      <OtherIntegrationsSection
        getConnectionStatus={hook.getConnectionStatus}
        editingConnection={hook.editingConnection}
        formData={hook.formData}
        setFormData={hook.setFormData}
        showPasswords={hook.showPasswords}
        saving={hook.saving}
        samedayPickupPoints={hook.samedayPickupPoints}
        samedayFetching={hook.samedayFetching}
        samedayFetched={hook.samedayFetched}
        selectedPickupPointId={hook.selectedPickupPointId}
        setSelectedPickupPointId={hook.setSelectedPickupPointId}
        selectedContactPersonId={hook.selectedContactPersonId}
        setSelectedContactPersonId={hook.setSelectedContactPersonId}
        availableContactPersons={hook.availableContactPersons}
        togglePasswordVisibility={hook.togglePasswordVisibility}
        handleEdit={hook.handleEdit}
        handleSamedayFetchPickupPoints={hook.handleSamedayFetchPickupPoints}
        handleSamedaySave={hook.handleSamedaySave}
        handleSave={hook.handleSave}
        resetSamedayEdit={hook.resetSamedayEdit}
        resetSamedayCredentials={hook.resetSamedayCredentials}
        setEditingConnection={hook.setEditingConnection}
      />

      <SetupTipsCard />
    </div>
  );
}
