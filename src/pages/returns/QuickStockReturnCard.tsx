import { Plus, RotateCcw } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import type { SearchResult } from "./types";

interface QuickStockReturnCardProps {
  quickReturnSearch: string;
  onQuickReturnSearchChange: (value: string) => void;
  quickSearchResults?: SearchResult[];
  quickReturnOrders: SearchResult[];
  onAddToQuickReturn: (order: SearchResult) => void;
  onRemoveFromQuickReturn: (orderId: SearchResult["_id"]) => void;
  onRunQuickStockReturn: () => void;
}

export function QuickStockReturnCard({
  quickReturnSearch,
  onQuickReturnSearchChange,
  quickSearchResults,
  quickReturnOrders,
  onAddToQuickReturn,
  onRemoveFromQuickReturn,
  onRunQuickStockReturn,
}: QuickStockReturnCardProps) {
  return (
    <Card className="p-5">
      <h3 className="font-semibold flex items-center gap-2 mb-1">
        <RotateCcw className="h-4 w-4 text-muted-foreground" />
        Quick Stock Return (Multiple Orders)
      </h3>
      <p className="text-xs text-muted-foreground mb-3">
        Search multiple order numbers and add returned items directly to stock - no invoice storno
      </p>
      <div className="flex gap-2">
        <Input
          placeholder="Enter order number (e.g. 12345)"
          value={quickReturnSearch}
          onChange={(e) => onQuickReturnSearchChange(e.target.value)}
          className="flex-1"
        />
        <Button onClick={onRunQuickStockReturn} disabled={quickReturnOrders.length === 0}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add
        </Button>
      </div>

      {quickSearchResults && quickSearchResults.length > 0 && (
        <div className="mt-2 border rounded-lg divide-y max-h-40 overflow-y-auto">
          {quickSearchResults.map((order) => (
            <button
              key={order._id}
              onClick={() => onAddToQuickReturn(order)}
              className="w-full px-3 py-2 text-left hover:bg-muted/50 flex items-center justify-between text-sm"
            >
              <span>
                <span className="font-medium">#{order.orderNumber}</span>
                <span className="text-muted-foreground ml-2">{order.customerName}</span>
              </span>
              <span className="text-muted-foreground">{order.items?.length || 0} items</span>
            </button>
          ))}
        </div>
      )}

      {quickReturnOrders.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Comenzi selectate ({quickReturnOrders.length}):
          </p>
          <div className="flex flex-wrap gap-2">
            {quickReturnOrders.map((order) => (
              <span
                key={order._id}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary/10 text-primary rounded text-sm"
              >
                #{order.orderNumber}
                <button
                  onClick={() => onRemoveFromQuickReturn(order._id)}
                  className="ml-1 hover:text-destructive"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <Button onClick={onRunQuickStockReturn} className="mt-2">
            <Plus className="h-4 w-4 mr-2" />
            Adauga{" "}
            {quickReturnOrders.reduce((sum, order) => sum + (order.items?.length || 0), 0)} unitati
            in stock
          </Button>
        </div>
      )}
    </Card>
  );
}
