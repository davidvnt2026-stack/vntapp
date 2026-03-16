import React, { createContext, useContext, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "./AuthContext";
import type { Id } from "../../convex/_generated/dataModel";

interface ImpersonatedUser {
  _id: string;
  email: string;
  name?: string;
}

interface RealUser {
  _id: string;
  email: string;
  name?: string;
  isAdmin: boolean;
}

interface ImpersonationContextType {
  impersonatedUser: ImpersonatedUser | null;
  realUser: RealUser | null;
  isImpersonating: boolean;
  isLoading: boolean;
  startImpersonation: (userId: Id<"profiles">) => Promise<void>;
  stopImpersonation: () => Promise<void>;
}

const ImpersonationContext = createContext<ImpersonationContextType | undefined>(undefined);

export function ImpersonationProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  
  // Query impersonation status from server
  const impersonationStatus = useQuery(
    api.auth.getImpersonationStatus,
    token ? { token } : "skip"
  );
  
  // Mutations
  const startImpersonationMutation = useMutation(api.auth.startImpersonation);
  const stopImpersonationMutation = useMutation(api.auth.stopImpersonation);

  const startImpersonation = useCallback(async (userId: Id<"profiles">) => {
    if (!token) return;
    await startImpersonationMutation({ token, targetUserId: userId });
  }, [token, startImpersonationMutation]);

  const stopImpersonation = useCallback(async () => {
    if (!token) return;
    await stopImpersonationMutation({ token });
  }, [token, stopImpersonationMutation]);

  const isLoading = impersonationStatus === undefined;
  const isImpersonating = impersonationStatus?.isImpersonating || false;
  const impersonatedUser = impersonationStatus?.impersonatedUser || null;
  const realUser = impersonationStatus?.realUser || null;

  return (
    <ImpersonationContext.Provider
      value={{
        impersonatedUser,
        realUser,
        isImpersonating,
        isLoading,
        startImpersonation,
        stopImpersonation,
      }}
    >
      {children}
    </ImpersonationContext.Provider>
  );
}

export function useImpersonation() {
  const context = useContext(ImpersonationContext);
  if (context === undefined) {
    throw new Error("useImpersonation must be used within an ImpersonationProvider");
  }
  return context;
}
