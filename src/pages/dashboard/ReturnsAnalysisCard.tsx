import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { RotateCcw, Package, ShoppingCart, TrendingUp } from "lucide-react";
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
  returns: number;
  units?: number;
  returnRate?: number;
};

interface ReturnsAnalysisCardProps {
  chartData: ChartDataPoint[];
  totals?: {
    totalReturns: number;
    totalUnits: number;
    totalOrders: number;
    returnRate: number;
  };
  periodLabel: string;
}

export function ReturnsAnalysisCard({
  chartData,
  totals,
  periodLabel,
}: ReturnsAnalysisCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5" />
              Returns Analysis
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Track your returns over time ({periodLabel})
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-4 mb-6">
          <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 border border-red-200 dark:border-red-800">
            <div className="flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
              <RotateCcw className="h-4 w-4" />
              Total Returns
            </div>
            <p className="text-2xl font-bold text-red-800 dark:text-red-300 mt-1">
              {totals?.totalReturns ?? 0}
            </p>
          </div>
          <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
            <div className="flex items-center gap-2 text-sm text-orange-700 dark:text-orange-400">
              <Package className="h-4 w-4" />
              Returned Units
            </div>
            <p className="text-2xl font-bold text-orange-800 dark:text-orange-300 mt-1">
              {totals?.totalUnits ?? 0}
            </p>
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-400">
              <ShoppingCart className="h-4 w-4" />
              Orders (Period)
            </div>
            <p className="text-2xl font-bold text-blue-800 dark:text-blue-300 mt-1">
              {totals?.totalOrders ?? 0}
            </p>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
            <div className="flex items-center gap-2 text-sm text-purple-700 dark:text-purple-400">
              <TrendingUp className="h-4 w-4" />
              Return Rate
            </div>
            <p className="text-2xl font-bold text-purple-800 dark:text-purple-300 mt-1">
              {totals?.returnRate ?? 0}%
            </p>
          </div>
        </div>
        {chartData && chartData.length > 0 ? (
          <div className="h-[250px]">
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
                    value: "Returns",
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
                  tickFormatter={(v) => `${v}%`}
                  label={{
                    value: "Return Rate %",
                    angle: 90,
                    position: "insideRight",
                    style: { fontSize: 12, fill: "#9ca3af" },
                  }}
                />
                <Tooltip
                  formatter={(value, name) => [
                    name === "returnRate" ? `${value}%` : value,
                    name === "returns"
                      ? "Returns"
                      : name === "units"
                      ? "Units"
                      : "Return Rate",
                  ]}
                />
                <Legend />
                <Bar
                  yAxisId="left"
                  dataKey="returns"
                  fill={CHART_COLORS.returns}
                  name="Returns"
                  radius={[4, 4, 0, 0]}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="returnRate"
                  stroke="#8B5CF6"
                  strokeWidth={2}
                  dot={{ fill: "#8B5CF6", strokeWidth: 2 }}
                  name="Return Rate"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[250px] flex items-center justify-center text-muted-foreground">
            No return data available for the selected period
          </div>
        )}
      </CardContent>
    </Card>
  );
}
