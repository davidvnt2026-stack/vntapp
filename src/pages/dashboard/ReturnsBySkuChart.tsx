import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { RotateCcw } from "lucide-react";
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
import { RETURNS_COLORS } from "./types";

type ProductData = {
  sku: string;
  name?: string;
  quantity: number;
};

interface ReturnsBySkuChartProps {
  products: ProductData[];
  totalReturns: number;
}

export function ReturnsBySkuChart({ products, totalReturns }: ReturnsBySkuChartProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-red-600" />
              Returns by SKU
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Most returned products
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-red-600">{totalReturns}</p>
            <p className="text-xs text-muted-foreground">Total Returns</p>
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
                  formatter={(value) => [`${value} units`, "Returned"]}
                  labelFormatter={(label) => {
                    const product = products.find((p) => p.sku === label);
                    return product?.name || label;
                  }}
                />
                <Bar dataKey="quantity" name="Returns" radius={[0, 4, 4, 0]}>
                  {products.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={RETURNS_COLORS[index] || RETURNS_COLORS[9]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[350px] flex items-center justify-center text-muted-foreground">
            No return data available
          </div>
        )}
      </CardContent>
    </Card>
  );
}
