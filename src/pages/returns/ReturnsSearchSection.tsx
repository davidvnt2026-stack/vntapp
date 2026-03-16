import { Hash, Loader2, Plus, RefreshCw, Search, Truck } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import type { SearchResult } from "./types";

interface ReturnsSearchSectionProps {
  orderNumberSearch: string;
  onOrderNumberSearchChange: (value: string) => void;
  isSearchingOrder: boolean;
  onSearch: () => void;
  awbSearch: string;
  onAwbSearchChange: (value: string) => void;
  awbList: string[];
  onAddAwb: () => void;
  onRemoveAwb: (index: number) => void;
  awbSearchResults?: SearchResult[];
  onCreateReturn: (order: SearchResult) => void;
}

export function ReturnsSearchSection({
  orderNumberSearch,
  onOrderNumberSearchChange,
  isSearchingOrder,
  onSearch,
  awbSearch,
  onAwbSearchChange,
  awbList,
  onAddAwb,
  onRemoveAwb,
  awbSearchResults,
  onCreateReturn,
}: ReturnsSearchSectionProps) {
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card className="p-5">
        <h3 className="font-semibold flex items-center gap-2 mb-3">
          <Hash className="h-4 w-4 text-muted-foreground" />
          Search by Order Number
        </h3>
        <div className="flex gap-2">
          <Input
            placeholder="Enter order number (e.g. 12345 or #12345)"
            value={orderNumberSearch}
            onChange={(e) => onOrderNumberSearchChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSearch()}
            className="flex-1"
          />
          <Button onClick={onSearch} disabled={isSearchingOrder}>
            {isSearchingOrder ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Search className="h-4 w-4 mr-1.5" />
                Search
              </>
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Quick search by order number - results are added to the list below
        </p>
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2">
            <Truck className="h-4 w-4 text-muted-foreground" />
            Search by AWB
          </h3>
          <Button variant="outline" size="sm" className="text-xs gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Load Historical
          </Button>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Scan or enter AWB/tracking number..."
            value={awbSearch}
            onChange={(e) => onAwbSearchChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onAddAwb()}
            className="flex-1"
          />
          <Button onClick={onAddAwb}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Add multiple AWBs, then search all at once
        </p>

        {awbList.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {awbList.map((awb, i) => (
              <span
                key={`${awb}-${i}`}
                className="inline-flex items-center gap-1 px-2 py-1 bg-muted rounded text-sm font-mono"
              >
                {awb}
                <button
                  onClick={() => onRemoveAwb(i)}
                  className="text-muted-foreground hover:text-destructive ml-1"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {awbSearchResults && awbSearchResults.length > 0 && (
          <div className="mt-3 p-3 bg-muted/50 rounded-lg">
            <p className="text-xs font-medium mb-2">Rezultate:</p>
            {awbSearchResults.slice(0, 3).map((order) => (
              <div key={order._id} className="flex items-center justify-between py-1.5 text-sm">
                <span className="font-mono">{order.trackingNumber || order.orderNumber}</span>
                <Button size="sm" variant="ghost" onClick={() => onCreateReturn(order)}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
