import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Card, CardContent } from "../ui/Card";
import { X, Loader2 } from "lucide-react";
import { formatCurrency } from "../../lib/utils";

interface Sku {
  _id: string;
  sku: string;
  name: string;
  sellPrice?: number;
  currentStock: number;
}

interface SkuPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  search: string;
  onSearchChange: (search: string) => void;
  skus?: Sku[];
  isLoading: boolean;
  onSelectSku: (sku: Sku) => void;
}

export function SkuPickerModal({
  isOpen,
  onClose,
  search,
  onSearchChange,
  skus,
  isLoading,
  onSelectSku,
}: SkuPickerModalProps) {
  if (!isOpen) return null;

  const handleClose = () => {
    onSearchChange("");
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <Card 
        className="w-full max-w-md max-h-[70vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <CardContent className="pt-6 flex flex-col h-full overflow-hidden">
          <div className="flex items-center justify-between mb-4 flex-shrink-0">
            <h3 className="text-lg font-semibold">Adaugă produs</h3>
            <Button size="sm" variant="ghost" onClick={handleClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>
          
          <Input
            placeholder="Caută SKU sau nume produs..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="mb-4 flex-shrink-0"
          />
          
          <div 
            className="flex-1 min-h-0 overflow-y-auto space-y-2 overscroll-contain"
            style={{ maxHeight: 'calc(70vh - 180px)' }}
          >
            {isLoading ? (
              <div className="text-center py-8">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
              </div>
            ) : !skus || skus.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nu s-au găsit produse cu stoc
              </div>
            ) : (
              skus.map((sku) => (
                <button
                  key={sku._id}
                  onClick={() => onSelectSku(sku)}
                  className="w-full text-left p-3 border rounded-lg hover:bg-accent"
                >
                  <div className="font-medium">{sku.name}</div>
                  <div className="text-sm text-muted-foreground flex items-center justify-between">
                    <span>SKU: {sku.sku}</span>
                    <span className="text-green-600 font-medium">Stoc: {sku.currentStock}</span>
                  </div>
                  {sku.sellPrice && (
                    <div className="text-sm font-medium mt-1">{formatCurrency(sku.sellPrice)}</div>
                  )}
                </button>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
