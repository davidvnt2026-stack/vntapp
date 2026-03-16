import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { FileText, HelpCircle, ShoppingBag, Truck } from "lucide-react";

export function SetupTipsCard() {
  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-muted-foreground" />
          Quick Setup Guide
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-3 text-sm">
          <div className="flex gap-3 p-4 rounded-lg bg-green-50 border border-green-100">
            <ShoppingBag className="h-5 w-5 text-green-600 flex-shrink-0" />
            <div>
              <p className="font-medium text-green-900">Shopify</p>
              <p className="text-green-700 mt-1">
                1. Create app in Partner Dashboard
                <br />
                2. Add credentials above
                <br />
                3. Connect your stores
              </p>
            </div>
          </div>
          <div className="flex gap-3 p-4 rounded-lg bg-orange-50 border border-orange-100">
            <Truck className="h-5 w-5 text-orange-600 flex-shrink-0" />
            <div>
              <p className="font-medium text-orange-900">Sameday</p>
              <p className="text-orange-700 mt-1">
                1. Introdu username și parola Sameday
                <br />
                2. Pickup Point & Contact Person se preiau automat
              </p>
            </div>
          </div>
          <div className="flex gap-3 p-4 rounded-lg bg-blue-50 border border-blue-100">
            <FileText className="h-5 w-5 text-blue-600 flex-shrink-0" />
            <div>
              <p className="font-medium text-blue-900">FGO</p>
              <p className="text-blue-700 mt-1">
                Get your API key from FGO dashboard. Include RO prefix for Romanian VAT.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
