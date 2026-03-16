import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Card, CardContent } from "../../components/ui/Card";
import { Check, AlertTriangle, Loader2 } from "lucide-react";

export function ShopifyCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Processing Shopify authorization...");
  const [shopDomain, setShopDomain] = useState<string | null>(null);

  const exchangeCodeForToken = useAction(api.shopifyOauth.exchangeCodeForToken);

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get("code");
      const shop = searchParams.get("shop");
      const state = searchParams.get("state");

      if (!code || !shop || !state) {
        setStatus("error");
        setMessage("Missing required parameters from Shopify");
        return;
      }

      setShopDomain(shop);

      try {
        const result = await exchangeCodeForToken({ code, shop, state });

        if (result.success) {
          setStatus("success");
          setMessage(`Successfully connected ${shop}!`);
          
          // Redirect to connections page after 2 seconds
          setTimeout(() => {
            navigate("/connections");
          }, 2000);
        } else {
          setStatus("error");
          setMessage(result.error || "Failed to connect store");
        }
      } catch (error: any) {
        setStatus("error");
        setMessage(error.message || "An unexpected error occurred");
      }
    };

    handleCallback();
  }, [searchParams, exchangeCodeForToken, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <div className="text-center">
            {status === "loading" && (
              <>
                <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                  <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
                </div>
                <h1 className="text-xl font-semibold mb-2">Connecting Store</h1>
                <p className="text-muted-foreground">{message}</p>
              </>
            )}

            {status === "success" && (
              <>
                <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                  <Check className="h-8 w-8 text-green-600" />
                </div>
                <h1 className="text-xl font-semibold text-green-700 mb-2">Store Connected!</h1>
                <p className="text-muted-foreground mb-4">{message}</p>
                {shopDomain && (
                  <p className="text-sm font-medium text-green-600">{shopDomain}</p>
                )}
                <p className="text-sm text-muted-foreground mt-4">
                  Redirecting to connections...
                </p>
              </>
            )}

            {status === "error" && (
              <>
                <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
                  <AlertTriangle className="h-8 w-8 text-red-600" />
                </div>
                <h1 className="text-xl font-semibold text-red-700 mb-2">Connection Failed</h1>
                <p className="text-muted-foreground mb-4">{message}</p>
                <button
                  onClick={() => navigate("/connections")}
                  className="text-primary hover:underline text-sm"
                >
                  Back to Connections
                </button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
