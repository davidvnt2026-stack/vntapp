import React, { createContext, useContext, useState, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

interface User {
  _id: string;
  email: string;
  name?: string;
  userId: string;
  createdAt: number;
  isAdmin?: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  token: string | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, name?: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => 
    localStorage.getItem("authToken")
  );
  
  const user = useQuery(api.auth.getCurrentUser, token ? { token } : "skip");
  const signInMutation = useMutation(api.auth.signIn);
  const signUpMutation = useMutation(api.auth.signUp);
  const signOutMutation = useMutation(api.auth.signOut);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const result = await signInMutation({ email, password });
      localStorage.setItem("authToken", result.token);
      setToken(result.token);
      return { error: null };
    } catch (err: any) {
      return { error: err.message || "Failed to sign in" };
    }
  }, [signInMutation]);

  const signUp = useCallback(async (email: string, password: string, name?: string) => {
    try {
      const result = await signUpMutation({ email, password, name });
      localStorage.setItem("authToken", result.token);
      setToken(result.token);
      return { error: null };
    } catch (err: any) {
      return { error: err.message || "Failed to sign up" };
    }
  }, [signUpMutation]);

  const signOut = useCallback(async () => {
    if (token) {
      try {
        await signOutMutation({ token });
      } catch (err) {
        console.error("Sign out error:", err);
      }
    }
    localStorage.removeItem("authToken");
    setToken(null);
  }, [token, signOutMutation]);

  const loading = token !== null && user === undefined;
  const isAdmin = user?.isAdmin || false;
  const isSuperAdmin = user?.isAdmin || false;

  const value: AuthContextType = {
    user: user as User | null,
    loading,
    token,
    signIn,
    signUp,
    signOut,
    isAdmin,
    isSuperAdmin,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
