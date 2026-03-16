import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { TrendingUp, ShoppingCart } from "lucide-react";
import { formatCurrency } from "../../lib/utils";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { CHART_COLORS } from "./types";

type ChartDataPoint = {
  displayDate: string;
  orders: number;
  revenue: number;
};

interface DailySalesChartProps {
  chartData: ChartDataPoint[];
  totals?: { totalRevenue: number; totalOrders: number; currency?: string };
}

export function DailySalesChart({ chartData, totals }: DailySalesChartProps) {
  const currency = totals?.currency || "RON";
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Daily Sales Overview
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Track your daily orders and revenue
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2 mb-6">
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
              <TrendingUp className="h-4 w-4" />
              Total Sales
            </div>
            <p className="text-2xl font-bold text-green-800 dark:text-green-300 mt-1">
              {formatCurrency(totals?.totalRevenue ?? 0, currency)}
            </p>
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-400">
              <ShoppingCart className="h-4 w-4" />
              Total Orders
            </div>
            <p className="text-2xl font-bold text-blue-800 dark:text-blue-300 mt-1">
              {totals?.totalOrders ?? 0}
            </p>
          </div>
        </div>
        {chartData && chartData.length > 0 ? (
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="displayDate"
                  tick={{ fontSize: 12 }}
                  stroke="#9ca3af"
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 12 }}
                  stroke="#9ca3af"
                  label={{
                    value: "Orders",
                    angle: -90,
                    position: "insideLeft",
                    style: { fontSize: 12, fill: "#9ca3af" },
                  }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 12 }}
                  stroke="#9ca3af"
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                  label={{
                    value: "Revenue (RON)",
                    angle: 90,
                    position: "insideRight",
                    style: { fontSize: 12, fill: "#9ca3af" },
                  }}
                />
                <Tooltip
                  formatter={(value, name) => [
                    name === "Revenue" && typeof value === "number"
                      ? formatCurrency(value, currency)
                      : value,
                    name,
                  ]}
                />
                <Legend />
                <Bar
                  yAxisId="left"
                  dataKey="orders"
                  fill={CHART_COLORS.orders}
                  name="Orders"
                  radius={[4, 4, 0, 0]}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="revenue"
                  stroke={CHART_COLORS.revenue}
                  strokeWidth={2}
                  dot={{ fill: CHART_COLORS.revenue, strokeWidth: 2 }}
                  name="Revenue"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            No data available for the selected period
          </div>
        )}
      </CardContent>
    </Card>
  );
}
