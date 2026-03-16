import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "../../contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import {
  Package,
  TrendingUp,
  ShoppingCart,
  RotateCcw,
  AlertTriangle,
  Download,
  RefreshCw,
  Plus,
  Percent,
  BarChart3,
  Calendar,
  Banknote,
} from "lucide-react";
import { formatCurrency } from "../../lib/utils";
import { format, getDaysInMonth } from "date-fns";
import { Id } from "../../../convex/_generated/dataModel";

// Status colors for the chart
const STATUS_COLORS: Record<string, string> = {
  delivered: "#22c55e",
  in_transit: "#3b82f6",
  pending: "#f59e0b",
  cancelled: "#ef4444",
  returned: "#8b5cf6",
  ready: "#06b6d4",
  on_hold: "#64748b",
  unknown: "#94a3b8",
};

export function StockOrdersPage() {
  const { token } = useAuth();
  
  // State
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [reportMonth, setReportMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [selectedSku, setSelectedSku] = useState<string>("");
  const [editingCell, setEditingCell] = useState<{
    recordId: Id<"dailyStockRecords">;
    field: string;
    value: string;
  } | null>(null);

  // Status distribution date range state
  const [statusDateRange, setStatusDateRange] = useState(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      from: firstDay.toISOString().split("T")[0],
      to: lastDay.toISOString().split("T")[0],
    };
  });
  const [tempDateRange, setTempDateRange] = useState(statusDateRange);
  const [skuMetrics, setSkuMetrics] = useState<any[] | undefined>(undefined);
  const [statusDistribution, setStatusDistribution] = useState<any | undefined>(undefined);

  // Queries
  const skus = useQuery(api.skus.list, token ? { token } : "skip");
  const monthData = useQuery(
    api.dailyStock.getByMonthAndSku,
    token && selectedSku ? { token, month: selectedMonth, sku: selectedSku } : "skip"
  );
  const monthSummary = useQuery(
    api.dailyStock.getMonthSummary,
    token && selectedSku ? { token, month: selectedMonth, sku: selectedSku } : "skip"
  );

  const reportMonthAllData = useQuery(
    api.dailyStock.getByMonthAll,
    token ? { token, month: reportMonth } : "skip"
  );

  const getSkuMetricsSnapshot = useAction(api.analyticsSnapshots.getSkuMetricsSnapshot);
  const getStatusDistributionSnapshot = useAction(api.analyticsSnapshots.getStatusDistributionSnapshot);
  const getSkuMetricsSnapshotRef = useRef(getSkuMetricsSnapshot);
  const getStatusDistributionSnapshotRef = useRef(getStatusDistributionSnapshot);
  useEffect(() => {
    getSkuMetricsSnapshotRef.current = getSkuMetricsSnapshot;
  }, [getSkuMetricsSnapshot]);
  useEffect(() => {
    getStatusDistributionSnapshotRef.current = getStatusDistributionSnapshot;
  }, [getStatusDistributionSnapshot]);

  // Mutations
  const initializeMonth = useMutation(api.dailyStock.initializeMonth);
  const updateField = useMutation(api.dailyStock.updateField);

  // Set default SKU when loaded
  useEffect(() => {
    if (skus && skus.length > 0 && !selectedSku) {
      setSelectedSku(skus[0].sku);
    }
  }, [skus, selectedSku]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      const metrics = await getSkuMetricsSnapshotRef.current({
        token,
        period: selectedMonth,
      });
      if (!cancelled) {
        setSkuMetrics(metrics as any[]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, selectedMonth]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      const distribution = await getStatusDistributionSnapshotRef.current({
        token,
        startDate: statusDateRange.from,
        endDate: statusDateRange.to,
      });
      if (!cancelled) {
        setStatusDistribution(distribution);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, statusDateRange.from, statusDateRange.to]);

  // Generate month options (last 12 months)
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const label = format(date, "MMMM yyyy");
    return { value, label };
  });

  // Generate days for the month
  const [year, monthNum] = selectedMonth.split("-").map(Number);
  const daysInMonth = getDaysInMonth(new Date(year, monthNum - 1));
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Handle cell edit
  const handleCellClick = (
    recordId: Id<"dailyStockRecords">,
    field: string,
    currentValue: number | string
  ) => {
    setEditingCell({
      recordId,
      field,
      value: String(currentValue),
    });
  };

  const handleCellChange = (value: string) => {
    if (editingCell) {
      setEditingCell({ ...editingCell, value });
    }
  };

  const handleCellBlur = async () => {
    if (!editingCell || !token) return;

    const numericFields = ["outboundUnits", "returnUnits", "orders", "orderReturns", "revenue", "stockBalance"];
    let value: number | string = editingCell.value;

    if (numericFields.includes(editingCell.field)) {
      value = parseFloat(editingCell.value) || 0;
    }

    try {
      await updateField({
        token,
        recordId: editingCell.recordId,
        field: editingCell.field,
        value,
      });
    } catch (error) {
      console.error("Failed to update field:", error);
    }

    setEditingCell(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleCellBlur();
    } else if (e.key === "Escape") {
      setEditingCell(null);
    }
  };

  // Initialize month data
  const handleInitializeMonth = async () => {
    if (!token || !selectedSku) return;
    try {
      await initializeMonth({ token, month: selectedMonth, sku: selectedSku });
    } catch (error) {
      console.error("Failed to initialize month:", error);
    }
  };

  // Apply status date range filter
  const handleApplyDateRange = () => {
    setStatusDateRange(tempDateRange);
  };

  // Reset status date range filter
  const handleResetDateRange = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const range = {
      from: firstDay.toISOString().split("T")[0],
      to: lastDay.toISOString().split("T")[0],
    };
    setTempDateRange(range);
    setStatusDateRange(range);
  };

  // Define record type
  type DailyStockRecord = NonNullable<typeof monthData>[number];

  // Create a map of day -> record for quick lookup
  const recordsByDay = new Map<number, DailyStockRecord>();
  if (monthData) {
    for (const record of monthData) {
      recordsByDay.set(record.dayOfMonth, record);
    }
  }

  // Calculate totals from SKU metrics
  const totalCODRevenue = skuMetrics?.reduce((sum, m) => sum + m.totalRevenue, 0) ?? 0;

  // Sort SKU metrics by total orders descending
  const sortedSkuMetrics = [...(skuMetrics ?? [])].sort((a, b) => b.totalOrders - a.totalOrders);

  // Get the selected SKU's real metrics from analytics (source of truth for orders)
  const selectedSkuMetrics = skuMetrics?.find((m) => m.sku === selectedSku);
  const realTotalOrders = selectedSkuMetrics?.totalOrders ?? 0;
  const realTotalUnits = selectedSkuMetrics?.totalUnits ?? 0;
  const realReturnUnits = selectedSkuMetrics?.returnUnits ?? (monthSummary?.returnUnits ?? 0);
  const realOrderReturns = selectedSkuMetrics?.orderReturns ?? (monthSummary?.orderReturns ?? 0);

  // Calculate return rates from real data
  const monthlyReturnRateUnits = realTotalUnits > 0
    ? (realReturnUnits / realTotalUnits) * 100
    : 0;
  const monthlyReturnRateOrders = realTotalOrders > 0
    ? (realOrderReturns / realTotalOrders) * 100
    : 0;

  // Render editable cell
  const renderEditableCell = (
    record: DailyStockRecord | undefined,
    field: keyof DailyStockRecord,
    className: string = ""
  ) => {
    if (!record) {
      return (
        <td className={`px-3 py-2 text-center text-muted-foreground ${className}`}>
          -
        </td>
      );
    }

    const isEditing =
      editingCell?.recordId === record._id && editingCell?.field === field;
    const value = record[field];

    if (isEditing) {
      return (
        <td className={`px-1 py-1 ${className}`}>
          <Input
            type={field === "notes" ? "text" : "number"}
            value={editingCell.value}
            onChange={(e) => handleCellChange(e.target.value)}
            onBlur={handleCellBlur}
            onKeyDown={handleKeyDown}
            className="h-8 text-center"
            autoFocus
          />
        </td>
      );
    }

    return (
      <td
        className={`px-3 py-2 text-center cursor-pointer hover:bg-accent transition-colors ${className}`}
        onClick={() => handleCellClick(record._id, field, value as number | string)}
      >
        {typeof value === "number" ? value.toLocaleString() : value || "-"}
      </td>
    );
  };

  const escapeCsv = (value: string | number | null | undefined) => {
    if (value === null || value === undefined) return "";
    const str = String(value);
    if (str.includes(",") || str.includes("\"") || str.includes("\n")) {
      return `"${str.replace(/"/g, "\"\"")}"`;
    }
    return str;
  };

  const handleDownloadFullReport = async () => {
    if (!token) return;
    const reportSkuMetrics = await getSkuMetricsSnapshotRef.current({
      token,
      period: reportMonth,
    });
    const reportMetricsSorted = [...((reportSkuMetrics as any[]) ?? [])].sort((a, b) => b.totalOrders - a.totalOrders);
    const reportTotalOrders = reportMetricsSorted.reduce((sum, m) => sum + m.totalOrders, 0);
    const reportTotalUnits = reportMetricsSorted.reduce((sum, m) => sum + m.totalUnits, 0);
    const reportReturnUnits = reportMetricsSorted.reduce((sum, m) => sum + m.returnUnits, 0);
    const reportOrderReturns = reportMetricsSorted.reduce((sum, m) => sum + m.orderReturns, 0);
    const reportReturnRateUnits = reportTotalUnits > 0 ? (reportReturnUnits / reportTotalUnits) * 100 : 0;
    const reportReturnRateOrders = reportTotalOrders > 0 ? (reportOrderReturns / reportTotalOrders) * 100 : 0;
    const reportTotalRevenue = reportMetricsSorted.reduce((sum, m) => sum + m.totalRevenue, 0);
    const reportTotalCODRevenue = (reportSkuMetrics as any[])?.reduce((sum, m) => sum + m.totalRevenue, 0) ?? 0;

    const csvLines: string[] = [];

    // Header/meta
    csvLines.push("Stock & Orders Full Report");
    csvLines.push(`Generated At,${escapeCsv(new Date().toISOString())}`);
    csvLines.push(`Month,${escapeCsv(reportMonth)}`);
    csvLines.push("");

    // Summary
    csvLines.push("Summary");
    csvLines.push("Metric,Value");
    csvLines.push(`Current Stock Balance,${escapeCsv(reportMetricsSorted.reduce((sum, m) => sum + m.currentStock, 0))}`);
    csvLines.push(`Total Revenue (RON),${escapeCsv(reportTotalRevenue.toFixed(2))}`);
    csvLines.push(`Total Orders,${escapeCsv(reportTotalOrders)}`);
    csvLines.push(`Return Units,${escapeCsv(reportReturnUnits)}`);
    csvLines.push(`Order Returns,${escapeCsv(reportOrderReturns)}`);
    csvLines.push(`Monthly Return Rate Units (%),${escapeCsv(reportReturnRateUnits.toFixed(2))}`);
    csvLines.push(`Monthly Return Rate Orders (%),${escapeCsv(reportReturnRateOrders.toFixed(2))}`);
    csvLines.push(`Total COD Revenue (RON),${escapeCsv(reportTotalCODRevenue.toFixed(2))}`);
    csvLines.push("");

    // SKU metrics
    csvLines.push("SKU Metrics");
    csvLines.push("SKU,Current Stock,Total Orders,Total Units,Return Units,Order Returns,Return Rate Orders (%)");
    for (const metric of reportMetricsSorted) {
      csvLines.push([
        escapeCsv(metric.sku),
        escapeCsv(metric.currentStock),
        escapeCsv(metric.totalOrders),
        escapeCsv(metric.totalUnits),
        escapeCsv(metric.returnUnits),
        escapeCsv(metric.orderReturns),
        escapeCsv(metric.returnRate.toFixed(2)),
      ].join(","));
    }
    csvLines.push("");

    // Status distribution (if loaded)
    if (statusDistribution) {
      csvLines.push("Status Distribution");
      csvLines.push(`Date From,${escapeCsv(statusDateRange.from)}`);
      csvLines.push(`Date To,${escapeCsv(statusDateRange.to)}`);
      csvLines.push("Status,Count,Percentage");
      for (const item of statusDistribution.distribution) {
        csvLines.push([
          escapeCsv(item.status),
          escapeCsv(item.count),
          escapeCsv(item.percentage),
        ].join(","));
      }
      csvLines.push(`Total Orders,${escapeCsv(statusDistribution.total)}`);
      csvLines.push("");
    }

    // Daily table for all SKUs
    csvLines.push("Daily Stock & Orders - All SKUs");
    csvLines.push("Day,SKU,Outbound Units,Return Units,Orders,Order Returns,Revenue (RON),Notes,Stock Balance");
    for (const record of reportMonthAllData ?? []) {
      csvLines.push([
        escapeCsv(record.dayOfMonth),
        escapeCsv(record.sku),
        escapeCsv(record?.outboundUnits ?? 0),
        escapeCsv(record?.returnUnits ?? 0),
        escapeCsv(record?.orders ?? 0),
        escapeCsv(record?.orderReturns ?? 0),
        escapeCsv(record?.revenue ?? 0),
        escapeCsv(record?.notes ?? ""),
        escapeCsv(record?.stockBalance ?? ""),
      ].join(","));
    }

    const csvContent = "\uFEFF" + csvLines.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const timestamp = format(new Date(), "yyyyMMdd_HHmm");
    link.href = url;
    link.download = `stock_orders_report_${reportMonth}_${timestamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Stock & Orders</h1>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Select Month:</label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {monthOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Select SKU:</label>
              <select
                value={selectedSku}
                onChange={(e) => setSelectedSku(e.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm min-w-[150px]"
              >
                {skus?.map((sku) => (
                  <option key={sku._id} value={sku.sku}>
                    {sku.sku}
                  </option>
                ))}
              </select>
            </div>

            <Button variant="outline" size="sm" onClick={handleInitializeMonth}>
              <Plus className="h-4 w-4 mr-1" />
              Add SKU
            </Button>

            <Button variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-1" />
              Refresh Data
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-8">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Package className="h-4 w-4 text-green-600" />
              Current Stock Balance
            </div>
            <p className="text-2xl font-bold mt-1">{monthSummary?.currentStock ?? 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingUp className="h-4 w-4 text-green-600" />
              Total Revenue (RON)
            </div>
            <p className="text-2xl font-bold mt-1 text-green-600">
              {formatCurrency(monthSummary?.totalRevenue ?? 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShoppingCart className="h-4 w-4 text-blue-600" />
              Total Orders
            </div>
            <p className="text-2xl font-bold mt-1 text-blue-600">
              {realTotalOrders}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RotateCcw className="h-4 w-4 text-orange-600" />
              Return Units
            </div>
            <p className="text-2xl font-bold mt-1 text-orange-600">
              {monthSummary?.returnUnits ?? 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              Orders Returns
            </div>
            <p className="text-2xl font-bold mt-1 text-red-600">
              {monthSummary?.orderReturns ?? 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Percent className="h-4 w-4 text-purple-600" />
              Monthly Return Rate Units
            </div>
            <p className="text-2xl font-bold mt-1">
              {monthlyReturnRateUnits.toFixed(2)}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Percent className="h-4 w-4 text-indigo-600" />
              Monthly Return Rate Orders
            </div>
            <p className="text-2xl font-bold mt-1">
              {monthlyReturnRateOrders.toFixed(2)}%
            </p>
          </CardContent>
        </Card>

        <Card className="bg-primary text-primary-foreground">
          <CardContent className="p-4 flex flex-col items-center justify-center h-full gap-2">
            <Download className="h-6 w-6" />
            <span className="text-sm font-medium text-center">Download Full Report</span>
            <select
              value={reportMonth}
              onChange={(e) => setReportMonth(e.target.value)}
              className="h-8 rounded-md border border-primary-foreground/30 bg-primary/20 px-2 text-xs text-primary-foreground"
            >
              {monthOptions.map((opt) => (
                <option key={opt.value} value={opt.value} className="text-black">
                  {opt.label}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="secondary"
              className="w-full"
              onClick={handleDownloadFullReport}
            >
              Download
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Total Metrics by SKU + Status Distribution */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Total Metrics by SKU */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-semibold">Total Metrics by SKU</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid grid-cols-3 divide-x">
              {/* Current Stock Column */}
              <div className="p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-3">
                  <Package className="h-4 w-4 text-green-600" />
                  Current Stock
                </div>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {sortedSkuMetrics.map((metric) => (
                    <div key={metric.sku} className="flex justify-between items-center text-sm">
                      <span className="font-medium text-muted-foreground">{metric.sku}</span>
                      <span className={`font-bold ${metric.currentStock < 0 ? "text-red-600" : "text-blue-600"}`}>
                        {metric.currentStock.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total Orders Column */}
              <div className="p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-3">
                  <ShoppingCart className="h-4 w-4 text-blue-600" />
                  Total Orders
                </div>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {sortedSkuMetrics.map((metric) => (
                    <div key={metric.sku} className="flex justify-between items-center text-sm">
                      <span className="font-medium text-muted-foreground">{metric.sku}</span>
                      <span className="font-bold text-blue-600">
                        {metric.totalOrders.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Order Returns Column */}
              <div className="p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-3">
                  <RotateCcw className="h-4 w-4 text-red-600" />
                  Order Returns
                </div>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {sortedSkuMetrics.map((metric) => (
                    <div key={metric.sku} className="flex justify-between items-center text-sm">
                      <span className="font-medium text-muted-foreground">{metric.sku}</span>
                      <span className="font-bold text-red-600">
                        {metric.orderReturns.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Status Distribution */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-600" />
              <CardTitle className="text-lg font-semibold">Status Distribution</CardTitle>
            </div>
            <p className="text-sm text-muted-foreground">Order status breakdown for selected period</p>
          </CardHeader>
          <CardContent>
            {/* Date Range Picker */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">From:</span>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="date"
                    value={tempDateRange.from}
                    onChange={(e) => setTempDateRange({ ...tempDateRange, from: e.target.value })}
                    className="h-9 pl-9 pr-3 rounded-md border border-input bg-background text-sm"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">To:</span>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="date"
                    value={tempDateRange.to}
                    onChange={(e) => setTempDateRange({ ...tempDateRange, to: e.target.value })}
                    className="h-9 pl-9 pr-3 rounded-md border border-input bg-background text-sm"
                  />
                </div>
              </div>
              <Button size="sm" onClick={handleApplyDateRange}>
                Apply
              </Button>
              <Button variant="outline" size="sm" onClick={handleResetDateRange}>
                Reset
              </Button>
            </div>

            {/* Status Chart */}
            {statusDistribution ? (
              <div className="space-y-3">
                {statusDistribution.distribution.map((item: any) => (
                  <div key={item.status} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="capitalize font-medium">{item.status.replace(/_/g, " ")}</span>
                      <span className="text-muted-foreground">
                        {item.count} ({item.percentage}%)
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${item.percentage}%`,
                          backgroundColor: STATUS_COLORS[item.status] || STATUS_COLORS.unknown,
                        }}
                      />
                    </div>
                  </div>
                ))}
                <div className="pt-3 border-t mt-4">
                  <div className="flex justify-between text-sm font-medium">
                    <span>Total Orders</span>
                    <span>{statusDistribution.total}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                <RefreshCw className="h-5 w-5 animate-spin mr-2" />
                Loading status data...
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Return Rates + Total COD Revenue */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Return Rate (Units) */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <TrendingUp className="h-4 w-4 text-red-500" />
              Return Rate (Units)
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2 max-h-[350px] overflow-y-auto">
              {sortedSkuMetrics.map((metric) => {
                const returnRate = metric.totalUnits > 0 
                  ? (metric.returnUnits / metric.totalUnits) * 100 
                  : 0;
                return (
                  <div key={metric.sku} className="flex justify-between items-center text-sm">
                    <span className="font-medium text-muted-foreground">{metric.sku}</span>
                    <span className={`font-bold ${returnRate > 10 ? "text-red-600" : "text-green-600"}`}>
                      {returnRate.toFixed(1)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Return Rate (Orders) */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <RotateCcw className="h-4 w-4 text-purple-500" />
              Return Rate (Orders)
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2 max-h-[350px] overflow-y-auto">
              {sortedSkuMetrics.map((metric) => (
                <div key={metric.sku} className="flex justify-between items-center text-sm">
                  <span className="font-medium text-muted-foreground">{metric.sku}</span>
                  <span className={`font-bold ${metric.returnRate > 10 ? "text-red-600" : "text-green-600"}`}>
                    {metric.returnRate.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Total COD Revenue */}
        <Card className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border-green-200 dark:border-green-800">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
              <Banknote className="h-4 w-4" />
              Total COD Revenue
            </div>
          </CardHeader>
          <CardContent className="flex items-center justify-center pt-4">
            <p className="text-4xl font-bold text-green-700 dark:text-green-400">
              {totalCODRevenue.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} RON
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Daily Stock Table */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Stock & Orders - {selectedSku}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="px-3 py-3 text-left font-medium">Date</th>
                  <th className="px-3 py-3 text-left font-medium">SKU</th>
                  <th className="px-3 py-3 text-center font-medium bg-blue-50 dark:bg-blue-900/20">
                    Outbound Units
                  </th>
                  <th className="px-3 py-3 text-center font-medium">Return Units</th>
                  <th className="px-3 py-3 text-center font-medium bg-green-50 dark:bg-green-900/20">
                    Orders
                  </th>
                  <th className="px-3 py-3 text-center font-medium">Orders Returns</th>
                  <th className="px-3 py-3 text-center font-medium">Revenue (RON)</th>
                  <th className="px-3 py-3 text-left font-medium">Notes</th>
                  <th className="px-3 py-3 text-center font-medium">Stock Balance</th>
                  <th className="px-3 py-3 text-center font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {days.map((dayNum) => {
                  const record = recordsByDay.get(dayNum);
                  return (
                    <tr key={dayNum} className="border-b hover:bg-muted/50">
                      <td className="px-3 py-2 font-medium">{dayNum}</td>
                      <td className="px-3 py-2 text-muted-foreground">{selectedSku}</td>
                      {renderEditableCell(record, "outboundUnits", "bg-blue-50/50 dark:bg-blue-900/10")}
                      {renderEditableCell(record, "returnUnits")}
                      {renderEditableCell(record, "orders", "bg-green-50/50 dark:bg-green-900/10")}
                      {renderEditableCell(record, "orderReturns")}
                      {renderEditableCell(record, "revenue")}
                      {renderEditableCell(record, "notes")}
                      {renderEditableCell(record, "stockBalance")}
                      <td className="px-3 py-2 text-center">
                        <Button variant="ghost" size="sm">
                          <Download className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
