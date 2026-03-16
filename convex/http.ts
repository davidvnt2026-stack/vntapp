import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Shopify-Topic, X-Shopify-Hmac-SHA256, X-Shopify-Shop-Domain",
};

// Get frontend URL from environment or default
function getFrontendUrl(): string {
  return process.env.FRONTEND_URL || "http://localhost:5173";
}

// ============================================
// HEALTH CHECK
// ============================================

http.route({
  path: "/api/health",
  method: "GET",
  handler: httpAction(async () => {
    return new Response(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }),
});

// ============================================
// COURIER SUMMARY WEBHOOK (from Make)
// ============================================

// CORS preflight for courier summary endpoint
http.route({
  path: "/api/courier-summary/upload",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, { status: 204, headers: corsHeaders });
  }),
});

// POST: Receive Excel file from Make and process courier summary
http.route({
  path: "/api/courier-summary/upload",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    try {
      // --- Authentication via API key ---
      const authHeader = req.headers.get("Authorization");
      const apiKey = authHeader?.replace("Bearer ", "");
      const expectedKey = process.env.MAKE_WEBHOOK_SECRET;

      if (!expectedKey) {
        console.error("[CourierSummaryWebhook] MAKE_WEBHOOK_SECRET env var not set!");
        return new Response(
          JSON.stringify({ error: "Webhook not configured. Set MAKE_WEBHOOK_SECRET env var." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!apiKey || apiKey !== expectedKey) {
        return new Response(
          JSON.stringify({ error: "Unauthorized. Provide a valid Bearer token." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // --- Determine how the file was sent ---
      const contentType = req.headers.get("Content-Type") || "";
      let fileBase64: string;
      let fileName = req.headers.get("X-File-Name") || "courier-summary.xlsx";
      let date = req.headers.get("X-Date") || undefined; // Optional date override
      let sheetName = req.headers.get("X-Sheet-Name") || undefined; // Optional sheet override

      if (contentType.includes("application/json")) {
        // JSON body with base64 file
        const body = await req.json();
        fileBase64 = body.fileBase64 || body.file || body.data;
        fileName = body.fileName || fileName;
        date = body.date || date;
        sheetName = body.sheetName || sheetName;

        if (!fileBase64) {
          return new Response(
            JSON.stringify({ error: "Missing file data. Send 'fileBase64' in JSON body." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        // Raw binary body (application/octet-stream, excel mime types, etc.)
        const arrayBuffer = await req.arrayBuffer();
        if (arrayBuffer.byteLength === 0) {
          return new Response(
            JSON.stringify({ error: "Empty file received." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        // Convert to base64 to pass to the Node action
        const bytes = new Uint8Array(arrayBuffer);
        let binary = "";
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        fileBase64 = btoa(binary);
      }

      console.log(
        `[CourierSummaryWebhook] Received file: ${fileName}, ` +
        `base64 length: ${fileBase64.length}, date: ${date || "today"}`
      );

      // --- Store the Excel file in Convex storage for later download ---
      const binaryStr = atob(fileBase64);
      const fileBytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        fileBytes[i] = binaryStr.charCodeAt(i);
      }
      const blob = new Blob([fileBytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const storageId = await ctx.storage.store(blob);
      console.log(`[CourierSummaryWebhook] File stored in Convex storage: ${storageId}`);

      // --- Call the Node action to parse Excel and save ---
      const result = await ctx.runAction(api.courierSummaryWebhook.processExcelFromWebhook, {
        fileBase64,
        fileName,
        date,
        sheetName,
      });

      // --- Save file record with processing results ---
      const fileDate = result.date || date || new Date().toISOString().split("T")[0];
      await ctx.runMutation(api.courierSummaryFiles.saveFileRecord, {
        storageId,
        fileName,
        fileSize: fileBytes.length,
        date: fileDate,
        processedSuccessfully: result.success,
        totalRows: result.totalRows,
        addressGroups: result.addressGroups,
        grandTotal: result.grandTotal,
      });

      return new Response(JSON.stringify({ ...result, fileStored: true, storageId }), {
        status: result.success ? 200 : 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (error: any) {
      console.error("[CourierSummaryWebhook] Error:", error);
      return new Response(
        JSON.stringify({ error: error.message || "Internal server error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }),
});

// ============================================
// SHOPIFY WEBHOOKS
// ============================================

http.route({
  path: "/webhook/shopify",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, { status: 204, headers: corsHeaders });
  }),
});

http.route({
  path: "/webhook/shopify",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    try {
      const topic = req.headers.get("X-Shopify-Topic");
      const shopDomain = req.headers.get("X-Shopify-Shop-Domain");
      // HMAC validation: req.headers.get("X-Shopify-Hmac-SHA256")
      const body = await req.text();

      console.log(`Received Shopify webhook: ${topic} from ${shopDomain}`);

      // Parse the body
      const data = JSON.parse(body);

      // Handle order webhooks
      if (topic === "orders/create" || topic === "orders/updated") {
        console.log("Processing order webhook:", data.name);
        
        // Process the order via action
        await ctx.runAction(api.shopify.processOrderWebhook, {
          shopDomain: shopDomain || "",
          order: data,
        });
      }

      // Handle product webhooks
      if (topic === "products/create" || topic === "products/update") {
        console.log("Processing product webhook:", data.title);
        
        await ctx.runAction(api.shopify.processProductWebhook, {
          shopDomain: shopDomain || "",
          product: data,
        });
      }

      // Handle product deletion
      if (topic === "products/delete") {
        console.log("Processing product deletion:", data.id);
        
        await ctx.runAction(api.shopify.processProductDeleteWebhook, {
          shopDomain: shopDomain || "",
          productId: data.id.toString(),
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (error: any) {
      console.error("Webhook error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }),
});

// ============================================
// SHOPIFY OAUTH
// ============================================

// OAuth callback - handles redirect from Shopify after user authorizes
http.route({
  path: "/oauth/shopify/callback",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const frontendUrl = getFrontendUrl();
    
    try {
      const url = new URL(req.url);
      const code = url.searchParams.get("code");
      const shop = url.searchParams.get("shop");
      const state = url.searchParams.get("state");
      // Note: hmac validation could be added here for extra security

      // Validate required parameters
      if (!code || !shop || !state) {
        return createOAuthErrorPage(frontendUrl, "Missing required parameters from Shopify");
      }

      // Exchange code for access token
      const result = await ctx.runAction(api.shopifyOauth.exchangeCodeForToken, {
        code,
        shop,
        state,
      });

      if (!result.success) {
        return createOAuthErrorPage(frontendUrl, result.error || "Failed to connect store");
      }

      // Success! Redirect to connections page
      return createOAuthSuccessPage(frontendUrl, shop);

    } catch (error: any) {
      console.error("OAuth callback error:", error);
      return createOAuthErrorPage(frontendUrl, error.message || "An unexpected error occurred");
    }
  }),
});

// Helper: Create success page HTML
function createOAuthSuccessPage(frontendUrl: string, shop: string): Response {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Shopify Connected - VNT Dash</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
    }
    .container {
      background: white;
      padding: 3rem;
      border-radius: 1rem;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      text-align: center;
      max-width: 400px;
    }
    .icon {
      width: 64px;
      height: 64px;
      background: #22c55e;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 1.5rem;
    }
    .icon svg { width: 32px; height: 32px; color: white; }
    h1 { color: #0f172a; font-size: 1.5rem; margin-bottom: 0.5rem; }
    p { color: #64748b; margin-bottom: 1.5rem; }
    .shop { font-weight: 600; color: #0f172a; }
    .button {
      display: inline-block;
      background: #2563eb;
      color: white;
      padding: 0.75rem 1.5rem;
      border-radius: 0.5rem;
      text-decoration: none;
      font-weight: 500;
      transition: background 0.2s;
    }
    .button:hover { background: #1d4ed8; }
    .redirect { color: #94a3b8; font-size: 0.875rem; margin-top: 1rem; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
      </svg>
    </div>
    <h1>Store Connected!</h1>
    <p>Successfully connected <span class="shop">${shop}</span> to VNT Dash.</p>
    <a href="${frontendUrl}/connections" class="button">Go to Connections</a>
    <p class="redirect">Redirecting in 3 seconds...</p>
  </div>
  <script>
    setTimeout(() => { window.location.href = "${frontendUrl}/connections"; }, 3000);
  </script>
</body>
</html>
  `;
  
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html" },
  });
}

// Helper: Create error page HTML
function createOAuthErrorPage(frontendUrl: string, error: string): Response {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Connection Failed - VNT Dash</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
    }
    .container {
      background: white;
      padding: 3rem;
      border-radius: 1rem;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      text-align: center;
      max-width: 400px;
    }
    .icon {
      width: 64px;
      height: 64px;
      background: #ef4444;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 1.5rem;
    }
    .icon svg { width: 32px; height: 32px; color: white; }
    h1 { color: #0f172a; font-size: 1.5rem; margin-bottom: 0.5rem; }
    p { color: #64748b; margin-bottom: 1.5rem; }
    .error { 
      background: #fef2f2; 
      color: #dc2626; 
      padding: 0.75rem 1rem; 
      border-radius: 0.5rem;
      font-size: 0.875rem;
      margin-bottom: 1.5rem;
    }
    .button {
      display: inline-block;
      background: #2563eb;
      color: white;
      padding: 0.75rem 1.5rem;
      border-radius: 0.5rem;
      text-decoration: none;
      font-weight: 500;
      transition: background 0.2s;
    }
    .button:hover { background: #1d4ed8; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
      </svg>
    </div>
    <h1>Connection Failed</h1>
    <p>We couldn't connect your Shopify store.</p>
    <div class="error">${error}</div>
    <a href="${frontendUrl}/connections" class="button">Try Again</a>
  </div>
</body>
</html>
  `;
  
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html" },
  });
}

export default http;
