import { useEffect, useRef, useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "../../contexts/AuthContext";
import { useStore } from "../../contexts/StoreContext";
import { Button } from "../../components/ui/Button";
import { StatsCards } from "./StatsCards";
import { DailySalesChart } from "./DailySalesChart";
import { TopProductsChart } from "./TopProductsChart";
import { ReturnsBySkuChart } from "./ReturnsBySkuChart";
import { ReturnsAnalysisCard } from "./ReturnsAnalysisCard";
import { PickingListStatsCard } from "./PickingListStatsCard";
import { CourierRevenueCard } from "./CourierRevenueCard";
import { QuickActionsCard } from "./QuickActionsCard";
import { DashboardLoadingSkeleton } from "./DashboardLoadingSkeleton";
import type { Period } from "./types";

export function DashboardPage() {
  const { token } = useAuth();
  const { selectedShopDomain } = useStore();
  const [period, setPeriod] = useState<Period>("7d");
  const [dashboardData, setDashboardData] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const snapshotPeriod: "today" | "7d" | "30d" | "all" =
    period === "today" || period === "7d" || period === "30d" || period === "all"
      ? period
      : "30d";
  const periodLabel =
    period === "today"
      ? "today"
      : period === "7d"
      ? "last 7 days"
      : period === "30d"
      ? "last 30 days"
      : "all time";

  const getDashboardSnapshot = useAction(api.dashboard.getSnapshotData);
  const getDashboardSnapshotRef = useRef(getDashboardSnapshot);
  useEffect(() => {
    getDashboardSnapshotRef.current = getDashboardSnapshot;
  }, [getDashboardSnapshot]);

  const refreshDashboard = async (forceRefresh = false) => {
    if (!token) return;
    setIsLoading(true);
    try {
      const data = await getDashboardSnapshotRef.current({
        token,
        period: snapshotPeriod,
        shopDomain: selectedShopDomain ?? undefined,
        forceRefresh,
      });
      setDashboardData(data);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refreshDashboard();
  }, [token, snapshotPeriod, selectedShopDomain]);

  const stats = dashboardData?.stats;
  const salesChartData = dashboardData?.salesChartData;
  const pickingListStats = dashboardData?.pickingListStats;
  const topSellingProducts = dashboardData?.topSellingProducts;
  const topReturnedProducts = dashboardData?.topReturnedProducts;
  const courierRevenue = dashboardData?.courierRevenue;
  const returnsAnalysis = dashboardData?.returnsAnalysis;

  if (!stats || isLoading) {
    return <DashboardLoadingSkeleton />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void refreshDashboard(true)}>
            Refresh
          </Button>
          <span className="text-sm text-muted-foreground">Period:</span>
          {(["today", "7d", "30d", "all"] as Period[]).map((p) => (
            <Button
              key={p}
              variant={period === p ? "default" : "outline"}
              size="sm"
              onClick={() => setPeriod(p)}
            >
              {p === "today"
                ? "Today"
                : p === "7d"
                ? "7 Days"
                : p === "30d"
                ? "30 Days"
                : "All Time"}
            </Button>
          ))}
        </div>
      </div>

      <StatsCards stats={stats} />

      <DailySalesChart
        chartData={salesChartData?.chartData ?? []}
        totals={salesChartData?.totals}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <TopProductsChart
          products={topSellingProducts?.products ?? []}
          currency={stats?.thisMonth?.currency || "RON"}
        />
        <ReturnsBySkuChart
          products={topReturnedProducts?.products ?? []}
          totalReturns={topReturnedProducts?.totalReturns ?? 0}
        />
      </div>

      <ReturnsAnalysisCard
        chartData={returnsAnalysis?.chartData ?? []}
        totals={returnsAnalysis?.totals}
        periodLabel={periodLabel}
      />

      <PickingListStatsCard
        totalOrders={pickingListStats?.totalOrders ?? 0}
        totalPickingLists={pickingListStats?.totalPickingLists ?? 0}
        chartData={pickingListStats?.chartData}
      />

      {courierRevenue && courierRevenue.history.length > 0 && (
        <CourierRevenueCard
          grandTotal={courierRevenue.grandTotal}
          grandTotalsByCurrency={courierRevenue.grandTotalsByCurrency}
          history={courierRevenue.history}
        />
      )}

      <QuickActionsCard />
    </div>
  );
}
