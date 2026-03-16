import { useState } from "react";
import { Button } from "../ui/Button";
import { Card, CardContent } from "../ui/Card";
import { X, AlertTriangle, Loader2, ShoppingBag } from "lucide-react";

interface CancelOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (cancelInShopify: boolean) => void;
  orderNumber: string;
  hasShopifyOrder: boolean; // Whether this order has a Shopify ID
  isProcessing: boolean;
}

export function CancelOrderModal({
  isOpen,
  onClose,
  onConfirm,
  orderNumber,
  hasShopifyOrder,
  isProcessing,
}: CancelOrderModalProps) {
  const [cancelInShopify, setCancelInShopify] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm(cancelInShopify);
  };

  const handleClose = () => {
    if (!isProcessing) {
      setCancelInShopify(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-5 w-5" />
              Anulare comandă #{orderNumber}
            </h2>
            <Button size="sm" variant="ghost" onClick={handleClose} disabled={isProcessing}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Local cancel explanation */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
            <p className="text-sm text-amber-800">
              <strong>Anulare locală:</strong> Comanda va fi marcată ca anulată în dashboard, iar stocul va fi restaurat.
              Această acțiune poate fi <strong>reversibilă</strong> — poți restaura comanda ulterior.
            </p>
          </div>

          {/* Shopify option */}
          {hasShopifyOrder && (
            <div className="mb-4">
              <label
                className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                  cancelInShopify
                    ? "border-red-300 bg-red-50"
                    : "border-gray-200 hover:border-gray-300 bg-white"
                }`}
              >
                <input
                  type="checkbox"
                  checked={cancelInShopify}
                  onChange={(e) => setCancelInShopify(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                  disabled={isProcessing}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 font-medium text-sm">
                    <ShoppingBag className="h-4 w-4 text-green-600" />
                    Anulează și în Shopify
                  </div>
                  {cancelInShopify && (
                    <div className="mt-2 bg-red-100 border border-red-200 rounded p-2">
                      <p className="text-xs text-red-700 font-semibold">
                        ⚠️ ATENȚIE: Anularea în Shopify este IREVERSIBILĂ!
                      </p>
                      <p className="text-xs text-red-600 mt-1">
                        Comanda va fi anulată permanent în Shopify și <strong>nu poate fi restaurată</strong>.
                        Dacă restaurezi comanda local, ea va rămâne anulată în Shopify.
                      </p>
                    </div>
                  )}
                </div>
              </label>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isProcessing}
            >
              Renunță
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={isProcessing}
              className={`min-w-[140px] ${
                cancelInShopify
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : "bg-orange-500 hover:bg-orange-600 text-white"
              }`}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Se anulează...
                </>
              ) : (
                <>
                  <X className="h-4 w-4 mr-2" />
                  {cancelInShopify ? "Anulează (Local + Shopify)" : "Anulează local"}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
