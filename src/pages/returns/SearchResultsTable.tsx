import { FileText, Search } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import type { SearchResult } from "./types";

interface SearchResultsTableProps {
  results: SearchResult[];
  onCreateReturn: (order: SearchResult) => void;
}

export function SearchResultsTable({ results, onCreateReturn }: SearchResultsTableProps) {
  if (results.length === 0) {
    return null;
  }

  return (
    <Card className="p-5">
      <h3 className="font-semibold flex items-center gap-2 mb-4">
        <Search className="h-4 w-4 text-muted-foreground" />
        Search Results ({results.length} found)
      </h3>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left py-3 px-4 font-medium">AWB</th>
              <th className="text-left py-3 px-4 font-medium">Order #</th>
              <th className="text-left py-3 px-4 font-medium">Customer</th>
              <th className="text-left py-3 px-4 font-medium">Email</th>
              <th className="text-left py-3 px-4 font-medium">Total</th>
              <th className="text-left py-3 px-4 font-medium">Status</th>
              <th className="text-left py-3 px-4 font-medium">Items</th>
              <th className="text-right py-3 px-4 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {results.map((order) => (
              <tr key={order._id} className="border-b hover:bg-muted/20">
                <td className="py-3 px-4 font-mono text-xs">
                  {order.trackingNumber || <span className="text-muted-foreground">-</span>}
                </td>
                <td className="py-3 px-4 font-medium">#{order.orderNumber}</td>
                <td className="py-3 px-4">{order.customerName || "-"}</td>
                <td className="py-3 px-4 text-muted-foreground text-xs">
                  {order.customerEmail || "No email"}
                </td>
                <td className="py-3 px-4 font-medium">{order.totalPrice?.toFixed(2)} RON</td>
                <td className="py-3 px-4">
                  <div className="flex flex-col gap-1">
                    <Badge
                      variant={
                        order.status === "ready"
                          ? "success"
                          : order.status === "cancelled"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {order.status}
                    </Badge>
                    {order.fulfillmentStatus && (
                      <Badge variant="outline" className="text-xs">
                        {order.fulfillmentStatus}
                      </Badge>
                    )}
                  </div>
                </td>
                <td className="py-3 px-4">
                  <div className="space-y-1">
                    {order.items?.slice(0, 2).map((item, i) => (
                      <div key={i} className="text-xs">
                        <span className="font-medium">{item.name?.slice(0, 40)}...</span>
                        <br />
                        <span className="text-muted-foreground">
                          Qty: {item.quantity} x {item.price?.toFixed(2)} RON
                        </span>
                      </div>
                    ))}
                    {(order.items?.length || 0) > 2 && (
                      <span className="text-xs text-muted-foreground">
                        +{order.items.length - 2} more
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-3 px-4 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onCreateReturn(order)}
                    className="gap-1.5"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Create Return
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
