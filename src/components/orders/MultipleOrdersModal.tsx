import { Button } from "../ui/Button";
import { Card, CardContent } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { X } from "lucide-react";
import { formatCurrency, formatDate } from "../../lib/utils";
import { Order, OrderItem } from "./types";

// Helper for Sameday delivery status colors
const getDeliveryStatusColor = (status?: string) => {
  if (!status) return "bg-gray-100 text-gray-700";
  const s = status.toLowerCase();
  if (s.includes("livrat cu succes") || s.includes("delivered")) return "bg-green-100 text-green-700";
  if (s.includes("tranzit") || s.includes("transit") || s.includes("curier") || s.includes("depozit")) return "bg-blue-100 text-blue-700";
  if (s.includes("livrare") || s.includes("curs")) return "bg-indigo-100 text-indigo-700";
  if (s.includes("retur") || s.includes("return") || s.includes("refuzat")) return "bg-red-100 text-red-700";
  if (s.includes("anulat") || s.includes("cancel")) return "bg-red-100 text-red-700";
  if (s.includes("ridicat") || s.includes("preluat")) return "bg-cyan-100 text-cyan-700";
  return "bg-yellow-100 text-yellow-700";
};

interface MultipleOrdersModalProps {
  isOpen: boolean;
  phone: string;
  orders: Order[];
  onClose: () => void;
}

export function MultipleOrdersModal({
  isOpen,
  phone,
  orders,
  onClose,
}: MultipleOrdersModalProps) {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <Card 
        className="w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <CardContent className="pt-6 pb-6 flex flex-col h-full overflow-hidden">
          <div className="flex items-center justify-between mb-4 flex-shrink-0">
            <h3 className="text-lg font-semibold">
              Comenzi pentru {phone}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({orders.length} comenzi)
              </span>
            </h3>
            <Button size="sm" variant="ghost" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>
          
          <div 
            className="flex-1 min-h-0 overflow-y-auto space-y-3 overscroll-contain pr-2"
            style={{ maxHeight: 'calc(80vh - 100px)' }}
          >
            {orders.map((order) => (
              <div key={order._id} className="p-4 border rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono font-bold text-lg">#{order.orderNumber}</span>
                  {order.deliveryStatus ? (
                    <Badge className={getDeliveryStatusColor(order.deliveryStatus)}>
                      {order.deliveryStatus}
                    </Badge>
                  ) : order.trackingNumber ? (
                    <Badge variant="outline" className="text-gray-500">Așteaptă sync</Badge>
                  ) : (
                    <Badge variant="outline" className="text-gray-400">Fără AWB</Badge>
                  )}
                </div>
                <div className="text-sm text-muted-foreground">
                  <div>{order.customerName}</div>
                  <div>{order.placedOn ? formatDate(order.placedOn) : order.createdAt ? formatDate(new Date(order.createdAt)) : "-"}</div>
                  <div className="font-medium text-foreground">{formatCurrency(order.totalPrice, order.currency || "RON")}</div>
                </div>
                <div className="mt-2 text-sm">
                  {order.items?.slice(0, 2).map((item: OrderItem, idx: number) => (
                    <div key={idx} className="truncate">{item.name}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
