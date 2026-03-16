import { Calendar, FileText, Package, ShoppingBag } from "lucide-react";
import { Card } from "../../components/ui/Card";

interface ReturnsStats {
  total: number;
  processed: number;
  totalUnitsReturned: number;
  today: number;
}

export function ReturnsStatsCards({ stats }: { stats: ReturnsStats }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card className="p-4 border-l-4 border-l-blue-500">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-lg bg-blue-50">
            <FileText className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total Returns</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </div>
        </div>
      </Card>

      <Card className="p-4 border-l-4 border-l-emerald-500">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-lg bg-emerald-50">
            <ShoppingBag className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Orders Returned</p>
            <p className="text-2xl font-bold">{stats.processed}</p>
          </div>
        </div>
      </Card>

      <Card className="p-4 border-l-4 border-l-amber-500">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-lg bg-amber-50">
            <Package className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Units Returned</p>
            <p className="text-2xl font-bold">{stats.totalUnitsReturned}</p>
          </div>
        </div>
      </Card>

      <Card className="p-4 border-l-4 border-l-purple-500">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-lg bg-purple-50">
            <Calendar className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Today's Returns</p>
            <p className="text-2xl font-bold">{stats.today}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
