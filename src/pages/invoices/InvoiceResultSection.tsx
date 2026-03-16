import { Calculator, CheckCircle2, DollarSign, Package, ShoppingCart } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import type { InvoicePeriod, SkuBreakdownItem } from "./types";

export interface InvoiceResult {
  userName: string;
  userEmail: string;
  stores?: string[];
  totalOrders: number;
  ordersNotWorked: number;
  pricePerOrder: number;
  baseCost: number;
  totalExtraCost: number;
  grandTotal: number;
  skuBreakdown: SkuBreakdownItem[];
}

interface InvoiceResultSectionProps {
  invoiceData: InvoiceResult;
  period: InvoicePeriod;
}

export function InvoiceResultSection({ invoiceData, period }: InvoiceResultSectionProps) {
  const skusWithExtra = invoiceData.skuBreakdown.filter((item) => item.extraCostPerOrder > 0);
  const skusWithoutExtra = invoiceData.skuBreakdown.filter((item) => item.extraCostPerOrder === 0);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <ShoppingCart className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{invoiceData.totalOrders}</p>
                <p className="text-xs text-muted-foreground">Comenzi lucrate</p>
              </div>
            </div>
            {invoiceData.ordersNotWorked > 0 && (
              <p className="text-xs text-amber-600 mt-2">
                +{invoiceData.ordersNotWorked} nelucrate (necontorizate)
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{invoiceData.baseCost.toFixed(2)} lei</p>
                <p className="text-xs text-muted-foreground">
                  Cost baza ({invoiceData.totalOrders} x {invoiceData.pricePerOrder} lei)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-orange-100 flex items-center justify-center">
                <Package className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{invoiceData.totalExtraCost.toFixed(2)} lei</p>
                <p className="text-xs text-muted-foreground">Extra ambalare</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 border-emerald-200 bg-emerald-50/50">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-200 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-emerald-700" />
              </div>
              <div>
                <p className="text-2xl font-bold text-emerald-700">
                  {invoiceData.grandTotal.toFixed(2)} lei
                </p>
                <p className="text-xs text-emerald-600 font-medium">TOTAL FACTURA</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Calculator className="h-5 w-5 text-emerald-600" />
            Detalii factura - {period.startDate} {"->"} {period.endDate}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              1. Tarif standard procesare
            </h4>
            <div className="flex items-center justify-between py-3 px-4 bg-blue-50 rounded-lg border border-blue-100">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-blue-600" />
                <span className="text-sm">
                  <strong>{invoiceData.totalOrders}</strong>{" "}
                  {invoiceData.totalOrders === 1 ? "comanda" : "comenzi"} lucrate x{" "}
                  <strong>{invoiceData.pricePerOrder}</strong> lei / comanda
                </span>
              </div>
              <span className="font-bold text-blue-700">{invoiceData.baseCost.toFixed(2)} lei</span>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              2. Extra ambalare per SKU
            </h4>

            {skusWithExtra.length > 0 ? (
              <div className="space-y-2">
                {skusWithExtra.map((sku) => (
                  <div
                    key={sku.sku}
                    className="flex items-center justify-between py-3 px-4 bg-orange-50 rounded-lg border border-orange-100"
                  >
                    <div className="flex items-center gap-3">
                      <Package className="h-4 w-4 text-orange-600" />
                      <div>
                        <div className="flex items-center gap-2">
                          <code className="bg-orange-100 text-orange-800 px-2 py-0.5 rounded text-xs font-mono font-semibold">
                            {sku.sku}
                          </code>
                          <Badge variant="warning" className="text-xs">
                            {sku.packagingType}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {sku.name} - apare in <strong>{sku.orderCount}</strong>{" "}
                          {sku.orderCount === 1 ? "comanda" : "comenzi"} x{" "}
                          <strong>+{sku.extraCostPerOrder} lei</strong> extra
                        </p>
                      </div>
                    </div>
                    <span className="font-bold text-orange-700">
                      +{sku.totalExtraCost.toFixed(2)} lei
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-3 px-4 bg-muted/30 rounded-lg border border-dashed border-border">
                <p className="text-sm text-muted-foreground">
                  Nicio comanda nu contine SKU-uri cu cost extra de ambalare.
                </p>
              </div>
            )}

            {skusWithoutExtra.length > 0 && (
              <div className="mt-3 py-2 px-4 rounded-lg bg-muted/20">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium">SKU-uri fara cost extra:</span>{" "}
                  {skusWithoutExtra.map((item, i) => (
                    <span key={item.sku}>
                      <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
                        {item.sku}
                      </code>{" "}
                      <span className="text-muted-foreground/60">
                        ({item.packagingType}, {item.orderCount} cmd)
                      </span>
                      {i < skusWithoutExtra.length - 1 ? " · " : ""}
                    </span>
                  ))}
                </p>
              </div>
            )}
          </div>

          <div className="pt-4 border-t-2 border-emerald-200">
            <div className="flex items-center justify-between py-3 px-4 bg-emerald-50 rounded-lg border border-emerald-200">
              <div>
                <span className="text-lg font-bold text-emerald-700">Total factura</span>
                <div className="text-xs text-emerald-600 mt-1 space-y-0.5">
                  <p>
                    {invoiceData.totalOrders}{" "}
                    {invoiceData.totalOrders === 1 ? "comanda" : "comenzi"} x{" "}
                    {invoiceData.pricePerOrder} lei = {invoiceData.baseCost.toFixed(2)} lei
                  </p>
                  {invoiceData.totalExtraCost > 0 && (
                    <p>+ {invoiceData.totalExtraCost.toFixed(2)} lei extra ambalare</p>
                  )}
                </div>
              </div>
              <span className="text-3xl font-bold text-emerald-700">
                {invoiceData.grandTotal.toFixed(2)} lei
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
