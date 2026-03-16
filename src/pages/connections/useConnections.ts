import { useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "../../contexts/AuthContext";
import { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import type { ConnectionConfig, ConnectionType, PickupPointData } from "./types";

export function useConnections() {
  const { token } = useAuth();

  // Connection editing state
  const [editingConnection, setEditingConnection] = useState<ConnectionType | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);

  // Shopify connection state
  const [showAddShopify, setShowAddShopify] = useState(false);
  const [shopDomain, setShopDomain] = useState("");
  const [connectingShopify, setConnectingShopify] = useState(false);
  const [storeClientId, setStoreClientId] = useState("");
  const [storeClientSecret, setStoreClientSecret] = useState("");
  const [storeAppName, setStoreAppName] = useState("");
  const [showStoreSecret, setShowStoreSecret] = useState(false);
  const [editingCredentialsStoreId, setEditingCredentialsStoreId] = useState<string | null>(null);
  const [editClientId, setEditClientId] = useState("");
  const [editClientSecret, setEditClientSecret] = useState("");
  const [editAppName, setEditAppName] = useState("");
  const [showEditSecret, setShowEditSecret] = useState(false);
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [syncingProducts, setSyncingProducts] = useState<string | null>(null);
  const [registeringWebhooks, setRegisteringWebhooks] = useState<string | null>(null);
  const [editingAliasStoreId, setEditingAliasStoreId] = useState<string | null>(null);
  const [aliasValue, setAliasValue] = useState("");

  // Sameday pickup point state
  const [samedayPickupPoints, setSamedayPickupPoints] = useState<PickupPointData[]>([]);
  const [samedayFetching, setSamedayFetching] = useState(false);
  const [samedayFetched, setSamedayFetched] = useState(false);
  const [selectedPickupPointId, setSelectedPickupPointId] = useState<string>("");
  const [selectedContactPersonId, setSelectedContactPersonId] = useState<string>("");

  // Queries
  const connections = useQuery(api.connections.list, token ? { token } : "skip");
  const shopifyStores = useQuery(api.shopifyOauth.getStores, token ? { token } : "skip");

  // Mutations
  const createConnection = useMutation(api.connections.create);
  const setPrimaryStore = useMutation(api.shopifyOauth.setPrimaryStore);
  const disconnectStore = useMutation(api.shopifyOauth.disconnectStore);
  const updateStoreAlias = useMutation(api.shopifyOauth.updateStoreAlias);
  const updateStoreCredentials = useMutation(api.shopifyOauth.updateStoreCredentials);

  // Actions
  const syncOrders = useAction(api.shopify.syncOrders);
  const syncProducts = useAction(api.shopify.syncProducts);
  const registerWebhooks = useAction(api.shopify.registerWebhooks);
  const initOAuth = useAction(api.shopifyOauth.initOAuth);
  const fetchPickupPoints = useAction(api.sameday.fetchPickupPoints);

  const getConnectionStatus = (type: ConnectionType) =>
    connections?.find((c: { connectionType: string }) => c.connectionType === type);

  const handleEdit = (config: ConnectionConfig) => {
    setEditingConnection(config.type);
    const initialData: Record<string, string> = {};
    config.fields.forEach((field) => {
      initialData[field.name] = "";
    });
    setFormData(initialData);
    if (config.type === "sameday") {
      setSamedayPickupPoints([]);
      setSamedayFetched(false);
      setSelectedPickupPointId("");
      setSelectedContactPersonId("");
    }
  };

  const handleSamedayFetchPickupPoints = async () => {
    if (!formData.username || !formData.password) {
      toast.error("Introdu username și parola Sameday");
      return;
    }
    setSamedayFetching(true);
    try {
      const result = await fetchPickupPoints({
        username: formData.username,
        password: formData.password,
        apiUrl: formData.api_url || undefined,
      });
      setSamedayPickupPoints(result.pickupPoints);
      setSamedayFetched(true);

      if (result.pickupPoints.length === 0) {
        toast.error("Nu s-au găsit puncte de ridicare. Verifică contul Sameday.");
        return;
      }

      const defaultPP = result.pickupPoints.find((pp: PickupPointData) => pp.isDefault) || result.pickupPoints[0];
      setSelectedPickupPointId(String(defaultPP.id));

      if (defaultPP.contactPersons.length > 0) {
        const defaultCP =
          defaultPP.contactPersons.find((cp: { isDefault: boolean }) => cp.isDefault) || defaultPP.contactPersons[0];
        setSelectedContactPersonId(String(defaultCP.id));
      }

      toast.success(`${result.pickupPoints.length} punct(e) de ridicare găsite!`);
    } catch (error: unknown) {
      toast.error((error as { message?: string }).message || "Nu s-au putut prelua punctele de ridicare");
      setSamedayFetched(false);
    } finally {
      setSamedayFetching(false);
    }
  };

  const handleSamedaySave = async () => {
    if (!token) return;
    if (!selectedPickupPointId || !selectedContactPersonId) {
      toast.error("Selectează punctul de ridicare și persoana de contact");
      return;
    }
    setSaving(true);
    try {
      await createConnection({
        token,
        connectionType: "sameday",
        connectionName: "Sameday Courier",
        credentials: {
          username: formData.username,
          password: formData.password,
          api_url: formData.api_url || "",
          pickup_location: selectedPickupPointId,
          contact_person_id: selectedContactPersonId,
        },
      });
      toast.success("Sameday conectat cu succes!");
      setEditingConnection(null);
      setFormData({});
      setSamedayPickupPoints([]);
      setSamedayFetched(false);
      setSelectedPickupPointId("");
      setSelectedContactPersonId("");
    } catch (error: unknown) {
      toast.error((error as { message?: string }).message || "Eroare la salvare");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (config: ConnectionConfig) => {
    if (!token) return;

    if (config.type === "sameday") {
      await handleSamedaySave();
      return;
    }

    const missingFields = config.fields
      .filter((f) => f.required && !formData[f.name])
      .map((f) => f.label);

    if (missingFields.length > 0) {
      toast.error(`Missing required fields: ${missingFields.join(", ")}`);
      return;
    }

    setSaving(true);
    try {
      await createConnection({
        token,
        connectionType: config.type,
        connectionName: config.name,
        credentials: formData,
      });
      toast.success(`${config.name} connection saved`);
      setEditingConnection(null);
      setFormData({});
    } catch (error: unknown) {
      toast.error((error as { message?: string }).message || "Failed to save connection");
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async (shopDomain?: string) => {
    if (!token) return;
    const syncKey = shopDomain || "default";
    setSyncing(syncKey);
    try {
      const result = await syncOrders({ token, shopDomain });
      toast.success(result.message);
    } catch (error: unknown) {
      toast.error((error as { message?: string }).message || "Failed to sync orders");
    } finally {
      setSyncing(null);
    }
  };

  const handleConnectShopifyOAuth = async () => {
    if (!token || !shopDomain.trim()) {
      toast.error("Introdu domeniul magazinului");
      return;
    }
    if (!storeClientId.trim()) {
      toast.error("Introdu Client ID pentru acest magazin");
      return;
    }
    if (!storeClientSecret.trim()) {
      toast.error("Introdu Client Secret pentru acest magazin");
      return;
    }

    setConnectingShopify(true);
    try {
      const redirectUri = `${window.location.origin}/oauth/shopify/callback`;

      const result = await initOAuth({
        token,
        shopDomain: shopDomain.trim(),
        redirectUri,
        clientId: storeClientId.trim(),
        clientSecret: storeClientSecret.trim(),
        appName: storeAppName.trim() || undefined,
      });

      window.location.href = result.authorizationUrl;
    } catch (error: unknown) {
      toast.error((error as { message?: string }).message || "Failed to start OAuth flow");
      setConnectingShopify(false);
    }
  };

  const handleSaveStoreCredentials = async () => {
    if (!token || !editingCredentialsStoreId) return;

    if (!editClientId.trim()) {
      toast.error("Client ID is required");
      return;
    }

    setSavingCredentials(true);
    try {
      await updateStoreCredentials({
        token,
        storeId: editingCredentialsStoreId as Id<"shopifyStoreConnections">,
        clientId: editClientId.trim(),
        clientSecret: editClientSecret.trim() || undefined,
        appName: editAppName.trim() || undefined,
      });
      toast.success("App credentials updated!");
      setEditingCredentialsStoreId(null);
      setEditClientId("");
      setEditClientSecret("");
      setEditAppName("");
    } catch (error: unknown) {
      toast.error((error as { message?: string }).message || "Failed to update credentials");
    } finally {
      setSavingCredentials(false);
    }
  };

  const startEditingCredentials = (store: {
    _id: string;
    clientId?: string;
    appName?: string;
  }) => {
    setEditingCredentialsStoreId(store._id);
    setEditClientId(store.clientId || "");
    setEditClientSecret("");
    setEditAppName(store.appName || "");
  };

  const cancelEditingCredentials = () => {
    setEditingCredentialsStoreId(null);
    setEditClientId("");
    setEditClientSecret("");
    setEditAppName("");
  };

  const resetAddStoreForm = () => {
    setShowAddShopify(false);
    setShopDomain("");
    setStoreClientId("");
    setStoreClientSecret("");
    setStoreAppName("");
  };

  const handleSetPrimary = async (storeId: Id<"shopifyStoreConnections">) => {
    if (!token) return;
    try {
      await setPrimaryStore({ token, storeId });
      toast.success("Primary store updated");
    } catch (error: unknown) {
      toast.error((error as { message?: string }).message || "Failed to set primary store");
    }
  };

  const handleDisconnectStore = async (
    storeId: Id<"shopifyStoreConnections">,
    storeName: string
  ) => {
    if (!token) return;
    if (!confirm(`Are you sure you want to disconnect ${storeName}?`)) return;

    try {
      await disconnectStore({ token, storeId });
      toast.success("Store disconnected");
    } catch (error: unknown) {
      toast.error((error as { message?: string }).message || "Failed to disconnect store");
    }
  };

  const handleSyncProducts = async (shopDomain: string) => {
    if (!token) return;
    setSyncingProducts(shopDomain);
    try {
      const result = await syncProducts({ token, shopDomain });
      toast.success(result.message);
    } catch (error: unknown) {
      toast.error((error as { message?: string }).message || "Failed to sync products");
    } finally {
      setSyncingProducts(null);
    }
  };

  const handleRegisterWebhooks = async (shopDomain: string) => {
    if (!token) return;
    setRegisteringWebhooks(shopDomain);
    try {
      const result = await registerWebhooks({ token, shopDomain });
      toast.success(`Webhooks registered: ${result.registered.join(", ")}`);
    } catch (error: unknown) {
      toast.error((error as { message?: string }).message || "Failed to register webhooks");
    } finally {
      setRegisteringWebhooks(null);
    }
  };

  const togglePasswordVisibility = (fieldName: string) => {
    setShowPasswords((prev) => ({
      ...prev,
      [fieldName]: !prev[fieldName],
    }));
  };

  const selectedPickupPoint = samedayPickupPoints.find(
    (pp) => String(pp.id) === selectedPickupPointId
  );
  const availableContactPersons = selectedPickupPoint?.contactPersons || [];

  const resetSamedayEdit = () => {
    setEditingConnection(null);
    setFormData({});
    setSamedayPickupPoints([]);
    setSamedayFetched(false);
    setSelectedPickupPointId("");
    setSelectedContactPersonId("");
  };

  const resetSamedayCredentials = () => {
    setSamedayFetched(false);
    setSamedayPickupPoints([]);
    setSelectedPickupPointId("");
    setSelectedContactPersonId("");
  };

  return {
    token,
    connections,
    shopifyStores,
    hasStores: shopifyStores && shopifyStores.length > 0,

    editingConnection,
    setEditingConnection,
    formData,
    setFormData,
    showPasswords,
    saving,
    syncing,
    showAddShopify,
    setShowAddShopify,
    shopDomain,
    setShopDomain,
    connectingShopify,
    storeClientId,
    setStoreClientId,
    storeClientSecret,
    setStoreClientSecret,
    storeAppName,
    setStoreAppName,
    showStoreSecret,
    setShowStoreSecret,
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
    syncingProducts,
    registeringWebhooks,
    editingAliasStoreId,
    setEditingAliasStoreId,
    aliasValue,
    setAliasValue,
    updateStoreAlias,

    samedayPickupPoints,
    samedayFetching,
    samedayFetched,
    setSamedayFetched,
    setSamedayPickupPoints,
    selectedPickupPointId,
    setSelectedPickupPointId,
    selectedContactPersonId,
    setSelectedContactPersonId,
    availableContactPersons,

    getConnectionStatus,
    handleEdit,
    handleSamedayFetchPickupPoints,
    handleSamedaySave,
    handleSave,
    handleSync,
    handleConnectShopifyOAuth,
    handleSaveStoreCredentials,
    startEditingCredentials,
    cancelEditingCredentials,
    resetAddStoreForm,
    handleSetPrimary,
    handleDisconnectStore,
    handleSyncProducts,
    handleRegisterWebhooks,
    togglePasswordVisibility,
    resetSamedayEdit,
    resetSamedayCredentials,
  };
}
