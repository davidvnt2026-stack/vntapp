import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { ClipboardList } from "lucide-react";
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type ChartDataPoint = {
  displayDate: string;
  orders: number;
};

interface PickingListStatsCardProps {
  totalOrders: number;
  totalPickingLists: number;
  chartData?: ChartDataPoint[];
}

export function PickingListStatsCard({
  totalOrders,
  totalPickingLists,
  chartData,
}: PickingListStatsCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Picking List Orders
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Daily orders from picking lists only
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2 mb-6">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Total Orders</p>
            <p className="text-3xl font-bold text-blue-600">{totalOrders}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Picking Lists</p>
            <p className="text-3xl font-bold text-blue-600">{totalPickingLists}</p>
          </div>
        </div>
        {chartData && chartData.length > 0 ? (
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="displayDate"
                  tick={{ fontSize: 12 }}
                  stroke="#9ca3af"
                />
                <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
                <Tooltip />
                <Bar
                  dataKey="orders"
                  fill="#3B82F6"
                  name="Orders"
                  radius={[4, 4, 0, 0]}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            No picking list data available
          </div>
        )}
      </CardContent>
    </Card>
  );
}
