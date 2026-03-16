import { Outlet, Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  ShoppingCart,
  ClipboardList,
  Plug,
  Settings,
  LogOut,
  Menu,
  X,
  BarChart3,
  Tag,
  ArrowDownToLine,
  Store,
  ChevronDown,
  Check,
  RotateCcw,
  Truck,
  Users,
  XCircle,
  FileText,
} from "lucide-react";
import { useState, useEffect, useRef, useMemo } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useStore } from "../contexts/StoreContext";
import { useImpersonation } from "../contexts/ImpersonationContext";
import { cn } from "../lib/utils";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Orders", href: "/orders", icon: ShoppingCart },
  { name: "Picking Lists", href: "/picking-lists", icon: ClipboardList },
  { name: "Returns", href: "/returns", icon: RotateCcw },
  { name: "Courier Summary", href: "/courier-summary", icon: Truck },
  { name: "Items / SKUs", href: "/items", icon: Tag },
  { name: "Inbound Stock", href: "/inbound", icon: ArrowDownToLine },
  { name: "Stock & Orders", href: "/stock-orders", icon: BarChart3 },
  { name: "Facturare", href: "/invoices", icon: FileText, adminOnly: true },
  { name: "Users", href: "/users", icon: Users, adminOnly: true },
  { name: "Connections", href: "/connections", icon: Plug },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [storeDropdownOpen, setStoreDropdownOpen] = useState(false);
  const storeDropdownRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { stores, selectedStore, setSelectedStore } = useStore();
  const { impersonatedUser, realUser, isImpersonating, stopImpersonation } = useImpersonation();

  // Use realUser.isAdmin for nav filtering (works even when impersonating)
  const isAdmin = realUser?.isAdmin || false;

  // Filter navigation based on admin status
  const filteredNavigation = useMemo(() => {
    return navigation.filter(item => !item.adminOnly || isAdmin);
  }, [isAdmin]);

  // Force light theme
  useEffect(() => {
    document.documentElement.classList.remove("dark");
    localStorage.setItem("theme", "light");
  }, []);
  
  // Close store dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (storeDropdownRef.current && !storeDropdownRef.current.contains(e.target as Node)) {
        setStoreDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 transform bg-card border-r border-border transition-transform duration-300 lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center border-b border-border px-4">
            <img
              src="/LOGO VNT LOGISTIC HUB.png"
              alt="VNT Logistic Hub"
              className="h-10 object-contain"
            />
            <button
              className="ml-auto lg:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 px-3 py-4">
            {filteredNavigation.map((item) => {
              const isActive = location.pathname === item.href ||
                (item.href !== "/" && location.pathname.startsWith(item.href));
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* User section */}
          <div className="border-t border-border p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || "U"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user?.name || "User"}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
            </div>
            <button
              onClick={signOut}
              className="mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Impersonation Banner */}
        {isImpersonating && impersonatedUser && (
          <div className="sticky top-0 z-40 bg-amber-500 text-white px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span className="text-sm font-medium">
                Viewing as: <strong>{impersonatedUser.name || impersonatedUser.email}</strong>
              </span>
              <span className="text-amber-100 text-xs">({impersonatedUser.email})</span>
            </div>
            <button
              onClick={stopImpersonation}
              className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 px-3 py-1 rounded text-sm font-medium transition-colors"
            >
              <XCircle className="h-4 w-4" />
              Exit Support Mode
            </button>
          </div>
        )}

        {/* Top header */}
        <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 lg:px-6">
          <button
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-6 w-6" />
          </button>

          <div className="flex-1" />
          
          {/* Store Selector */}
          {stores && stores.length > 0 && (
            <div className="relative" ref={storeDropdownRef}>
              <button
                onClick={() => setStoreDropdownOpen(!storeDropdownOpen)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  stores.length > 1 ? "border-primary/30 bg-primary/5" : "border-border"
                )}
              >
                <Store className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm max-w-[150px] truncate">
                  {selectedStore?.displayName || "Select Store"}
                </span>
                {stores.length > 1 && (
                  <ChevronDown className={cn(
                    "h-4 w-4 transition-transform",
                    storeDropdownOpen && "rotate-180"
                  )} />
                )}
              </button>
              
              {storeDropdownOpen && stores.length > 1 && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-card border border-border rounded-lg shadow-lg z-50 py-1 animate-fade-in">
                  <div className="px-3 py-2 border-b border-border">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Select Store
                    </p>
                  </div>
                  {stores.map((store) => (
                    <button
                      key={store._id}
                      onClick={() => {
                        setSelectedStore(store);
                        setStoreDropdownOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-accent transition-colors",
                        selectedStore?._id === store._id && "bg-primary/10"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {store.displayName}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {store.shopDomain}
                        </div>
                      </div>
                      {selectedStore?._id === store._id && (
                        <Check className="h-4 w-4 text-primary flex-shrink-0" />
                      )}
                      {store.isPrimary && (
                        <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded flex-shrink-0">
                          Primary
                        </span>
                      )}
                    </button>
                  ))}
                  <div className="border-t border-border mt-1 pt-1">
                    <Link
                      to="/connections"
                      onClick={() => setStoreDropdownOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    >
                      <Plug className="h-4 w-4" />
                      Manage Stores
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
