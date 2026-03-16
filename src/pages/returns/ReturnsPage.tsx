import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Eye } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useAuth } from "../../contexts/AuthContext";
import { useStore } from "../../contexts/StoreContext";
import { Button } from "../../components/ui/Button";
import { DailyHistoryCard } from "./DailyHistoryCard";
import { QuickStockReturnCard } from "./QuickStockReturnCard";
import { ReturnsSearchSection } from "./ReturnsSearchSection";
import { ReturnsStatsCards } from "./ReturnsStatsCards";
import { SavedReturnsCard } from "./SavedReturnsCard";
import { SearchResultsTable } from "./SearchResultsTable";
import type { DailyReturnGroup, SearchResult } from "./types";
import { exportDailyHistoryCsv } from "./utils";

export function ReturnsPage() {
  const { token } = useAuth();
  const { selectedShopDomain } = useStore();

  const [orderNumberSearch, setOrderNumberSearch] = useState("");
  const [isSearchingOrder, setIsSearchingOrder] = useState(false);
  const [awbSearch, setAwbSearch] = useState("");
  const [awbList, setAwbList] = useState<string[]>([]);
  const [quickReturnSearch, setQuickReturnSearch] = useState("");
  const [quickReturnOrders, setQuickReturnOrders] = useState<SearchResult[]>([]);
  const [showSavedReturns, setShowSavedReturns] = useState(false);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  const stats = useQuery(
    api.returns.getStats,
    token ? { token, shopDomain: selectedShopDomain ?? undefined } : "skip"
  );
  const dailyHistory = useQuery(
    api.returns.getDailyHistory,
    token ? { token, days: 10, shopDomain: selectedShopDomain ?? undefined } : "skip"
  ) as DailyReturnGroup[] | undefined;

  const searchResults = useQuery(
    api.returns.searchOrdersForReturn,
    token && orderNumberSearch.length >= 2 ? { token, searchTerm: orderNumberSearch } : "skip"
  ) as SearchResult[] | undefined;
  const awbSearchResults = useQuery(
    api.returns.searchOrdersForReturn,
    token && awbSearch.length >= 2 ? { token, searchTerm: awbSearch } : "skip"
  ) as SearchResult[] | undefined;
  const quickSearchResults = useQuery(
    api.returns.searchOrdersForReturn,
    token && quickReturnSearch.length >= 2 ? { token, searchTerm: quickReturnSearch } : "skip"
  ) as SearchResult[] | undefined;

  const createReturn = useMutation(api.returns.create);
  const linkToOrder = useMutation(api.returns.linkToOrder);
  const quickStockReturn = useMutation(api.returns.quickStockReturn);

  const handleSearch = () => {
    if (orderNumberSearch.length < 2) {
      toast.error("Introdu cel putin 2 caractere");
      return;
    }
    setIsSearchingOrder(true);
    setTimeout(() => setIsSearchingOrder(false), 500);
  };

  const handleAddAwb = () => {
    if (!awbSearch.trim()) return;
    if (!awbList.includes(awbSearch.trim())) {
      setAwbList([...awbList, awbSearch.trim()]);
    }
    setAwbSearch("");
  };

  const handleCreateReturn = async (order: SearchResult) => {
    if (!token) return;

    try {
      const result = await createReturn({
        token,
        awbNumber: order.trackingNumber || `ORDER-${order.orderNumber}`,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
      });

      if (result.returnId) {
        await linkToOrder({
          token,
          returnId: result.returnId,
          orderId: order._id,
        });
      }

      toast.success(`Retur creat pentru comanda #${order.orderNumber}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Eroare la creare");
    }
  };

  const handleQuickStockReturn = async () => {
    if (!token || quickReturnOrders.length === 0) return;

    try {
      const result = await quickStockReturn({
        token,
        orderIds: quickReturnOrders.map((order) => order._id),
      });

      if (result.success) {
        toast.success(
          `Stock adaugat pentru ${result.totalItemsAdded} unitati din ${quickReturnOrders.length} comenzi`
        );
        setQuickReturnOrders([]);
        setQuickReturnSearch("");
      } else {
        toast.warning("Unele comenzi au avut erori");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Eroare");
    }
  };

  const addToQuickReturn = (order: SearchResult) => {
    if (!quickReturnOrders.find((existing) => existing._id === order._id)) {
      setQuickReturnOrders([...quickReturnOrders, order]);
    }
    setQuickReturnSearch("");
  };

  const removeFromQuickReturn = (orderId: Id<"shopifyOrders">) => {
    setQuickReturnOrders(quickReturnOrders.filter((order) => order._id !== orderId));
  };

  const handleExportExcel = () => {
    if (!dailyHistory) return;

    const csvContent = exportDailyHistoryCsv(dailyHistory);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `retururi_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Export descarcat");
  };

  const displayedSearchResults = useMemo(() => {
    if (isSearchingOrder) return undefined;
    return searchResults;
  }, [searchResults, isSearchingOrder]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">Returns Management</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Search orders by AWB and manage returns
          </p>
        </div>
        <Button variant="outline" className="gap-2">
          <Eye className="h-4 w-4" />
          Rezumat Zilnic
        </Button>
      </div>

      {stats && <ReturnsStatsCards stats={stats} />}

      <ReturnsSearchSection
        orderNumberSearch={orderNumberSearch}
        onOrderNumberSearchChange={setOrderNumberSearch}
        isSearchingOrder={isSearchingOrder}
        onSearch={handleSearch}
        awbSearch={awbSearch}
        onAwbSearchChange={setAwbSearch}
        awbList={awbList}
        onAddAwb={handleAddAwb}
        onRemoveAwb={(index) => setAwbList(awbList.filter((_, i) => i !== index))}
        awbSearchResults={awbSearchResults}
        onCreateReturn={handleCreateReturn}
      />

      <QuickStockReturnCard
        quickReturnSearch={quickReturnSearch}
        onQuickReturnSearchChange={setQuickReturnSearch}
        quickSearchResults={quickSearchResults}
        quickReturnOrders={quickReturnOrders}
        onAddToQuickReturn={addToQuickReturn}
        onRemoveFromQuickReturn={removeFromQuickReturn}
        onRunQuickStockReturn={handleQuickStockReturn}
      />

      <SavedReturnsCard
        showSavedReturns={showSavedReturns}
        onToggleShowSavedReturns={() => setShowSavedReturns(!showSavedReturns)}
      />

      <DailyHistoryCard
        stats={stats}
        dailyHistory={dailyHistory}
        expandedDate={expandedDate}
        onExpandedDateChange={setExpandedDate}
        onExportExcel={handleExportExcel}
      />

      {displayedSearchResults && (
        <SearchResultsTable results={displayedSearchResults} onCreateReturn={handleCreateReturn} />
      )}
    </div>
  );
}
