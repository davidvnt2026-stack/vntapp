import { Calculator } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card, CardContent } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import type { InvoicePeriod } from "./types";

interface PeriodSelectorCardProps {
  period: InvoicePeriod;
  currentMonthLabel: string;
  previousMonthLabel: string;
  currentFirstHalf: InvoicePeriod;
  currentSecondHalf: InvoicePeriod;
  previousFirstHalf: InvoicePeriod;
  previousSecondHalf: InvoicePeriod;
  onPeriodChange: (period: InvoicePeriod) => void;
}

export function PeriodSelectorCard({
  period,
  currentMonthLabel,
  previousMonthLabel,
  currentFirstHalf,
  currentSecondHalf,
  previousFirstHalf,
  previousSecondHalf,
  onPeriodChange,
}: PeriodSelectorCardProps) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-emerald-600" />
            <span className="font-medium">Perioada Rapida</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Button size="sm" variant="outline" onClick={() => onPeriodChange(currentFirstHalf)}>
              {currentMonthLabel} 01-15
            </Button>
            <Button size="sm" variant="outline" onClick={() => onPeriodChange(currentSecondHalf)}>
              {currentMonthLabel} 16-31
            </Button>
            <Button size="sm" variant="outline" onClick={() => onPeriodChange(previousFirstHalf)}>
              {previousMonthLabel} 01-15
            </Button>
            <Button size="sm" variant="outline" onClick={() => onPeriodChange(previousSecondHalf)}>
              {previousMonthLabel} 16-31
            </Button>
          </div>

          <div className="pt-2 border-t">
            <p className="text-sm font-medium mb-2">Perioada custom</p>
            <div className="flex flex-col md:flex-row md:items-center gap-2">
              <Input
                type="date"
                value={period.startDate}
                onChange={(e) =>
                  onPeriodChange({
                    ...period,
                    startDate: e.target.value,
                  })
                }
                className="w-full md:w-44"
              />
              <span className="text-muted-foreground text-sm">pana la</span>
              <Input
                type="date"
                value={period.endDate}
                onChange={(e) =>
                  onPeriodChange({
                    ...period,
                    endDate: e.target.value,
                  })
                }
                className="w-full md:w-44"
              />
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            Perioada selectata: <strong>{period.startDate}</strong> {"->"}{" "}
            <strong>{period.endDate}</strong>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
