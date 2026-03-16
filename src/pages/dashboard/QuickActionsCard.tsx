import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { ShoppingCart, BarChart3, Package, RefreshCw } from "lucide-react";

export function QuickActionsCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <a
            href="/orders"
            className="flex items-center gap-3 rounded-lg border border-border p-4 hover:bg-accent transition-colors"
          >
            <ShoppingCart className="h-5 w-5 text-primary" />
            <span className="font-medium">View Orders</span>
          </a>
          <a
            href="/stock-orders"
            className="flex items-center gap-3 rounded-lg border border-border p-4 hover:bg-accent transition-colors"
          >
            <BarChart3 className="h-5 w-5 text-primary" />
            <span className="font-medium">Stock & Orders</span>
          </a>
          <a
            href="/items"
            className="flex items-center gap-3 rounded-lg border border-border p-4 hover:bg-accent transition-colors"
          >
            <Package className="h-5 w-5 text-primary" />
            <span className="font-medium">Manage SKUs</span>
          </a>
          <a
            href="/inbound"
            className="flex items-center gap-3 rounded-lg border border-border p-4 hover:bg-accent transition-colors"
          >
            <RefreshCw className="h-5 w-5 text-primary" />
            <span className="font-medium">Inbound Stock</span>
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
