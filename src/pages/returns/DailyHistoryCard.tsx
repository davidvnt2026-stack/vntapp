import { Calendar, ChevronDown, ChevronUp, Download, Loader2, RefreshCw, RotateCcw } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { formatReturnsDate } from "./utils";
import type { DailyReturnGroup } from "./types";

interface DailyHistoryStats {
  todayUnitsReturned: number;
  yesterdayUnitsReturned: number;
  last10DaysUnits: number;
}

interface DailyHistoryCardProps {
  stats?: DailyHistoryStats;
  dailyHistory?: DailyReturnGroup[];
  expandedDate: string | null;
  onExpandedDateChange: (value: string | null) => void;
  onExportExcel: () => void;
}

export function DailyHistoryCard({
  stats,
  dailyHistory,
  expandedDate,
  onExpandedDateChange,
  onExportExcel,
}: DailyHistoryCardProps) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          Istoric Zilnic Retururi
        </h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="text-xs gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Actualizeaza
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-1.5"
            onClick={onExportExcel}
          >
            <Download className="h-3.5 w-3.5" />
            Export Excel
          </Button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center p-4 bg-muted/30 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Azi</p>
            <p className="text-3xl font-bold">{stats.todayUnitsReturned}</p>
            <p className="text-xs text-muted-foreground">unitati returnate</p>
          </div>
          <div className="text-center p-4 bg-muted/30 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Ieri</p>
            <p className="text-3xl font-bold">{stats.yesterdayUnitsReturned}</p>
            <p className="text-xs text-muted-foreground">unitati returnate</p>
          </div>
          <div className="text-center p-4 bg-primary/5 rounded-lg border border-primary/20">
            <p className="text-xs text-primary mb-1">Total</p>
            <p className="text-3xl font-bold text-primary">{stats.last10DaysUnits}</p>
            <p className="text-xs text-muted-foreground">unitati in 10 zile</p>
          </div>
        </div>
      )}

      {dailyHistory === undefined ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : dailyHistory.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <RotateCcw className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Niciun retur in ultimele 10 zile</p>
        </div>
      ) : (
        <div className="space-y-2">
          {dailyHistory.map((day) => (
            <div key={day.date} className="border rounded-lg overflow-hidden">
              <button
                onClick={() =>
                  onExpandedDateChange(expandedDate === day.date ? null : day.date)
                }
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{formatReturnsDate(day.date)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="default" className="bg-blue-100 text-blue-700 hover:bg-blue-100">
                    {day.totalUnits} unitati
                  </Badge>
                  <Badge variant="secondary">{day.totalOrders} comenzi</Badge>
                  <Badge variant="outline">{day.uniqueSkus} SKU-uri</Badge>
                  {expandedDate === day.date ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </button>

              {expandedDate === day.date && (
                <div className="border-t bg-muted/20 p-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-3 font-medium">AWB</th>
                          <th className="text-left py-2 px-3 font-medium">Comanda</th>
                          <th className="text-left py-2 px-3 font-medium">Client</th>
                          <th className="text-left py-2 px-3 font-medium">Articole</th>
                          <th className="text-left py-2 px-3 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {day.returns.map((ret) => (
                          <tr key={ret._id} className="border-b last:border-0">
                            <td className="py-2 px-3 font-mono text-xs">{ret.awbNumber}</td>
                            <td className="py-2 px-3">{ret.orderNumber ? `#${ret.orderNumber}` : "-"}</td>
                            <td className="py-2 px-3">{ret.customerName || "-"}</td>
                            <td className="py-2 px-3">{ret.returnedItems?.length || 0} articole</td>
                            <td className="py-2 px-3">
                              <Badge
                                variant={
                                  ret.returnStatus === "processed"
                                    ? "success"
                                    : ret.returnStatus === "cancelled"
                                    ? "destructive"
                                    : "warning"
                                }
                              >
                                {ret.returnStatus === "processed"
                                  ? "Procesat"
                                  : ret.returnStatus === "cancelled"
                                  ? "Anulat"
                                  : "In asteptare"}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
