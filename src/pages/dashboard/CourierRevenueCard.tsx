import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { Banknote, Truck } from "lucide-react";

type CourierDayItem = {
  address: string;
  notes?: string;
  totalCodAmount: number;
  currency?: string;
  createdAt: number | string;
};

type CourierDay = {
  date: string;
  items: CourierDayItem[];
  totalsByCurrency?: Record<string, number>;
};

interface CourierRevenueCardProps {
  grandTotal: number;
  grandTotalsByCurrency?: Record<string, number>;
  history: CourierDay[];
}

const formatMoney = (value: number, currency: string = "RON") =>
  new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency,
  }).format(value);

export function CourierRevenueCard({ grandTotal, grandTotalsByCurrency, history }: CourierRevenueCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-green-600" />
              Recent COD Revenue
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Cash on delivery from courier shipments
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-6 p-4 rounded-lg bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200">
          <p className="text-sm font-medium text-green-700">Total Revenue COD Summary</p>
          <p className="text-3xl font-bold text-green-800">
            {formatMoney(grandTotal, "RON")}
          </p>
          {!!grandTotalsByCurrency && (
            <div className="text-xs text-green-700 mt-1 space-y-0.5">
              {Object.entries(grandTotalsByCurrency).map(([currency, amount]) => (
                <div key={currency}>
                  {currency}: {formatMoney(amount as number, currency)}
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-green-600 mt-1">Most recent uploads</p>
        </div>
        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Revenue by Date
          </p>
          {history.slice(0, 10).map((day) => {
            const daysAgo = Math.floor(
              (Date.now() - new Date(day.date).getTime()) / (1000 * 60 * 60 * 24)
            );
            const daysAgoText =
              daysAgo === 0
                ? "Today"
                : daysAgo === 1
                ? "Yesterday"
                : `${daysAgo} days ago`;

            return (
              <div key={day.date}>
                <p className="text-xs text-muted-foreground mb-2">{daysAgoText}</p>
                {day.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors mb-2"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-green-100">
                        <Truck className="h-4 w-4 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{item.address}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.notes || "Orders processed"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Imported: {new Date(item.createdAt).toLocaleDateString("ro-RO")}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-green-600">
                        {formatMoney(item.totalCodAmount, item.currency || "RON")}
                      </p>
                      <p className="text-xs text-muted-foreground">COD</p>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
