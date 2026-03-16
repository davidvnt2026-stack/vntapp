import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Eye, EyeOff, ExternalLink, HelpCircle, Key, Zap } from "lucide-react";

interface ShopifyAddStoreFormProps {
  shopDomain: string;
  setShopDomain: (v: string) => void;
  storeClientId: string;
  setStoreClientId: (v: string) => void;
  storeClientSecret: string;
  setStoreClientSecret: (v: string) => void;
  storeAppName: string;
  setStoreAppName: (v: string) => void;
  showStoreSecret: boolean;
  setShowStoreSecret: (v: boolean) => void;
  connectingShopify: boolean;
  onConnect: () => void;
  onCancel: () => void;
}

export function ShopifyAddStoreForm({
  shopDomain,
  setShopDomain,
  storeClientId,
  setStoreClientId,
  storeClientSecret,
  setStoreClientSecret,
  storeAppName,
  setStoreAppName,
  showStoreSecret,
  setShowStoreSecret,
  connectingShopify,
  onConnect,
  onCancel,
}: ShopifyAddStoreFormProps) {
  return (
    <div className="mb-6 p-5 border-2 border-violet-200 rounded-xl bg-gradient-to-br from-violet-50/50 to-purple-50/50">
      <div className="flex items-center gap-2 mb-4">
        <Zap className="h-5 w-5 text-violet-600" />
        <h4 className="font-semibold">Connect a New Store</h4>
      </div>
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">
            Store Domain <span className="text-red-500">*</span>
          </label>
          <Input
            placeholder="your-store.myshopify.com"
            value={shopDomain}
            onChange={(e) => setShopDomain(e.target.value)}
            className="bg-white"
          />
          <p className="text-xs text-muted-foreground">
            Enter just the store name or full domain (e.g., "my-store" or "my-store.myshopify.com")
          </p>
        </div>

        <div className="p-4 bg-white rounded-lg border border-violet-100">
          <div className="flex items-center gap-2 mb-3">
            <Key className="h-4 w-4 text-violet-600" />
            <h5 className="font-medium text-sm">Store App Credentials</h5>
            <span className="text-xs text-red-600 font-medium">Required</span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">App Name</label>
              <Input
                value={storeAppName}
                onChange={(e) => setStoreAppName(e.target.value)}
                placeholder="e.g., My Store App"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Client ID <span className="text-red-500">*</span>
              </label>
              <Input
                value={storeClientId}
                onChange={(e) => setStoreClientId(e.target.value)}
                placeholder="Shopify App Client ID"
                className="h-9 text-sm"
              />
            </div>
          </div>

          <div className="mt-3 space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Client Secret <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Input
                type={showStoreSecret ? "text" : "password"}
                value={storeClientSecret}
                onChange={(e) => setStoreClientSecret(e.target.value)}
                placeholder="Shopify App Client Secret"
                className="h-9 text-sm pr-10"
              />
              <button
                type="button"
                onClick={() => setShowStoreSecret(!showStoreSecret)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showStoreSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-lg bg-blue-50 border border-blue-200 p-3">
            <div className="flex gap-2">
              <HelpCircle className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-medium text-blue-900">Where to find these credentials?</p>
                <ol className="mt-1 space-y-0.5 text-blue-800 list-decimal list-inside">
                  <li>
                    Go to{" "}
                    <a
                      href="https://partners.shopify.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      Shopify Partner Dashboard
                    </a>
                  </li>
                  <li>Apps → Your App → Client credentials</li>
                </ol>
                <p className="mt-1 text-blue-700">
                  Add{" "}
                  <code className="bg-blue-100 px-1 py-0.5 rounded text-[10px]">
                    {typeof window !== "undefined" ? window.location.origin : ""}/oauth/shopify/callback
                  </code>{" "}
                  to Allowed redirection URLs.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            onClick={onConnect}
            loading={connectingShopify}
            className="flex-1 shadow-lg shadow-violet-500/25"
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Connect via OAuth
          </Button>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
