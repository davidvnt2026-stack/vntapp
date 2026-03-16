import { Package, Plus, Save, Trash2 } from "lucide-react";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "../../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import type { PackagingRate } from "./types";

interface PackagingRatesCardProps {
  packagingRates?: PackagingRate[];
  showAddPackaging: boolean;
  onToggleAddPackaging: () => void;
  newPkgSku: string;
  newPkgType: string;
  newPkgCost: string;
  newPkgNotes: string;
  onNewPkgSkuChange: (value: string) => void;
  onNewPkgTypeChange: (value: string) => void;
  onNewPkgCostChange: (value: string) => void;
  onNewPkgNotesChange: (value: string) => void;
  savingPkg: boolean;
  onAddPackaging: () => void;
  onCancelAddPackaging: () => void;
  onDeletePackaging: (id: Id<"userPackagingRates">) => void;
}

export function PackagingRatesCard({
  packagingRates,
  showAddPackaging,
  onToggleAddPackaging,
  newPkgSku,
  newPkgType,
  newPkgCost,
  newPkgNotes,
  onNewPkgSkuChange,
  onNewPkgTypeChange,
  onNewPkgCostChange,
  onNewPkgNotesChange,
  savingPkg,
  onAddPackaging,
  onCancelAddPackaging,
  onDeletePackaging,
}: PackagingRatesCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Package className="h-5 w-5 text-blue-600" />
            Reguli ambalare extra per SKU
          </CardTitle>
          <Button variant="outline" size="sm" onClick={onToggleAddPackaging} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Adauga regula
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {showAddPackaging && (
          <div className="mb-4 p-4 bg-muted/50 rounded-lg border border-dashed border-border space-y-3">
            <p className="text-sm font-medium">Regula noua de ambalare</p>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <Input
                placeholder="SKU (ex: VEL-002)"
                value={newPkgSku}
                onChange={(e) => onNewPkgSkuChange(e.target.value)}
              />
              <Input
                placeholder="Tip ambalare (ex: Plic cu bule)"
                value={newPkgType}
                onChange={(e) => onNewPkgTypeChange(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="Cost extra"
                  value={newPkgCost}
                  onChange={(e) => onNewPkgCostChange(e.target.value)}
                  className="w-28"
                />
                <span className="text-sm text-muted-foreground whitespace-nowrap">lei/cmd</span>
              </div>
              <Input
                placeholder="Note (optional)"
                value={newPkgNotes}
                onChange={(e) => onNewPkgNotesChange(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={onAddPackaging} loading={savingPkg} className="gap-1.5">
                <Save className="h-4 w-4" />
                Salveaza
              </Button>
              <Button variant="ghost" size="sm" onClick={onCancelAddPackaging}>
                Anuleaza
              </Button>
            </div>
          </div>
        )}

        {packagingRates && packagingRates.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium text-muted-foreground">SKU</th>
                  <th className="pb-2 font-medium text-muted-foreground">Tip ambalare</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Cost extra</th>
                  <th className="pb-2 font-medium text-muted-foreground">Note</th>
                  <th className="pb-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {packagingRates.map((rate) => (
                  <tr key={rate._id} className="border-b last:border-0">
                    <td className="py-2.5">
                      <code className="bg-muted px-2 py-0.5 rounded text-xs font-mono">
                        {rate.sku || "—"}
                      </code>
                    </td>
                    <td className="py-2.5">{rate.packagingType}</td>
                    <td className="py-2.5 text-right font-medium">
                      {rate.packagingCost > 0 ? (
                        <span className="text-orange-600">+{rate.packagingCost} lei</span>
                      ) : (
                        <span className="text-green-600">0 lei (inclus)</span>
                      )}
                    </td>
                    <td className="py-2.5 text-muted-foreground text-xs">{rate.notes || "—"}</td>
                    <td className="py-2.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => onDeletePackaging(rate._id as Id<"userPackagingRates">)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-2">
            Nicio regula de ambalare extra. Toate comenzile vor fi tarifate la pretul standard.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
