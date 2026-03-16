import { action } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { api } from "./_generated/api";

// SHA-1 hash function for FGO API authentication
async function sha1(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

async function parseFgoJsonResponse(
  response: Response,
  endpoint: "emitere" | "stornare" | "print"
): Promise<Record<string, unknown>> {
  const rawText = await response.text();
  try {
    return JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    // FGO may return an HTML/plain-text conflict page for certain 409 cases.
    // Convert this to a structured error payload so downstream logic can handle it gracefully.
    if (response.status === 409) {
      const snippet = rawText.replace(/\s+/g, " ").trim().slice(0, 220);
      return {
        Success: false,
        Message:
          `Conflict la factura/${endpoint} (status 409).` +
          `${snippet ? ` ${snippet}` : ""}`,
      };
    }
    const snippet = rawText.replace(/\s+/g, " ").trim().slice(0, 220);
    throw new ConvexError(
      `FGO: Răspuns invalid la factura/${endpoint} (status ${response.status}). ` +
      `Serverul nu a returnat JSON.${snippet ? ` Body: ${snippet}` : ""}`
    );
  }
}

// FGO rate limit protection for bulk actions
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Extract numeric CUI from a VAT number that may include country prefix (e.g. "RO12345678" -> "12345678")
// FGO CodUnic expects the bare CUI number, not the EU VAT number with country prefix
function extractCUI(vatNumber: string): string {
  const trimmed = vatNumber.trim();
  // Strip leading country code letters (RO, BG, etc.)
  const match = trimmed.match(/^[A-Za-z]{2,}(\d+)$/);
  return match ? match[1] : trimmed;
}

function normalizeCountryCode(countryCode?: string, countryName?: string): string {
  const code = (countryCode || "").trim().toUpperCase();
  if (code.length === 2) return code;

  const name = (countryName || "").trim().toLowerCase();
  if (!name) return "RO";

  if (name.includes("hungary") || name.includes("ungaria")) return "HU";
  if (name.includes("romania") || name.includes("românia")) return "RO";
  if (name.includes("bulgaria") || name.includes("bulgaria")) return "BG";

  return "RO";
}

function resolveInvoiceCurrency(orderCurrency?: string, countryCode?: string): string {
  const normalizedOrderCurrency = (orderCurrency || "").trim().toUpperCase();
  if (normalizedOrderCurrency) return normalizedOrderCurrency;

  if (countryCode === "HU") return "HUF";
  return "RON";
}

// Types for return values
type InvoiceResult = {
  success: true;
  alreadyExists?: boolean;
  invoice?: {
    number: string;
    series: string;
    link?: string;
  };
};

type BatchResult = {
  results: Array<{
    orderId: string;
    orderNumber: string;
    success: boolean;
    invoiceNumber?: string;
    error?: string;
  }>;
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
};

type BatchInvoiceResult = {
  results: Array<{
    orderId: string;
    orderNumber: string;
    success: boolean;
    invoice?: {
      number: string;
      series: string;
    };
    error?: string;
  }>;
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
};

type PdfResult = {
  success: true;
  pdfUrl: string;
  pdf?: string; // base64 encoded PDF content
};

export const createInvoice = action({
  args: {
    token: v.string(),
    orderId: v.id("shopifyOrders"),
    includeShipping: v.optional(v.boolean()),
    useOrderDate: v.optional(v.boolean()),
    createPayment: v.optional(v.boolean()),
  },
  returns: v.object({
    success: v.literal(true),
    alreadyExists: v.optional(v.boolean()),
    invoice: v.optional(v.object({
      number: v.string(),
      series: v.string(),
      link: v.optional(v.string()),
    })),
  }),
  handler: async (ctx, args): Promise<InvoiceResult> => {
    // Get user
    const user = await ctx.runQuery(api.auth.getCurrentUser, {
      token: args.token,
    });
    if (!user) {
      throw new ConvexError("Sesiune invalidă. Te rugăm să te autentifici din nou.");
    }

    // Get order
    const orderResult = await ctx.runQuery(api.orders.getById, {
      token: args.token,
      id: args.orderId,
    });
    if (!orderResult) {
      throw new ConvexError("Comanda nu a fost găsită.");
    }
    const order = orderResult;

    // Check if invoice already exists
    if (order.invoiceNumber && order.invoiceStatus !== "storno") {
      return {
        success: true,
        alreadyExists: true,
        invoice: {
          number: order.invoiceNumber,
          series: order.invoiceSeries || "",
        },
      };
    }

    // Get FGO connection
    const connection = await ctx.runQuery(api.connections.getByType, {
      token: args.token,
      connectionType: "fgo",
    });
    if (!connection) {
      throw new ConvexError("FGO nu este configurat. Mergi la Connections și adaugă credențialele FGO (CUI, API Key).");
    }

    const creds = connection.credentials as {
      vatNumber?: string;
      apiKey?: string;
      platformUrl?: string;
      invoiceSeries?: string;
      vatTaxPercentage?: string;
    };

    // Validate credentials
    if (!creds.vatNumber || !creds.vatNumber.trim()) {
      throw new ConvexError("FGO: Lipsește CUI-ul (VAT Number). Configurează în Connections.");
    }
    if (!creds.apiKey || !creds.apiKey.trim()) {
      throw new ConvexError("FGO: Lipsește API Key-ul. Configurează în Connections.");
    }

    const apiKey = creds.apiKey;
    const platformUrl = creds.platformUrl;
    const invoiceSeries = creds.invoiceSeries;
    const vatTaxPercentage = creds.vatTaxPercentage;

    // Extract bare CUI number (strip "RO" or other country prefix)
    // FGO CodUnic = CUI number only, NOT the EU VAT number with prefix
    const codUnic = extractCUI(creds.vatNumber).normalize("NFC");
    const normalizedApiKey = apiKey.trim().normalize("NFC");
    const normalizedCustomerName = (order.customerName || "Client").trim().normalize("NFC");

    // Calculate hash: SHA-1(CodUnic + PrivateKey + ClientName)
    const hashInput = `${codUnic}${normalizedApiKey}${normalizedCustomerName}`;
    const hash = await sha1(hashInput);

    console.log("[FGO Issue] Hash debug:", {
      codUnic,
      customerName: normalizedCustomerName,
      hashInput: `${codUnic}***${normalizedCustomerName}`,
      hash,
    });

    // Calculate VAT rate
    const vatRate = parseFloat(vatTaxPercentage || "19") / 100;

    // Determine invoice date
    const invoiceDate = args.useOrderDate
      ? order.placedOn
      : new Date().toISOString().split("T")[0];

    const shippingAddress = order.shippingAddress || {};
    const countryCode = normalizeCountryCode(shippingAddress.countryCode, shippingAddress.country);
    const invoiceCurrency = resolveInvoiceCurrency(order.currency, countryCode);
    const county = shippingAddress.state || shippingAddress.province || "";
    const postalCode = shippingAddress.postalCode || shippingAddress.zipCode || shippingAddress.zip || "";

    // Build invoice data
    const invoiceData: Record<string, string> = {
      CodUnic: codUnic,
      Hash: hash,
      Serie: invoiceSeries || "FV",
      TipFactura: "Factura",
      Valuta: invoiceCurrency,
      DataEmitere: invoiceDate,
      PlatformaURL: platformUrl || "https://api.fgo.ro",
      "Client[Denumire]": normalizedCustomerName,
      "Client[Email]": order.customerEmail || "",
      "Client[Tara]": countryCode,
      "Client[Judet]": county,
      "Client[Localitate]": shippingAddress.city || "",
      "Client[Adresa]": shippingAddress.line1 || "",
      "Client[CodPostal]": postalCode,
      "Client[Tip]": "PF", // Individual
      Text: `Comanda: ${order.orderNumber}`,
      IdExtern: order.shopifyOrderId,
    };

    // Add line items
    // Keep original product prices and add discount as separate negative line item.
    let itemIndex = 0;
    for (const item of order.items) {
      const unitPriceWithVAT = parseFloat(String(item.price || "0"));
      const unitPriceWithoutVAT = unitPriceWithVAT / (1 + vatRate);

      invoiceData[`Continut[${itemIndex}][Denumire]`] = item.name || "Produs";
      invoiceData[`Continut[${itemIndex}][UM]`] = "buc";
      invoiceData[`Continut[${itemIndex}][NrProduse]`] = String(item.quantity || 1);
      invoiceData[`Continut[${itemIndex}][PretUnitar]`] = unitPriceWithoutVAT.toFixed(4);
      invoiceData[`Continut[${itemIndex}][CotaTVA]`] = String(vatRate * 100);
      
      itemIndex++;
    }

    // Add order discount as negative line item (if any).
    // FGO requires positive PretUnitar and negative NrProduse for negative values.
    const totalDiscounts = Math.max(0, Number(order.totalDiscounts || 0));
    if (totalDiscounts > 0) {
      const discountWithoutVAT = totalDiscounts / (1 + vatRate);
      invoiceData[`Continut[${itemIndex}][Denumire]`] = "Discount comanda";
      invoiceData[`Continut[${itemIndex}][UM]`] = "buc";
      invoiceData[`Continut[${itemIndex}][NrProduse]`] = "-1";
      invoiceData[`Continut[${itemIndex}][PretUnitar]`] = discountWithoutVAT.toFixed(4);
      invoiceData[`Continut[${itemIndex}][CotaTVA]`] = String(vatRate * 100);
      itemIndex++;
    }

    // Add shipping if applicable
    const includeShipping = args.includeShipping !== false;
    const totalShipping = order.totalShipping || 0;
    
    if (includeShipping && totalShipping > 0) {
      const shippingWithoutVAT = totalShipping / (1 + vatRate);

      invoiceData[`Continut[${itemIndex}][Denumire]`] = "Transport";
      invoiceData[`Continut[${itemIndex}][UM]`] = "buc";
      invoiceData[`Continut[${itemIndex}][NrProduse]`] = "1";
      invoiceData[`Continut[${itemIndex}][PretUnitar]`] = shippingWithoutVAT.toFixed(4);
      invoiceData[`Continut[${itemIndex}][CotaTVA]`] = String(vatRate * 100);
    }

    // ──── DEBUG: log everything we're about to send ────
    console.log("[FGO Invoice Debug]", JSON.stringify({
      orderNumber: order.orderNumber,
      orderId: String(args.orderId),
      dbValues: {
        totalPrice: order.totalPrice,
        subtotalPrice: order.subtotalPrice,
        totalShipping: order.totalShipping,
        totalDiscounts: order.totalDiscounts,
        totalTax: order.totalTax,
        currency: order.currency,
        itemCount: order.items?.length,
        items: order.items?.map((i: any) => ({
          name: i.name,
          sku: i.sku,
          qty: i.quantity,
          price: i.price,
        })),
      },
      computedDiscount: {
        rawTotalDiscounts: order.totalDiscounts,
        parsedTotalDiscounts: totalDiscounts,
        discountIncluded: totalDiscounts > 0,
      },
      fgoLineItems: Object.entries(invoiceData)
        .filter(([k]) => k.startsWith("Continut"))
        .reduce((acc, [k, v]) => { acc[k] = v; return acc; }, {} as Record<string, string>),
    }));
    // ──── END DEBUG ────

    // Build form body
    const formBody = Object.entries(invoiceData)
      .map(([k, val]) => `${encodeURIComponent(k)}=${encodeURIComponent(val)}`)
      .join("&");

    // Send to FGO
    const response = await fetch("https://api.fgo.ro/v1/factura/emitere", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formBody,
    });

    const responseData = (await parseFgoJsonResponse(response, "emitere")) as {
      Success: boolean;
      Message?: string;
      Factura?: {
        Numar: string;
        Serie: string;
        Link?: string;
      };
    };

    if (responseData.Success && responseData.Factura) {
      const invoiceNumber = responseData.Factura.Numar.replace(
        responseData.Factura.Serie,
        ""
      );

      // Update order with invoice info
      await ctx.runMutation(api.orders.updateInvoice, {
        orderId: args.orderId,
        invoiceNumber,
        invoiceSeries: responseData.Factura.Serie,
        invoiceStatus: "unpaid",
      });

      return {
        success: true,
        invoice: {
          number: invoiceNumber,
          series: responseData.Factura.Serie,
          link: responseData.Factura.Link,
        },
      };
    } else {
      // Log the full error for debugging, then provide a user-friendly message
      const rawError = responseData.Message || "Eroare necunoscută de la FGO";
      console.error("[FGO Issue] Error from FGO API:", rawError, {
        codUnic,
        hashInput: `${codUnic}***${normalizedCustomerName}`,
        hash,
        status: response.status,
      });

      let errorMsg = rawError;
      
      if (rawError.includes("Codul unic nu exista")) {
        errorMsg = `CUI-ul "${codUnic}" nu este înregistrat în FGO. Verifică că ai un cont FGO activ cu acest CUI. (FGO: ${rawError})`;
      } else if (rawError.includes("Hash")) {
        errorMsg = `Eroare de autentificare FGO (hash invalid). Verifică API Key-ul și CUI-ul (fără prefix RO). (FGO: ${rawError})`;
      } else if (rawError.includes("IdExtern") || response.status === 409) {
        errorMsg = `Factura există deja pentru această comandă. (FGO: ${rawError})`;
      }
      
      throw new ConvexError(errorMsg);
    }
  },
});

export const createBatchInvoices = action({
  args: {
    token: v.string(),
    orderIds: v.array(v.id("shopifyOrders")),
    includeShipping: v.optional(v.boolean()),
    useOrderDate: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<BatchResult> => {
    const results: BatchResult["results"] = [];

    for (let i = 0; i < args.orderIds.length; i++) {
      const orderId = args.orderIds[i];
      try {
        const orderData = await ctx.runQuery(api.orders.getById, {
          token: args.token,
          id: orderId,
        });

        // Safety rule: never generate over an existing active invoice.
        if (orderData?.invoiceNumber && orderData.invoiceStatus !== "storno") {
          results.push({
            orderId: orderId as string,
            orderNumber: orderData.orderNumber || "Unknown",
            success: false,
            error: `Comanda are deja factură (${orderData.invoiceSeries || ""}${orderData.invoiceNumber}).`,
          });
          continue;
        }

        const result = await ctx.runAction(api.fgo.createInvoice, {
          token: args.token,
          orderId,
          includeShipping: args.includeShipping,
          useOrderDate: args.useOrderDate,
        });

        results.push({
          orderId: orderId as string,
          orderNumber: orderData?.orderNumber || "Unknown",
          success: true,
          invoiceNumber: result.invoice?.number,
        });
      } catch (error: unknown) {
        const orderData = await ctx.runQuery(api.orders.getById, {
          token: args.token,
          id: orderId,
        });

        results.push({
          orderId: orderId as string,
          orderNumber: orderData?.orderNumber || "Unknown",
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }

      // Respect FGO API limits in bulk processing.
      if (i < args.orderIds.length - 1) {
        await delay(1000);
      }
    }

    return {
      results,
      summary: {
        total: results.length,
        successful: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
      },
    };
  },
});

export const stornoInvoice = action({
  args: {
    token: v.string(),
    orderId: v.id("shopifyOrders"),
  },
  handler: async (ctx, args): Promise<{ success: true }> => {
    // Get user
    const user = await ctx.runQuery(api.auth.getCurrentUser, {
      token: args.token,
    });
    if (!user) {
      throw new ConvexError("Sesiune invalidă. Te rugăm să te autentifici din nou.");
    }

    // Get order
    const order = await ctx.runQuery(api.orders.getById, {
      token: args.token,
      id: args.orderId,
    });
    if (!order) {
      throw new ConvexError("Comanda nu a fost găsită.");
    }

    if (!order.invoiceNumber) {
      throw new ConvexError("Comanda nu are o factură de anulat.");
    }

    // Get FGO connection
    const connection = await ctx.runQuery(api.connections.getByType, {
      token: args.token,
      connectionType: "fgo",
    });
    if (!connection) {
      throw new ConvexError("FGO nu este configurat. Mergi la Connections.");
    }

    const creds = connection.credentials as {
      vatNumber: string;
      apiKey: string;
      platformUrl?: string;
    };

    // Extract bare CUI number (strip "RO" prefix)
    const codUnic = extractCUI(creds.vatNumber).normalize("NFC");
    const normalizedApiKey = creds.apiKey.trim().normalize("NFC");
    const invoiceNumber = order.invoiceNumber.trim();

    // Calculate hash for storno - per FGO spec: SHA-1(CodUnic + PrivateKey + InvoiceNumber)
    const hash = await sha1(
      `${codUnic}${normalizedApiKey}${invoiceNumber}`
    );

    console.log("[FGO Storno] Hash debug:", {
      codUnic,
      invoiceNumber,
      hash,
    });

    // Build form body
    const formBody = new URLSearchParams({
      CodUnic: codUnic,
      Hash: hash,
      Numar: invoiceNumber,
      ...(order.invoiceSeries ? { Serie: order.invoiceSeries } : {}),
      PlatformaURL: creds.platformUrl || "https://api.fgo.ro",
    }).toString();

    // Send storno request
    const response = await fetch("https://api.fgo.ro/v1/factura/stornare", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formBody,
    });

    const responseData = (await parseFgoJsonResponse(response, "stornare")) as {
      Success: boolean;
      Message?: string;
    };

    if (responseData.Success) {
      // Update order
      await ctx.runMutation(api.orders.updateInvoice, {
        orderId: args.orderId,
        invoiceNumber: order.invoiceNumber,
        invoiceSeries: order.invoiceSeries,
        invoiceStatus: "storno",
      });

      return { success: true };
    } else {
      throw new ConvexError(`FGO: ${responseData.Message || "Eroare la anularea facturii"}`);
    }
  },
});

// Batch storno invoices
export const stornoBatchInvoices = action({
  args: {
    token: v.string(),
    orderIds: v.array(v.id("shopifyOrders")),
  },
  handler: async (ctx, args): Promise<BatchInvoiceResult> => {
    const results: BatchInvoiceResult["results"] = [];
    
    for (let i = 0; i < args.orderIds.length; i++) {
      const orderId = args.orderIds[i];
      try {
        // Get order first to check if it has invoice
        const order = await ctx.runQuery(api.orders.getById, {
          token: args.token,
          id: orderId,
        });
        
        if (!order) {
          results.push({
            orderId: orderId,
            orderNumber: "N/A",
            success: false,
            error: "Comanda nu a fost găsită",
          });
          continue;
        }
        
        if (!order.invoiceNumber) {
          results.push({
            orderId: orderId,
            orderNumber: order.orderNumber,
            success: false,
            error: "Nu are factură",
          });
          continue;
        }
        
        if (order.invoiceStatus === "storno") {
          results.push({
            orderId: orderId,
            orderNumber: order.orderNumber,
            success: false,
            error: "Factura este deja stornată",
          });
          continue;
        }
        
        await ctx.runAction(api.fgo.stornoInvoice, {
          token: args.token,
          orderId,
        });
        
        results.push({
          orderId: orderId,
          orderNumber: order.orderNumber,
          success: true,
          invoice: {
            number: order.invoiceNumber,
            series: order.invoiceSeries || "",
          },
        });
      } catch (error: unknown) {
        const order = await ctx.runQuery(api.orders.getById, {
          token: args.token,
          id: orderId,
        });
        results.push({
          orderId: orderId,
          orderNumber: order?.orderNumber || "N/A",
          success: false,
          error: error instanceof Error ? error.message : "Eroare necunoscută",
        });
      }

      // Respect FGO API limits in bulk processing.
      if (i < args.orderIds.length - 1) {
        await delay(1000);
      }
    }
    
    return {
      results,
      summary: {
        total: args.orderIds.length,
        successful: results.filter((r: BatchInvoiceResult["results"][0]) => r.success).length,
        failed: results.filter((r: BatchInvoiceResult["results"][0]) => !r.success).length,
      },
    };
  },
});

export const getInvoicePdf = action({
  args: {
    token: v.string(),
    orderId: v.id("shopifyOrders"),
  },
  returns: v.object({
    success: v.literal(true),
    pdfUrl: v.string(),
    pdf: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<PdfResult> => {
    // Get user
    const user = await ctx.runQuery(api.auth.getCurrentUser, {
      token: args.token,
    });
    if (!user) {
      throw new ConvexError("Sesiune invalidă. Te rugăm să te autentifici din nou.");
    }

    // Get order
    const order = await ctx.runQuery(api.orders.getById, {
      token: args.token,
      id: args.orderId,
    });
    if (!order) {
      throw new ConvexError("Comanda nu a fost găsită.");
    }

    if (!order.invoiceNumber) {
      throw new ConvexError("Comanda nu are factură.");
    }

    // Get FGO connection
    const connection = await ctx.runQuery(api.connections.getByType, {
      token: args.token,
      connectionType: "fgo",
    });
    if (!connection) {
      throw new ConvexError("FGO nu este configurat. Mergi la Connections.");
    }

    const creds = connection.credentials as {
      vatNumber: string;
      apiKey: string;
      platformUrl?: string;
    };

    // Extract bare CUI number (strip "RO" prefix)
    const codUnic = extractCUI(creds.vatNumber).normalize("NFC");
    const normalizedApiKey = creds.apiKey.trim().normalize("NFC");
    const invoiceNumber = order.invoiceNumber.trim();

    // Calculate hash for print: SHA-1(CodUnic + PrivateKey + InvoiceNumber)
    const hashInput = `${codUnic}${normalizedApiKey}${invoiceNumber}`;
    const hash = await sha1(hashInput);

    console.log("[FGO Print] Debug:", {
      codUnic,
      invoiceNumber,
      invoiceSeries: order.invoiceSeries,
      hash,
    });

    // Build form body
    const formBody = new URLSearchParams({
      CodUnic: codUnic,
      Hash: hash,
      Numar: invoiceNumber,
      ...(order.invoiceSeries ? { Serie: order.invoiceSeries } : {}),
      PlatformaURL: creds.platformUrl || "https://api.fgo.ro",
    }).toString();

    console.log("[FGO Print] Request body:", formBody);

    // Get PDF URL
    const response = await fetch("https://api.fgo.ro/v1/factura/print", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formBody,
    });

    const responseData = (await parseFgoJsonResponse(response, "print")) as {
      Success: boolean;
      Message?: string;
      Factura?: {
        Numar: string;
        Serie: string;
        Link?: string;
      };
    };

    console.log("[FGO Print] Response:", JSON.stringify(responseData));

    // Link is inside Factura object, not at top level
    const pdfLink = responseData.Factura?.Link;

    if (responseData.Success && pdfLink) {
      // Also fetch the PDF content as base64 for merging multiple PDFs
      let pdfBase64: string | undefined;
      try {
        const pdfResponse = await fetch(pdfLink);
        if (pdfResponse.ok) {
          const pdfBuffer = await pdfResponse.arrayBuffer();
          const bytes = new Uint8Array(pdfBuffer);
          let binary = "";
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          pdfBase64 = btoa(binary);
        }
      } catch (e) {
        console.log("[FGO Print] Could not fetch PDF content for merging:", e);
      }
      
      return {
        success: true,
        pdfUrl: pdfLink,
        pdf: pdfBase64,
      };
    } else {
      throw new ConvexError(`FGO: ${responseData.Message || "Nu s-a putut genera PDF-ul facturii"} [debug: hashInput=${hashInput}, invoiceNumber=${invoiceNumber}, series=${order.invoiceSeries}]`);
    }
  },
});

// ========== TEST FUNCTION ==========
// Tests FGO print endpoint with multiple hash/param combinations to diagnose issues
type TestFgoResult = {
  rawVatNumber: string;
  cuiOnly: string;
  invoiceNumber: string;
  invoiceSeries: string;
  results: Array<{
    test: string;
    success: boolean;
    message: string;
    hash: string;
  }>;
};

export const testFgoHash = action({
  args: {
    token: v.string(),
    orderId: v.id("shopifyOrders"),
  },
  handler: async (ctx, args): Promise<TestFgoResult> => {
    // Get user
    const user = await ctx.runQuery(api.auth.getCurrentUser, {
      token: args.token,
    });
    if (!user) throw new ConvexError("Invalid session");

    // Get order
    const order: { invoiceNumber?: string; invoiceSeries?: string; [key: string]: unknown } | null = await ctx.runQuery(api.orders.getById, {
      token: args.token,
      id: args.orderId,
    });
    if (!order) throw new ConvexError("Order not found");
    if (!order.invoiceNumber) throw new ConvexError("Order has no invoice");

    // Get FGO connection
    const connection = await ctx.runQuery(api.connections.getByType, {
      token: args.token,
      connectionType: "fgo",
    });
    if (!connection) throw new ConvexError("FGO not configured");

    const creds = connection.credentials as {
      vatNumber: string;
      apiKey: string;
      platformUrl?: string;
    };

    const rawVatNumber = creds.vatNumber.trim();
    const cuiOnly = extractCUI(rawVatNumber);
    const apiKey = creds.apiKey.trim();
    const invoiceNum = order.invoiceNumber!.trim();
    const series = order.invoiceSeries || "";
    const platformUrl = creds.platformUrl || "https://api.fgo.ro";

    console.log("=== FGO HASH TEST START ===");
    console.log("Raw vatNumber from settings:", JSON.stringify(rawVatNumber));
    console.log("Extracted CUI:", JSON.stringify(cuiOnly));
    console.log("API Key length:", apiKey.length);
    console.log("Invoice number:", JSON.stringify(invoiceNum));
    console.log("Invoice series:", JSON.stringify(series));
    console.log("Platform URL:", JSON.stringify(platformUrl));

    type TestResult = {
      testName: string;
      codUnicUsed: string;
      hashInput: string;
      hash: string;
      withSerie: boolean;
      platformUrlKey: string;
      response: unknown;
    };
    const results: TestResult[] = [];

    // We'll test the /factura/print endpoint (read-only, non-destructive)
    const testCombinations = [
      // Test 1: CUI only, with Serie, PlatformaURL
      { codUnic: cuiOnly, withSerie: true, urlKey: "PlatformaURL", label: "CUI-only + Serie + PlatformaURL" },
      // Test 2: CUI only, without Serie, PlatformaURL
      { codUnic: cuiOnly, withSerie: false, urlKey: "PlatformaURL", label: "CUI-only + NO Serie + PlatformaURL" },
      // Test 3: Raw vatNumber (with RO if present), with Serie, PlatformaURL
      { codUnic: rawVatNumber, withSerie: true, urlKey: "PlatformaURL", label: "Raw-VAT + Serie + PlatformaURL" },
      // Test 4: Raw vatNumber, without Serie, PlatformaURL
      { codUnic: rawVatNumber, withSerie: false, urlKey: "PlatformaURL", label: "Raw-VAT + NO Serie + PlatformaURL" },
      // Test 5: CUI only, with Serie, PlatformaUrl (lowercase)
      { codUnic: cuiOnly, withSerie: true, urlKey: "PlatformaUrl", label: "CUI-only + Serie + PlatformaUrl (lowercase)" },
      // Test 6: CUI only, without Serie, PlatformaUrl (lowercase)
      { codUnic: cuiOnly, withSerie: false, urlKey: "PlatformaUrl", label: "CUI-only + NO Serie + PlatformaUrl (lowercase)" },
    ];

    for (const test of testCombinations) {
      const hashInput = `${test.codUnic}${apiKey}${invoiceNum}`;
      const hash = await sha1(hashInput);

      const params: Record<string, string> = {
        CodUnic: test.codUnic,
        Hash: hash,
        Numar: invoiceNum,
      };
      if (test.withSerie && series) {
        params.Serie = series;
      }
      params[test.urlKey] = platformUrl;

      const formBody = new URLSearchParams(params).toString();

      console.log(`\n--- TEST: ${test.label} ---`);
      console.log("CodUnic:", JSON.stringify(test.codUnic));
      console.log("Hash input:", JSON.stringify(`${test.codUnic}${"*".repeat(Math.min(apiKey.length, 4))}...${invoiceNum}`));
      console.log("Hash:", hash);
      console.log("Params:", JSON.stringify(params));
      console.log("Form body:", formBody);

      try {
        const response = await fetch("https://api.fgo.ro/v1/factura/print", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: formBody,
        });

        let data: Record<string, unknown>;
        const raw = await response.text();
        try {
          data = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          data = {
            Success: false,
            Message: `Non-JSON response (status ${response.status})`,
            Raw: raw.slice(0, 300),
          };
        }
        console.log("Response:", JSON.stringify(data));

        results.push({
          testName: test.label,
          codUnicUsed: test.codUnic,
          hashInput: `${test.codUnic}[KEY]${invoiceNum}`,
          hash,
          withSerie: test.withSerie,
          platformUrlKey: test.urlKey,
          response: data,
        });
      } catch (err) {
        console.log("Fetch error:", err);
        results.push({
          testName: test.label,
          codUnicUsed: test.codUnic,
          hashInput: `${test.codUnic}[KEY]${invoiceNum}`,
          hash,
          withSerie: test.withSerie,
          platformUrlKey: test.urlKey,
          response: { fetchError: String(err) },
        });
      }
    }

    console.log("\n=== FGO HASH TEST RESULTS SUMMARY ===");
    for (const r of results) {
      const resp = r.response as { Success?: boolean; Message?: string };
      console.log(`${resp.Success ? "✅" : "❌"} ${r.testName} => ${resp.Success ? "SUCCESS" : resp.Message || "FAILED"}`);
    }
    console.log("=== FGO HASH TEST END ===");

    return {
      rawVatNumber,
      cuiOnly,
      invoiceNumber: invoiceNum,
      invoiceSeries: series,
      results: results.map((r) => ({
        test: r.testName,
        success: (r.response as { Success?: boolean }).Success || false,
        message: (r.response as { Message?: string }).Message || "",
        hash: r.hash,
      })),
    };
  },
});
