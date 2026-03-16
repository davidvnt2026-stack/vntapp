import { Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { StoreProvider } from "./contexts/StoreContext";
import { ImpersonationProvider } from "./contexts/ImpersonationContext";
import { Layout } from "./components/Layout";
import { ErrorBoundary } from "./components/ui/ErrorBoundary";

// Auth pages
import { LoginPage, ShopifyCallbackPage } from "./pages/auth";

// Main pages
import { DashboardPage } from "./pages/dashboard";
import { OrdersPage } from "./pages/orders";
import { ConnectionsPageContent as ConnectionsPage } from "./pages/connections";
import { SettingsPage } from "./pages/SettingsPage";

// Picking list pages
import { PickingListsPage, PickingListDetailPage } from "./pages/picking-lists";

// Stock pages
import { StockOrdersPage, ItemsPage, InboundStockPage } from "./pages/stock";

// Returns page
import { ReturnsPage } from "./pages/returns";

// Courier Summary page
import { CourierSummaryPage } from "./pages/CourierSummaryPage";

// Users page (admin only)
import { UsersPage } from "./pages/UsersPage";

// Invoices page (admin only)
import { InvoicesPage } from "./pages/invoices";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, token } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <ImpersonationProvider>
      <StoreProvider>{children}</StoreProvider>
    </ImpersonationProvider>
  );
}

function AppRoutes() {
  const { token, user } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={token && user ? <Navigate to="/" replace /> : <LoginPage />}
      />
      {/* Shopify OAuth callback - must be accessible without auth */}
      <Route path="/oauth/shopify/callback" element={<ShopifyCallbackPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="returns" element={<ReturnsPage />} />
        <Route path="courier-summary" element={<CourierSummaryPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="stock-orders" element={<StockOrdersPage />} />
        <Route path="items" element={<ItemsPage />} />
        <Route path="inbound" element={<InboundStockPage />} />
        <Route path="picking-lists" element={<PickingListsPage />} />
        <Route path="picking-lists/:id" element={<PickingListDetailPage />} />
        <Route path="connections" element={<ConnectionsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ErrorBoundary>
        <AppRoutes />
      </ErrorBoundary>
      <Toaster 
        position="bottom-right" 
        richColors 
        closeButton
        toastOptions={{
          duration: 5000,
        }}
      />
    </AuthProvider>
  );
}
