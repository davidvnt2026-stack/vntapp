import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { Award } from "lucide-react";
import { formatCurrency } from "../../lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { TOP_PRODUCTS_COLORS } from "./types";

type ProductData = {
  sku: string;
  name?: string;
  quantity: number;
  revenue?: number;
};

interface TopProductsChartProps {
  products: ProductData[];
  currency?: string;
}

export function TopProductsChart({ products, currency = "RON" }: TopProductsChartProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5 text-green-600" />
              Top 10 Products
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Best selling by quantity
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {products && products.length > 0 ? (
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={products}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <YAxis
                  type="category"
                  dataKey="sku"
                  tick={{ fontSize: 10 }}
                  stroke="#9ca3af"
                  width={80}
                />
                <Tooltip
                  formatter={(value, name) => [
                    name === "quantity"
                      ? `${value} units`
                      : formatCurrency(Number(value) || 0, currency),
                    name === "quantity" ? "Quantity" : "Revenue",
                  ]}
                  labelFormatter={(label) => {
                    const product = products.find((p) => p.sku === label);
                    return product?.name || label;
                  }}
                />
                <Bar dataKey="quantity" name="quantity" radius={[0, 4, 4, 0]}>
                  {products.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={TOP_PRODUCTS_COLORS[index] || TOP_PRODUCTS_COLORS[9]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[350px] flex items-center justify-center text-muted-foreground">
            No product data available
          </div>
        )}
      </CardContent>
    </Card>
  );
}
