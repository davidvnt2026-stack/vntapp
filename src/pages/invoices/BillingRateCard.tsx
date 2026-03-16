import { AlertCircle, DollarSign, Save } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";

interface BillingRateData {
  pricePerOrder: number;
  notes?: string;
}

interface BillingRateCardProps {
  billingRate: BillingRateData | null | undefined;
  rateInput: string;
  rateNotes: string;
  savingRate: boolean;
  onRateInputChange: (value: string) => void;
  onRateNotesChange: (value: string) => void;
  onSave: () => void;
}

export function BillingRateCard({
  billingRate,
  rateInput,
  rateNotes,
  savingRate,
  onRateInputChange,
  onRateNotesChange,
  onSave,
}: BillingRateCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-emerald-600" />
          Tarif per comanda
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 flex-1">
            <Input
              type="number"
              step="0.1"
              min="0"
              placeholder="Ex: 3.6"
              value={rateInput}
              onChange={(e) => onRateInputChange(e.target.value)}
              className="w-32"
            />
            <span className="text-sm text-muted-foreground font-medium">lei / comanda</span>
          </div>
          <div className="flex-1">
            <Input
              placeholder="Note (optional)"
              value={rateNotes}
              onChange={(e) => onRateNotesChange(e.target.value)}
            />
          </div>
          <Button size="sm" onClick={onSave} loading={savingRate} className="gap-1.5">
            <Save className="h-4 w-4" />
            Salveaza
          </Button>
        </div>
        {!billingRate && (
          <p className="text-sm text-amber-600 mt-2 flex items-center gap-1.5">
            <AlertCircle className="h-4 w-4" />
            Tariful nu este setat. Seteaza un pret per comanda pentru a calcula factura.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
