import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "./AuthContext";

interface Store {
  _id: string;
  shopDomain: string;
  shopUrl: string;
  connectionName?: string;
  alias?: string;
  displayName: string;
  isActive: boolean;
  isPrimary: boolean;
}

interface StoreContextType {
  stores: Store[] | undefined;
  selectedStore: Store | null;
  selectedShopDomain: string | null;
  setSelectedStore: (store: Store | null) => void;
  isLoading: boolean;
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

export function StoreProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [selectedShopDomain, setSelectedShopDomain] = useState<string | null>(() => {
    // Try to restore from localStorage
    return localStorage.getItem("selectedShopDomain");
  });
  
  const stores = useQuery(api.shopifyOauth.getStores, token ? { token } : "skip");
  
  // Find selected store from the list
  const selectedStore = stores?.find(s => s.shopDomain === selectedShopDomain) || 
                        stores?.find(s => s.isPrimary) || 
                        stores?.[0] || 
                        null;
  
  // Update selected domain when stores load and nothing is selected
  useEffect(() => {
    if (stores && stores.length > 0 && !selectedShopDomain) {
      const primary = stores.find(s => s.isPrimary) || stores[0];
      setSelectedShopDomain(primary.shopDomain);
      localStorage.setItem("selectedShopDomain", primary.shopDomain);
    }
  }, [stores, selectedShopDomain]);
  
  const setSelectedStore = (store: Store | null) => {
    if (store) {
      setSelectedShopDomain(store.shopDomain);
      localStorage.setItem("selectedShopDomain", store.shopDomain);
    } else {
      setSelectedShopDomain(null);
      localStorage.removeItem("selectedShopDomain");
    }
  };
  
  // While stores are still loading, use the raw localStorage value so that
  // queries immediately filter by the correct domain instead of briefly
  // running unfiltered (which causes orders to flash then disappear).
  const resolvedShopDomain = stores === undefined
    ? selectedShopDomain           // loading – trust localStorage
    : (selectedStore?.shopDomain || null);  // loaded – use resolved store

  return (
    <StoreContext.Provider
      value={{
        stores,
        selectedStore,
        selectedShopDomain: resolvedShopDomain,
        setSelectedStore,
        isLoading: stores === undefined,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const context = useContext(StoreContext);
  if (context === undefined) {
    throw new Error("useStore must be used within a StoreProvider");
  }
  return context;
}
