import { action, internalAction } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { api, internal } from "./_generated/api";

// Shopify API integration for order syncing

// Romanian county name → Shopify province_code mapping (ISO 3166-2:RO)
const RO_PROVINCE_CODES: Record<string, string> = {
  "alba": "AB", "arad": "AR", "arges": "AG", "argeș": "AG",
  "bacau": "BC", "bacău": "BC", "bihor": "BH",
  "bistrita-nasaud": "BN", "bistrița-năsăud": "BN", "bistrita nasaud": "BN",
  "botosani": "BT", "botoșani": "BT",
  "brasov": "BV", "brașov": "BV",
  "braila": "BR", "brăila": "BR",
  "bucuresti": "B", "bucurești": "B", "bucharest": "B",
  "buzau": "BZ", "buzău": "BZ",
  "caras-severin": "CS", "caraș-severin": "CS", "caras severin": "CS",
  "calarasi": "CL", "călărași": "CL", "călărasi": "CL",
  "cluj": "CJ",
  "constanta": "CT", "constanța": "CT",
  "covasna": "CV",
  "dambovita": "DB", "dâmbovița": "DB", "dambovița": "DB",
  "dolj": "DJ",
  "galati": "GL", "galați": "GL",
  "giurgiu": "GR",
  "gorj": "GJ",
  "harghita": "HR",
  "hunedoara": "HD",
  "ialomita": "IL", "ialomița": "IL",
  "iasi": "IS", "iași": "IS",
  "ilfov": "IF",
  "maramures": "MM", "maramureș": "MM",
  "mehedinti": "MH", "mehedinți": "MH",
  "mures": "MS", "mureș": "MS",
  "neamt": "NT", "neamț": "NT",
  "olt": "OT",
  "prahova": "PH",
  "satu mare": "SM", "satu-mare": "SM",
  "salaj": "SJ", "sălaj": "SJ",
  "sibiu": "SB",
  "suceava": "SV",
  "teleorman": "TR",
  "timis": "TM", "timiș": "TM",
  "tulcea": "TL",
  "vaslui": "VS",
  "valcea": "VL", "vâlcea": "VL",
  "vrancea": "VN",
};

function lookupRoProvinceCode(countyName: string): string | null {
  const key = countyName.toLowerCase().trim()
    .replace(/^județul\s+/i, "")
    .replace(/\s+county$/i, "");
  return RO_PROVINCE_CODES[key] || null;
}

// Type definitions
type SyncResult = {
  success: true;
  totalFetched: number;
  synced: number;
  errors: number;
  message: string;
};

type FulfillResult = {
  success: true;
};

interface ShopifyOrder {
  id: number;
  name: string;
  created_at: string;
  financial_status: string;
  fulfillment_status: string | null;
  currency: string;
  total_price: string;
  subtotal_price: string;
  total_shipping_price_set?: {
    shop_money: { amount: string };
  };
  total_tax: string;
  total_discounts: string;
  note?: string; // Order notes from customer
  note_attributes?: Array<{ name: string; value: string }>; // Cart attributes (e.g., "Deschidere colet")
  customer?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
  };
  shipping_address?: {
    first_name?: string;
    last_name?: string;
    address1?: string;
    address2?: string;
    city?: string;
    province?: string;
    province_code?: string;
    zip?: string;
    country?: string;
    country_code?: string;
    phone?: string;
  };
  billing_address?: {
    first_name?: string;
    last_name?: string;
    address1?: string;
    address2?: string;
    city?: string;
    province?: string;
    zip?: string;
    country?: string;
  };
  line_items: Array<{
    id: number;
    name: string;
    sku: string;
    quantity: number;
    price: string;
    variant_title?: string;
    variant_id?: number;
    product_id?: number;
  }>;
  shipping_lines?: Array<{
    title: string;
    price: string;
  }>;
  tax_lines?: Array<{
    title: string;
    price: string;
    rate: number;
  }>;
  discount_codes?: Array<{
    code: string;
    amount: string;
    type: string;
  }>;
  gateway?: string;
  payment_gateway_names?: string[];
}

type TransformedOrder = ReturnType<typeof transformOrder>;

function normalizeBucharestSectorCity(
  city?: string | null,
  postalCode?: string | null,
  countyOrState?: string | null
): string {
  const cityRaw = (city || "").trim();
  const countyRaw = (countyOrState || "").trim();
  const postalRaw = (postalCode || "").trim();
  if (!cityRaw) return "";

  const cityNorm = cityRaw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const countyNorm = countyRaw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const explicitSector = cityNorm.match(/^sector(?:ul)?\s*([1-6])$/);
  if (explicitSector) {
    return `Sectorul ${explicitSector[1]}`;
  }

  const isBucharest = cityNorm === "bucuresti" || cityNorm === "bucharest" || countyNorm.includes("bucure");
  if (!isBucharest) return cityRaw;

  if (postalRaw.length >= 2 && postalRaw.startsWith("0")) {
    const sectorDigit = postalRaw[1];
    if (["1", "2", "3", "4", "5", "6"].includes(sectorDigit)) {
      return `Sectorul ${sectorDigit}`;
    }
  }

  return cityRaw;
}

function transformOrder(order: ShopifyOrder, shopDomain?: string) {
  const customerName = order.customer
    ? `${order.customer.first_name || ""} ${order.customer.last_name || ""}`.trim()
    : order.shipping_address
    ? `${order.shipping_address.first_name || ""} ${order.shipping_address.last_name || ""}`.trim()
    : "Unknown";

  const customerPhone =
    order.shipping_address?.phone ||
    order.customer?.phone ||
    "";

  const shippingAddress = order.shipping_address
    ? {
        line1: order.shipping_address.address1 || "",
        line2: order.shipping_address.address2 || "",
        city: normalizeBucharestSectorCity(
          order.shipping_address.city || "",
          order.shipping_address.zip || "",
          order.shipping_address.province || ""
        ),
        state: order.shipping_address.province || "",
        stateCode: order.shipping_address.province_code || "",
        postalCode: order.shipping_address.zip || "",
        country: order.shipping_address.country || "Romania",
        countryCode: order.shipping_address.country_code || "RO",
      }
    : null;

  const billingAddress = order.billing_address
    ? {
        line1: order.billing_address.address1 || "",
        line2: order.billing_address.address2 || "",
        city: order.billing_address.city || "",
        state: order.billing_address.province || "",
        postalCode: order.billing_address.zip || "",
        country: order.billing_address.country || "Romania",
      }
    : null;

  const items = order.line_items.map((item) => ({
    id: item.id,
    name: item.name,
    sku: item.sku || "",
    quantity: item.quantity,
    price: parseFloat(item.price),
    variantTitle: item.variant_title || "",
    variantId: item.variant_id?.toString() || "",
    productId: item.product_id?.toString() || "",
  }));

  const totalShipping = order.total_shipping_price_set
    ? parseFloat(order.total_shipping_price_set.shop_money.amount)
    : order.shipping_lines
    ? order.shipping_lines.reduce((sum, line) => sum + parseFloat(line.price), 0)
    : 0;

  // Determine payment method
  let paymentMethod = "Unknown";
  if (order.gateway) {
    paymentMethod = order.gateway;
  } else if (order.payment_gateway_names && order.payment_gateway_names.length > 0) {
    paymentMethod = order.payment_gateway_names[0];
  }
  
  // Collect all gateway names to check for COD (primary gateway + all payment_gateway_names)
  const allGatewayNames = [
    paymentMethod,
    ...(order.payment_gateway_names || []),
  ].map(name => name.toLowerCase());
  
  // Check for COD across all gateway names
  const isCodGateway = allGatewayNames.some(name =>
    name.includes("cash") ||
    name.includes("cod") ||
    name.includes("ramburs") ||
    name.includes("la livrare") ||
    name.includes("plata la") ||
    name.includes("cash_on_delivery")
  );
  
  // Also detect COD when payment is pending and gateway is not a known online method
  // Covers: "manual" gateway, "Unknown" (missing gateway), or any unrecognized COD plugin
  const knownOnlineMethods = ["shopify_payments", "stripe", "paypal", "card", "credit", "debit", "gpay", "apple_pay", "google_pay"];
  const isKnownOnline = knownOnlineMethods.some(p => paymentMethod.toLowerCase().includes(p));
  const isPendingCod = order.financial_status === "pending" && !isKnownOnline;
  
  if (isCodGateway || isPendingCod) {
    paymentMethod = "COD";
  }

  // Determine status
  let status = "on_hold";
  if (order.financial_status === "paid" || order.financial_status === "partially_paid") {
    status = "ready";
  }

  // Check for "deschidere colet/livrare" (open package at delivery) in:
  // 1. shipping_lines title (e.g., "LIVRARE CU VERIFICARE COLET")
  // 2. note_attributes (cart attributes)
  // 3. note (free-form order notes)
  const noteAttributes = order.note_attributes || [];
  const shippingLines = order.shipping_lines || [];
  const openPackagePatterns = [
    /deschidere/i,
    /verificare.*colet/i,
    /verificare colet/i,
    /open.*package/i,
    /check.*delivery/i,
  ];
  
  // Check shipping method title first (most common)
  const shippingMethodHasOpenPackage = shippingLines.some((line) => 
    openPackagePatterns.some(p => p.test(line.title || ""))
  );
  
  // Check note_attributes
  const noteAttrHasOpenPackage = noteAttributes.some((attr) => {
    const nameMatch = openPackagePatterns.some(p => p.test(attr.name));
    const valueMatch = attr.value?.toLowerCase() === "da" || 
                       attr.value?.toLowerCase() === "yes" || 
                       attr.value?.toLowerCase() === "true" ||
                       attr.value === "1";
    return nameMatch && valueMatch;
  });
  
  // Check order note
  const noteHasOpenPackage = order.note && openPackagePatterns.some(p => p.test(order.note || ""));

  // Debug discount calculation
  const _debugLineItemsTotal = items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
  const _debugSubtotal = parseFloat(order.subtotal_price) || 0;
  console.log("[Shopify Sync Debug]", order.name, {
    total_discounts_raw: order.total_discounts,
    total_discounts_parsed: parseFloat(order.total_discounts),
    lineItemsTotal: _debugLineItemsTotal,
    subtotal: _debugSubtotal,
    computedDiscount: Math.round((_debugLineItemsTotal - _debugSubtotal) * 100) / 100,
    discount_codes: order.discount_codes,
  });

  return {
    shopifyOrderId: order.id.toString(),
    orderNumber: order.name,
    status,
    fulfillmentStatus: order.fulfillment_status || "unfulfilled",
    paymentStatus: order.financial_status,
    placedOn: order.created_at.split("T")[0],
    paymentMethod,
    totalPrice: parseFloat(order.total_price) || 0,
    subtotalPrice: parseFloat(order.subtotal_price) || 0,
    currency: order.currency || "RON",
    totalShipping,
    totalTax: parseFloat(order.total_tax) || 0,
    totalDiscounts: (() => {
      // Primary: Shopify's total_discounts field
      const shopifyDiscount = parseFloat(order.total_discounts);
      if (!isNaN(shopifyDiscount) && shopifyDiscount > 0) return shopifyDiscount;
      // Fallback: sum of line item original prices - subtotal (Shopify applies discounts to subtotal)
      const lineItemsTotal = items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
      const subtotal = parseFloat(order.subtotal_price) || 0;
      const computed = Math.round((lineItemsTotal - subtotal) * 100) / 100;
      return computed > 0 ? computed : 0;
    })(),
    customerName,
    customerEmail: order.customer?.email || "",
    customerPhone,
    shippingAddress,
    billingAddress,
    items,
    shippingLines: order.shipping_lines || [],
    taxLines: order.tax_lines || [],
    discountCodes: order.discount_codes || [],
    shopDomain,
    // Open package detection - use undefined instead of null for Convex compatibility
    customerNote: order.note || undefined,
    noteAttributes: noteAttributes.length > 0 ? noteAttributes : undefined,
    openPackageRequested: Boolean(shippingMethodHasOpenPackage || noteAttrHasOpenPackage || noteHasOpenPackage),
  };
}

function hasMeaningfulPostalCode(value?: string | null): boolean {
  return !!value && value.trim().length >= 4;
}

function buildAddressLookupKey(orderData: TransformedOrder): string {
  const s = orderData.shippingAddress;
  if (!s) return "";
  return [
    s.line1 || "",
    s.line2 || "",
    s.city || "",
    s.state || "",
    s.countryCode || "",
    s.country || "",
  ]
    .join("|")
    .toLowerCase()
    .trim();
}

function buildGoogleAddressString(orderData: TransformedOrder): string | null {
  const s = orderData.shippingAddress;
  if (!s) return null;
  const line1 = s.line1 || "";
  const line2 = s.line2 || "";
  const city = s.city || "";
  const state = s.state || "";
  const country = s.country || "Romania";

  // Keep address parts that help geocoding; remove apartment-level details that can hurt precision.
  const cleanedStreet = [line1, line2]
    .filter(Boolean)
    .join(", ")
    .replace(/,?\s*\bbloc\s*\.?\s*\w+/gi, "")
    .replace(/,?\s*\bbl\s*\.?\s*\d+\w*/gi, "")
    .replace(/,?\s*\bscara\s*\.?\s*\w+/gi, "")
    .replace(/,?\s*\bsc\s*\.?\s*[a-z0-9]\b/gi, "")
    .replace(/,?\s*\b(et|etaj)\s*\.?\s*\d+/gi, "")
    .replace(/,?\s*\bapartament\s*\.?\s*\d+/gi, "")
    .replace(/,?\s*\b(ap|apt)\s*\.?\s*\d+/gi, "")
    .replace(/\bnr\s*\.?\s*/gi, " ")
    .replace(/,\s*,/g, ",")
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*$/g, "")
    .trim();

  const parts = [cleanedStreet || undefined, city || undefined, state || undefined, country || undefined].filter(Boolean);
  if (parts.length < 2) return null;
  return parts.join(", ");
}

async function enrichOrderPostalCodeWithGoogle(
  orderData: TransformedOrder,
  googleApiKey: string | undefined,
  postalCodeCache?: Map<string, string | null>
): Promise<TransformedOrder> {
  if (!googleApiKey) return orderData;
  if (!orderData.shippingAddress) return orderData;
  if (hasMeaningfulPostalCode(orderData.shippingAddress.postalCode)) return orderData;

  const countryCode = (orderData.shippingAddress.countryCode || "RO").toUpperCase();
  // Keep this scoped to Romanian addresses for now to avoid unpredictable geocoding on mixed stores.
  if (countryCode !== "RO") return orderData;

  const addressString = buildGoogleAddressString(orderData);
  if (!addressString) return orderData;

  const cacheKey = buildAddressLookupKey(orderData);
  if (postalCodeCache && cacheKey && postalCodeCache.has(cacheKey)) {
    const cachedPostalCode = postalCodeCache.get(cacheKey);
    if (!cachedPostalCode) return orderData;
    return {
      ...orderData,
      shippingAddress: {
        ...orderData.shippingAddress,
        postalCode: cachedPostalCode,
      },
    };
  }

  try {
    const googleUrl =
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addressString)}` +
      `&components=${encodeURIComponent(`country:${countryCode}`)}` +
      `&key=${googleApiKey}`;
    const googleRes = await fetch(googleUrl);
    if (!googleRes.ok) {
      if (postalCodeCache && cacheKey) postalCodeCache.set(cacheKey, null);
      return orderData;
    }
    const googleData = (await googleRes.json()) as {
      status: string;
      results?: Array<{
        address_components?: Array<{ long_name: string; types: string[] }>;
        formatted_address?: string;
      }>;
    };

    const first = googleData.results?.[0];
    const postalComp = first?.address_components?.find((c) => c.types.includes("postal_code"));
    const localityComp = first?.address_components?.find((c) => c.types.includes("locality"));
    const countyComp = first?.address_components?.find((c) =>
      c.types.includes("administrative_area_level_1")
    );
    const postalCode = postalComp?.long_name?.trim() || null;

    if (postalCodeCache && cacheKey) postalCodeCache.set(cacheKey, postalCode);

    if (!postalCode) {
      console.log(`[Shopify Zip Auto] No postal code from Google for "${addressString}"`);
      return orderData;
    }

    console.log(`[Shopify Zip Auto] Filled missing postal code "${postalCode}" for "${addressString}"`);
    const normalizedCounty =
      countyComp?.long_name?.replace(/^Județul\s+/i, "").replace(/\s+County$/i, "") || "";
    const normalizedCity = normalizeBucharestSectorCity(
      localityComp?.long_name || orderData.shippingAddress.city,
      postalCode,
      normalizedCounty || orderData.shippingAddress.state
    );
    return {
      ...orderData,
      shippingAddress: {
        ...orderData.shippingAddress,
        postalCode,
        city: normalizedCity || orderData.shippingAddress.city,
        ...(normalizedCounty ? { state: normalizedCounty } : {}),
      },
    };
  } catch (error: any) {
    if (postalCodeCache && cacheKey) postalCodeCache.set(cacheKey, null);
    console.error("[Shopify Zip Auto] Google lookup error:", error?.message || error);
    return orderData;
  }
}

export const syncOrders = action({
  args: {
    token: v.string(),
    limit: v.optional(v.number()),
    status: v.optional(v.string()),
    shopDomain: v.optional(v.string()), // For multi-store: specify which store to sync
    daysBack: v.optional(v.number()), // How many days back to sync (default: 30)
  },
  handler: async (ctx, args): Promise<SyncResult> => {
    // Get user
    const user = await ctx.runQuery(api.auth.getCurrentUser, {
      token: args.token,
    });
    if (!user) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    const googleApiKey = process.env.GOOGLE_GEOCODING_API_KEY;
    let baseUrl: string;
    let accessToken: string;
    let shopDomainResolved: string;

    // If shopDomain provided, use OAuth store connection
    if (args.shopDomain) {
      const storeAuth = await ctx.runQuery(api.shopifyOauth.getStoreAccessToken, {
        token: args.token,
        shopDomain: args.shopDomain,
      });
      
      if (!storeAuth) {
        throw new ConvexError(`Magazinul ${args.shopDomain} nu este conectat.`);
      }
      
      baseUrl = storeAuth.shopUrl;
      accessToken = storeAuth.accessToken;
      shopDomainResolved = storeAuth.shopDomain;
    } else {
      // Try OAuth stores first (get primary), then fall back to legacy connections
      const storeAuth = await ctx.runQuery(api.shopifyOauth.getStoreAccessToken, {
        token: args.token,
      });
      
      if (storeAuth) {
        baseUrl = storeAuth.shopUrl;
        accessToken = storeAuth.accessToken;
        shopDomainResolved = storeAuth.shopDomain;
      } else {
        // Fall back to legacy connection
        const connection = await ctx.runQuery(api.connections.getByType, {
          token: args.token,
          connectionType: "shopify",
        });

        const oauthConnection = await ctx.runQuery(api.connections.getByType, {
          token: args.token,
          connectionType: "shopify_oauth",
        });

        const shopifyConnection = connection || oauthConnection;
        if (!shopifyConnection) {
          throw new ConvexError("Shopify nu este conectat. Configurează în Connections.");
        }

        const creds = shopifyConnection.credentials as {
          shop_url?: string;
          access_token: string;
          shop_domain?: string;
        };
        baseUrl = creds.shop_url || `https://${creds.shop_domain}`;
        accessToken = creds.access_token;
        shopDomainResolved = creds.shop_domain || new URL(baseUrl).hostname;
      }
    }

    // Build query params - use small batches to avoid memory issues
    const limit = 50; // Batch size per page
    const status = args.status || "any";
    const apiVersion = "2023-10";
    const daysBack = args.daysBack ?? 90; // Default to 90 days (increased from 30)

    // Calculate date filter (ISO format for Shopify API)
    const minDate = new Date();
    minDate.setDate(minDate.getDate() - daysBack);
    const createdAtMin = minDate.toISOString();

    let pageInfo: string | null = null;
    let hasNextPage = true;
    let totalFetched = 0;
    let synced = 0;
    const maxPages = 50; // 50 pages x 50 = ~2500 orders max (increased from 20)
    let pageCount = 0;

    // Paginated fetch - process each page as a batch
    // Order by created_at desc to get most recent first
    const postalCodeCache = new Map<string, string | null>();
    while (hasNextPage && pageCount < maxPages) {
      const url: string = pageInfo
        ? `${baseUrl}/admin/api/${apiVersion}/orders.json?page_info=${pageInfo}&limit=${limit}`
        : `${baseUrl}/admin/api/${apiVersion}/orders.json?status=${status}&limit=${limit}&created_at_min=${encodeURIComponent(createdAtMin)}&order=created_at+desc`;

      const response: Response = await fetch(url, {
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new ConvexError(`Shopify: Eroare API (${response.status}). ${errorText}`);
      }

      const data = await response.json() as { orders?: ShopifyOrder[] };
      const orders: ShopifyOrder[] = data.orders || [];
      totalFetched += orders.length;
      pageCount++;

      // Transform orders for batch insert
      if (orders.length > 0) {
        const transformedOrders = await Promise.all(
          orders.map(async (order) => {
            const transformed = transformOrder(order, shopDomainResolved);
            return enrichOrderPostalCodeWithGoogle(transformed, googleApiKey, postalCodeCache);
          })
        );
        
        // Use batch mutation - much more memory efficient
        const result = await ctx.runMutation(api.orders.upsertBatch, {
          token: args.token,
          orders: transformedOrders,
        });
        synced += result.synced;
      }

      // Check for pagination
      const linkHeader: string | null = response.headers.get("Link");
      if (linkHeader) {
        const nextMatch: RegExpMatchArray | null = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        if (nextMatch) {
          const nextUrl: URL = new URL(nextMatch[1]);
          pageInfo = nextUrl.searchParams.get("page_info");
          hasNextPage = true;
        } else {
          hasNextPage = false;
        }
      } else {
        hasNextPage = false;
      }
    }

    return {
      success: true,
      totalFetched,
      synced,
      errors: 0,
      message: `Sincronizate ${synced} comenzi (ultimele ${daysBack} zile)`,
    };
  },
});

export const fulfillOrder = action({
  args: {
    token: v.string(),
    orderId: v.id("shopifyOrders"),
    trackingNumber: v.string(),
    trackingCompany: v.optional(v.string()),
    notifyCustomer: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<FulfillResult> => {
    // Get user
    const user = await ctx.runQuery(api.auth.getCurrentUser, {
      token: args.token,
    });
    if (!user) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    // Get order
    const order = await ctx.runQuery(api.orders.getById, {
      token: args.token,
      id: args.orderId,
    });
    if (!order) {
      throw new ConvexError("Comanda nu a fost găsită.");
    }

    let baseUrl: string;
    let accessToken: string;

    // If order has shopDomain, use that store's connection
    if (order.shopDomain) {
      const storeAuth = await ctx.runQuery(api.shopifyOauth.getStoreAccessToken, {
        token: args.token,
        shopDomain: order.shopDomain,
      });
      
      if (storeAuth) {
        baseUrl = storeAuth.shopUrl;
        accessToken = storeAuth.accessToken;
      } else {
        throw new ConvexError(`Magazinul ${order.shopDomain} nu este conectat.`);
      }
    } else {
      // Fall back to primary OAuth store or legacy connection
      const storeAuth = await ctx.runQuery(api.shopifyOauth.getStoreAccessToken, {
        token: args.token,
      });
      
      if (storeAuth) {
        baseUrl = storeAuth.shopUrl;
        accessToken = storeAuth.accessToken;
      } else {
        // Legacy connection
        const connection = await ctx.runQuery(api.connections.getByType, {
          token: args.token,
          connectionType: "shopify",
        });
        const oauthConnection = await ctx.runQuery(api.connections.getByType, {
          token: args.token,
          connectionType: "shopify_oauth",
        });

        const shopifyConnection = connection || oauthConnection;
        if (!shopifyConnection) {
          throw new ConvexError("Shopify nu este conectat.");
        }

        const creds = shopifyConnection.credentials as {
          shop_url?: string;
          access_token: string;
          shop_domain?: string;
        };
        baseUrl = creds.shop_url || `https://${creds.shop_domain}`;
        accessToken = creds.access_token;
      }
    }
    
    const apiVersion = "2023-10";

    // First, get fulfillment orders
    const fulfillmentOrdersResponse = await fetch(
      `${baseUrl}/admin/api/${apiVersion}/orders/${order.shopifyOrderId}/fulfillment_orders.json`,
      {
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
      }
    );

    if (!fulfillmentOrdersResponse.ok) {
      throw new ConvexError("Shopify: Nu s-au putut obține datele de fulfillment.");
    }

    const fulfillmentOrdersData = await fulfillmentOrdersResponse.json() as {
      fulfillment_orders?: Array<{ id: number; status: string }>;
    };
    const fulfillmentOrders = fulfillmentOrdersData.fulfillment_orders || [];

    if (fulfillmentOrders.length === 0) {
      throw new ConvexError("Shopify: Nu s-au găsit date de fulfillment pentru această comandă.");
    }

    // Create fulfillment for each fulfillment order
    for (const fo of fulfillmentOrders) {
      if (fo.status === "open" || fo.status === "in_progress") {
        const response = await fetch(
          `${baseUrl}/admin/api/${apiVersion}/fulfillments.json`,
          {
            method: "POST",
            headers: {
              "X-Shopify-Access-Token": accessToken,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              fulfillment: {
                line_items_by_fulfillment_order: [
                  {
                    fulfillment_order_id: fo.id,
                  },
                ],
                tracking_info: {
                  number: args.trackingNumber,
                  company: args.trackingCompany || "Sameday",
                  url: `https://www.sameday.ro/tracking?awb=${args.trackingNumber}`,
                },
                notify_customer: args.notifyCustomer !== false,
              },
            }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Fulfillment error:", errorText);
        }
      }
    }

    // Update local order
    await ctx.runMutation(api.orders.updateTracking, {
      orderId: args.orderId,
      trackingNumber: args.trackingNumber,
      fulfillmentStatus: "fulfilled",
    });

    return { success: true };
  },
});

// Sync products/SKUs from Shopify to local database
export const syncProducts = action({
  args: {
    token: v.string(),
    shopDomain: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ success: boolean; synced: number; message: string }> => {
    // Get user
    const user = await ctx.runQuery(api.auth.getCurrentUser, {
      token: args.token,
    });
    if (!user) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    let baseUrl: string;
    let accessToken: string;
    let syncShopDomain: string;
    let storeCurrency: string | undefined;

    // Get store connection
    if (args.shopDomain) {
      const storeAuth = await ctx.runQuery(api.shopifyOauth.getStoreAccessToken, {
        token: args.token,
        shopDomain: args.shopDomain,
      });
      if (!storeAuth) throw new ConvexError(`Magazinul ${args.shopDomain} nu este conectat.`);
      baseUrl = storeAuth.shopUrl;
      accessToken = storeAuth.accessToken;
      syncShopDomain = storeAuth.shopDomain;
      storeCurrency = storeAuth.currency;
    } else {
      const storeAuth = await ctx.runQuery(api.shopifyOauth.getStoreAccessToken, {
        token: args.token,
      });
      if (!storeAuth) throw new ConvexError("No Shopify store connected");
      baseUrl = storeAuth.shopUrl;
      accessToken = storeAuth.accessToken;
      syncShopDomain = storeAuth.shopDomain;
      storeCurrency = storeAuth.currency;
    }

    const apiVersion = "2024-01";
    let pageInfo: string | null = null;
    let hasNextPage = true;
    let synced = 0;
    let totalProducts = 0;
    let pageCount = 0;
    const maxPages = 5; // Limit pages to prevent memory issues

    // Fetch inventory levels first (this is lighter)
    const locationResponse = await fetch(
      `${baseUrl}/admin/api/${apiVersion}/locations.json`,
      {
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
      }
    );
    
    let inventoryLevels: Record<string, number> = {};
    if (locationResponse.ok) {
      const locationData = await locationResponse.json();
      const locations = locationData.locations || [];
      
      // Get inventory for first location only to save memory
      if (locations.length > 0) {
        const invResponse = await fetch(
          `${baseUrl}/admin/api/${apiVersion}/inventory_levels.json?location_ids=${locations[0].id}&limit=250`,
          {
            headers: {
              "X-Shopify-Access-Token": accessToken,
              "Content-Type": "application/json",
            },
          }
        );
        
        if (invResponse.ok) {
          const invData = await invResponse.json();
          for (const level of invData.inventory_levels || []) {
            const key = level.inventory_item_id.toString();
            inventoryLevels[key] = level.available || 0;
          }
        }
      }
    }

    // Process products page by page (don't accumulate in memory)
    while (hasNextPage && pageCount < maxPages) {
      const productUrl: string = pageInfo
        ? `${baseUrl}/admin/api/${apiVersion}/products.json?page_info=${pageInfo}&limit=50`
        : `${baseUrl}/admin/api/${apiVersion}/products.json?limit=50`;

      const productResponse: Response = await fetch(productUrl, {
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
      });

      if (!productResponse.ok) {
        const errorText = await productResponse.text();
        throw new ConvexError(`Shopify: Eroare API (${productResponse.status}). ${errorText}`);
      }

      const data = await productResponse.json();
      const products = data.products || [];
      totalProducts += products.length;
      pageCount++;

      // Process this batch immediately
      for (const product of products) {
        for (const variant of product.variants || []) {
          // Skip variants without a real SKU to avoid junk entries
          if (!variant.sku || variant.sku.trim() === "") {
            console.log(`Skipping variant ${variant.id} (no SKU) for product "${product.title}"`);
            continue;
          }
          const sku = variant.sku.trim();
          const stock = inventoryLevels[variant.inventory_item_id?.toString()] || 0;
          const displayName = variant.title === "Default Title" ? product.title : `${product.title} - ${variant.title}`;
          
          try {
            // Upsert the base SKU
            await ctx.runMutation(api.skus.upsertFromShopify, {
              token: args.token,
              sku,
              name: displayName,
              description: product.body_html ? product.body_html.replace(/<[^>]*>/g, '').slice(0, 500) : undefined,
              category: product.product_type || undefined,
              costPrice: variant.compare_at_price ? parseFloat(variant.compare_at_price) : undefined,
              sellPrice: parseFloat(variant.price),
              currentStock: stock,
              barcode: variant.barcode || undefined,
              weight: variant.weight ? parseFloat(variant.weight) : undefined,
              imageUrl: product.image?.src || undefined,
              shopifyProductId: product.id.toString(),
              shopifyVariantId: variant.id.toString(),
            });

            // Also save per-store override (name, price, currency for this specific store)
            await ctx.runMutation(api.skus.upsertStoreOverride, {
              token: args.token,
              sku,
              shopDomain: syncShopDomain,
              displayName,
              sellPrice: parseFloat(variant.price),
              costPrice: variant.compare_at_price ? parseFloat(variant.compare_at_price) : undefined,
              currency: storeCurrency || undefined,
            });

            synced++;
          } catch (error) {
            console.error(`Failed to sync SKU ${sku}:`, error);
          }
        }
      }

      // Check pagination
      const productLinkHeader: string | null = productResponse.headers.get("Link");
      if (productLinkHeader) {
        const productNextMatch: RegExpMatchArray | null = productLinkHeader.match(/<([^>]+)>;\s*rel="next"/);
        if (productNextMatch) {
          const productNextUrl: URL = new URL(productNextMatch[1]);
          pageInfo = productNextUrl.searchParams.get("page_info");
        } else {
          hasNextPage = false;
        }
      } else {
        hasNextPage = false;
      }
    }

    return {
      success: true,
      synced,
      message: `Sincronizate ${synced} SKU-uri din ${totalProducts} produse`,
    };
  },
});

export const fetchProducts = action({
  args: {
    token: v.string(),
    limit: v.optional(v.number()),
    shopDomain: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<unknown[]> => {
    // Get user
    const user = await ctx.runQuery(api.auth.getCurrentUser, {
      token: args.token,
    });
    if (!user) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    let baseUrl: string;
    let accessToken: string;

    // If shopDomain provided, use that store
    if (args.shopDomain) {
      const storeAuth = await ctx.runQuery(api.shopifyOauth.getStoreAccessToken, {
        token: args.token,
        shopDomain: args.shopDomain,
      });
      
      if (!storeAuth) {
        throw new ConvexError(`Magazinul ${args.shopDomain} nu este conectat.`);
      }
      
      baseUrl = storeAuth.shopUrl;
      accessToken = storeAuth.accessToken;
    } else {
      // Try primary OAuth store first
      const storeAuth = await ctx.runQuery(api.shopifyOauth.getStoreAccessToken, {
        token: args.token,
      });
      
      if (storeAuth) {
        baseUrl = storeAuth.shopUrl;
        accessToken = storeAuth.accessToken;
      } else {
        // Fall back to legacy connection
        const connection = await ctx.runQuery(api.connections.getByType, {
          token: args.token,
          connectionType: "shopify",
        });
        const oauthConnection = await ctx.runQuery(api.connections.getByType, {
          token: args.token,
          connectionType: "shopify_oauth",
        });

        const shopifyConnection = connection || oauthConnection;
        if (!shopifyConnection) {
          throw new ConvexError("Shopify nu este conectat.");
        }

        const creds = shopifyConnection.credentials as {
          shop_url?: string;
          access_token: string;
          shop_domain?: string;
        };
        baseUrl = creds.shop_url || `https://${creds.shop_domain}`;
        accessToken = creds.access_token;
      }
    }
    
    const apiVersion = "2023-10";
    const limit = args.limit || 250;

    const response = await fetch(
      `${baseUrl}/admin/api/${apiVersion}/products.json?limit=${limit}`,
      {
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new ConvexError("Shopify: Nu s-au putut prelua produsele.");
    }

    const data = await response.json() as { products?: unknown[] };
    return data.products || [];
  },
});

// Process incoming order webhook from Shopify
export const processOrderWebhook = action({
  args: {
    shopDomain: v.string(),
    order: v.any(),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const order = args.order as ShopifyOrder;
    const shopDomain = args.shopDomain;

    console.log(`Processing webhook order ${order.name} from ${shopDomain}`);

    // Find the store connection to get the userId
    const storeConnection = await ctx.runQuery(api.shopifyOauth.getStoreByDomain, {
      shopDomain,
    });

    if (!storeConnection) {
      console.error(`No store connection found for ${shopDomain}`);
      return { success: false };
    }

    // Transform and upsert the order
    const transformedOrder = transformOrder(order, shopDomain);
    const withPostalCode = await enrichOrderPostalCodeWithGoogle(
      transformedOrder,
      process.env.GOOGLE_GEOCODING_API_KEY
    );
    
    await ctx.runMutation(api.orders.upsertFromWebhook, {
      userId: storeConnection.userId,
      ...withPostalCode,
    });

    // Note: Stock is now deducted when order is marked as "worked" (not on arrival)
    // This ensures stock only goes down after the order is actually picked/processed

    console.log(`Successfully processed order ${order.name}`);
    return { success: true };
  },
});

// Register webhooks with Shopify for a store
export const registerWebhooks = action({
  args: {
    token: v.string(),
    shopDomain: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean; registered: string[] }> => {
    // Get user
    const user = await ctx.runQuery(api.auth.getCurrentUser, {
      token: args.token,
    });
    if (!user) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    // Get store auth
    const storeAuth = await ctx.runQuery(api.shopifyOauth.getStoreAccessToken, {
      token: args.token,
      shopDomain: args.shopDomain,
    });
    
    if (!storeAuth) {
      throw new ConvexError(`Magazinul ${args.shopDomain} nu este conectat.`);
    }

    const baseUrl = storeAuth.shopUrl;
    const accessToken = storeAuth.accessToken;
    const apiVersion = "2024-01";

    // Get the webhook URL (your Convex HTTP endpoint)
    const webhookUrl = process.env.CONVEX_SITE_URL 
      ? `${process.env.CONVEX_SITE_URL}/webhook/shopify`
      : "https://woozy-lark-822.convex.site/webhook/shopify";

    // Topics to subscribe to
    const topics = [
      "orders/create",
      "orders/updated",
      "orders/paid",
      "orders/fulfilled",
      "products/create",
      "products/update",
      "products/delete",
    ];

    const registered: string[] = [];

    // First, get existing webhooks
    const existingResponse = await fetch(
      `${baseUrl}/admin/api/${apiVersion}/webhooks.json`,
      {
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
      }
    );

    let existingTopics: string[] = [];
    if (existingResponse.ok) {
      const existingData = await existingResponse.json();
      existingTopics = (existingData.webhooks || [])
        .filter((w: any) => w.address === webhookUrl)
        .map((w: any) => w.topic);
    }

    // Register each webhook if not already registered
    for (const topic of topics) {
      if (existingTopics.includes(topic)) {
        console.log(`Webhook ${topic} already registered for ${args.shopDomain}`);
        registered.push(topic);
        continue;
      }

      const response = await fetch(
        `${baseUrl}/admin/api/${apiVersion}/webhooks.json`,
        {
          method: "POST",
          headers: {
            "X-Shopify-Access-Token": accessToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            webhook: {
              topic,
              address: webhookUrl,
              format: "json",
            },
          }),
        }
      );

      if (response.ok) {
        console.log(`Registered webhook ${topic} for ${args.shopDomain}`);
        registered.push(topic);
      } else {
        const errorText = await response.text();
        console.error(`Failed to register webhook ${topic}:`, errorText);
      }
    }

    return { success: true, registered };
  },
});

// Process incoming product webhook from Shopify
export const processProductWebhook = action({
  args: {
    shopDomain: v.string(),
    product: v.any(),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const product = args.product;
    const shopDomain = args.shopDomain;

    console.log(`Processing product webhook: ${product.title} from ${shopDomain}`);

    // Find the store connection to get the userId
    const storeConnection = await ctx.runQuery(api.shopifyOauth.getStoreByDomain, {
      shopDomain,
    });

    if (!storeConnection) {
      console.error(`No store connection found for ${shopDomain}`);
      return { success: false };
    }

    // Process each variant as a SKU (skip variants without a real SKU)
    for (const variant of product.variants || []) {
      if (!variant.sku || variant.sku.trim() === "") {
        console.log(`Skipping variant ${variant.id} (no SKU) for product "${product.title}" from ${shopDomain}`);
        continue;
      }
      const sku = variant.sku.trim();
      const displayName = variant.title === "Default Title" ? product.title : `${product.title} - ${variant.title}`;
      
      try {
        // Upsert the base SKU
        await ctx.runMutation(api.skus.upsertFromWebhook, {
          userId: storeConnection.userId,
          sku,
          name: displayName,
          description: product.body_html ? product.body_html.replace(/<[^>]*>/g, '').slice(0, 500) : undefined,
          category: product.product_type || undefined,
          sellPrice: parseFloat(variant.price),
          barcode: variant.barcode || undefined,
          weight: variant.weight ? parseFloat(variant.weight) : undefined,
          imageUrl: product.image?.src || undefined,
          shopifyProductId: product.id.toString(),
          shopifyVariantId: variant.id.toString(),
        });

        // Also save per-store override (name, price, currency for this specific store)
        await ctx.runMutation(api.skus.upsertStoreOverrideFromWebhook, {
          userId: storeConnection.userId,
          sku,
          shopDomain,
          displayName,
          sellPrice: parseFloat(variant.price),
          costPrice: variant.compare_at_price ? parseFloat(variant.compare_at_price) : undefined,
          currency: storeConnection.currency || undefined,
        });
      } catch (error) {
        console.error(`Failed to upsert SKU ${sku}:`, error);
      }
    }

    console.log(`Successfully processed product ${product.title}`);
    return { success: true };
  },
});

// Process product deletion webhook
export const processProductDeleteWebhook = action({
  args: {
    shopDomain: v.string(),
    productId: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    console.log(`Processing product deletion: ${args.productId} from ${args.shopDomain}`);

    // Find the store connection to get the userId
    const storeConnection = await ctx.runQuery(api.shopifyOauth.getStoreByDomain, {
      shopDomain: args.shopDomain,
    });

    if (!storeConnection) {
      console.error(`No store connection found for ${args.shopDomain}`);
      return { success: false };
    }

    // Deactivate all SKUs linked to this product
    await ctx.runMutation(api.skus.deactivateByShopifyProduct, {
      userId: storeConnection.userId,
      shopifyProductId: args.productId,
    });

    console.log(`Successfully deactivated SKUs for product ${args.productId}`);
    return { success: true };
  },
});

// Update order customer details in Shopify
export const updateOrderInShopify = action({
  args: {
    token: v.string(),
    orderId: v.id("shopifyOrders"),
    customerName: v.optional(v.string()),
    customerEmail: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
    shippingAddress: v.optional(v.object({
      line1: v.optional(v.string()),
      line2: v.optional(v.string()),
      city: v.optional(v.string()),
      state: v.optional(v.string()),
      stateCode: v.optional(v.string()),
      stateEdited: v.optional(v.boolean()),
      postalCode: v.optional(v.string()),
      country: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args): Promise<{ success: boolean; message: string }> => {
    // Get user
    const user = await ctx.runQuery(api.auth.getCurrentUser, {
      token: args.token,
    });
    if (!user) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    // Get order
    const order = await ctx.runQuery(api.orders.getById, {
      token: args.token,
      id: args.orderId,
    });
    if (!order) {
      throw new ConvexError("Comanda nu a fost găsită.");
    }

    let baseUrl: string;
    let accessToken: string;

    // If order has shopDomain, use that store's connection
    if (order.shopDomain) {
      const storeAuth = await ctx.runQuery(api.shopifyOauth.getStoreAccessToken, {
        token: args.token,
        shopDomain: order.shopDomain,
      });
      
      if (storeAuth) {
        baseUrl = storeAuth.shopUrl;
        accessToken = storeAuth.accessToken;
      } else {
        throw new ConvexError(`Magazinul ${order.shopDomain} nu este conectat.`);
      }
    } else {
      // Fall back to primary OAuth store or legacy connection
      const storeAuth = await ctx.runQuery(api.shopifyOauth.getStoreAccessToken, {
        token: args.token,
      });
      
      if (storeAuth) {
        baseUrl = storeAuth.shopUrl;
        accessToken = storeAuth.accessToken;
      } else {
        // Legacy connection
        const connection = await ctx.runQuery(api.connections.getByType, {
          token: args.token,
          connectionType: "shopify",
        });
        const oauthConnection = await ctx.runQuery(api.connections.getByType, {
          token: args.token,
          connectionType: "shopify_oauth",
        });

        const shopifyConnection = connection || oauthConnection;
        if (!shopifyConnection) {
          throw new ConvexError("Shopify nu este conectat.");
        }

        const creds = shopifyConnection.credentials as {
          shop_url?: string;
          access_token: string;
          shop_domain?: string;
        };
        baseUrl = creds.shop_url || `https://${creds.shop_domain}`;
        accessToken = creds.access_token;
      }
    }

    const apiVersion = "2023-10";

    // Build update payload for Shopify
    const updatePayload: {
      order: {
        id: string;
        email?: string;
        phone?: string;
        shipping_address?: {
          first_name?: string;
          last_name?: string;
          address1?: string;
          address2?: string;
          city?: string;
          province?: string;
          province_code?: string;
          zip?: string;
          country?: string;
          phone?: string;
        };
      };
    } = {
      order: {
        id: order.shopifyOrderId,
      },
    };

    // Add email if provided
    if (args.customerEmail) {
      updatePayload.order.email = args.customerEmail;
    }

    // Add phone if provided
    if (args.customerPhone) {
      updatePayload.order.phone = args.customerPhone;
    }

    // Build shipping address update
    if (args.shippingAddress || args.customerName || args.customerPhone) {
      // Parse customer name into first and last name
      let firstName = "";
      let lastName = "";
      if (args.customerName) {
        const nameParts = args.customerName.trim().split(/\s+/);
        firstName = nameParts[0] || "";
        lastName = nameParts.slice(1).join(" ") || "";
      }

      updatePayload.order.shipping_address = {};

      if (firstName) {
        updatePayload.order.shipping_address.first_name = firstName;
      }
      if (lastName) {
        updatePayload.order.shipping_address.last_name = lastName;
      }
      if (args.shippingAddress?.line1) {
        updatePayload.order.shipping_address.address1 = args.shippingAddress.line1;
      }
      if (args.shippingAddress?.line2) {
        updatePayload.order.shipping_address.address2 = args.shippingAddress.line2;
      }
      if (args.shippingAddress?.city) {
        updatePayload.order.shipping_address.city = args.shippingAddress.city;
      }
      // Province handling: avoid diacritics/validation issues with Shopify
      const stateLower = (args.shippingAddress?.state || "").toLowerCase().trim();
      const sectorMatch = stateLower.match(/^sector(?:ul)?\s*(\d)$/);
      const provinceWasEdited = args.shippingAddress?.stateEdited === true;
      
      if (sectorMatch) {
        // Bucharest sectors: province = "B", move sector to city
        updatePayload.order.shipping_address.province_code = "B";
        if (!args.shippingAddress?.city) {
          updatePayload.order.shipping_address.city = `Sectorul ${sectorMatch[1]}`;
        }
      } else if (stateLower === "bucuresti" || stateLower === "bucurești") {
        updatePayload.order.shipping_address.province_code = "B";
      } else if (args.shippingAddress?.stateCode) {
        // Use province_code (e.g. "BT") — always safe, avoids diacritics issues
        updatePayload.order.shipping_address.province_code = args.shippingAddress.stateCode;
      } else if (provinceWasEdited && args.shippingAddress?.state) {
        // User explicitly changed the province — send their value
        updatePayload.order.shipping_address.province = args.shippingAddress.state;
      }
      // If province wasn't edited and no stateCode available: don't send province at all.
      // Shopify keeps the existing value, avoiding diacritics rejection.
      if (args.shippingAddress?.postalCode) {
        updatePayload.order.shipping_address.zip = args.shippingAddress.postalCode;
      }
      if (args.shippingAddress?.country) {
        updatePayload.order.shipping_address.country = args.shippingAddress.country;
      }
      if (args.customerPhone) {
        updatePayload.order.shipping_address.phone = args.customerPhone;
      }
    }

    // Only call Shopify if there's actually something to update beyond the order id
    const hasShopifyChanges = Object.keys(updatePayload.order).length > 1;

    // Helper: parse Shopify error response into a details string and check for province issues
    const parseShopifyError = (errorText: string): { details: string; isProvinceError: boolean } => {
      let details = "";
      let isProvinceError = false;
      try {
        const parsed = JSON.parse(errorText) as { errors?: unknown };
        const shopifyErrors = parsed?.errors;
        if (typeof shopifyErrors === "string") {
          details = shopifyErrors;
          if (/province/i.test(details)) isProvinceError = true;
        } else if (shopifyErrors && typeof shopifyErrors === "object") {
          const parts: string[] = [];
          for (const [field, value] of Object.entries(shopifyErrors as Record<string, unknown>)) {
            if (Array.isArray(value)) {
              parts.push(`${field}: ${value.join(", ")}`);
            } else if (typeof value === "string") {
              parts.push(`${field}: ${value}`);
            }
            if (/province/i.test(field) || (Array.isArray(value) && value.some((v: unknown) => typeof v === "string" && /province/i.test(v)))) {
              isProvinceError = true;
            }
          }
          details = parts.join("; ");
        }
      } catch {
        // Not JSON
      }
      if (!isProvinceError && /province/i.test(errorText)) isProvinceError = true;
      return { details, isProvinceError };
    };

    // Helper: send the update to Shopify
    const sendToShopify = async (payload: typeof updatePayload) => {
      return fetch(
        `${baseUrl}/admin/api/${apiVersion}/orders/${order.shopifyOrderId}.json`,
        {
          method: "PUT",
          headers: {
            "X-Shopify-Access-Token": accessToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );
    };

    if (hasShopifyChanges) {
      const response = await sendToShopify(updatePayload);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Shopify update error:", errorText);
        const { details, isProvinceError } = parseShopifyError(errorText);

        // ── Auto-fix province: geocode correct province and retry ──
        if (isProvinceError && updatePayload.order.shipping_address) {
          console.log("[updateOrderInShopify] Province error detected, attempting auto-fix via Google Geocoding...");
          try {
            const addr = updatePayload.order.shipping_address;
            const existingAddr = order.shippingAddress as Record<string, string> | undefined;
            const city = addr.city || existingAddr?.city || "";
            const zip = addr.zip || existingAddr?.zip || existingAddr?.zipCode || existingAddr?.postalCode || "";
            const country = addr.country || existingAddr?.country || "Romania";
            const countryCode = existingAddr?.countryCode || "RO";

            // Use Google Geocoding to find the correct province
            const googleApiKey = process.env.GOOGLE_GEOCODING_API_KEY;
            if (googleApiKey && city) {
              const geoAddress = [city, country].filter(Boolean).join(", ");
              const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(geoAddress)}&components=${encodeURIComponent(`country:${countryCode}`)}&key=${googleApiKey}`;
              const geoRes = await fetch(geoUrl);
              const geoData = (await geoRes.json()) as {
                status: string;
                results: Array<{
                  address_components: Array<{ long_name: string; short_name: string; types: string[] }>;
                }>;
              };

              if (geoData.status === "OK" && geoData.results?.length > 0) {
                const countyComp = geoData.results[0].address_components.find(
                  (c) => c.types.includes("administrative_area_level_1")
                );
                const countyName = countyComp?.long_name?.replace(/^Județul\s+/i, "").replace(/\s+County$/i, "") || "";
                const provinceCode = countryCode === "RO" ? lookupRoProvinceCode(countyName) : null;

                console.log(`[updateOrderInShopify] Google resolved province: "${countyName}" -> code: "${provinceCode || "N/A"}"`);

                if (provinceCode) {
                  // Fix payload with correct province_code and retry
                  delete updatePayload.order.shipping_address.province;
                  updatePayload.order.shipping_address.province_code = provinceCode;
                } else if (countyName) {
                  // Use the Google-resolved name (proper diacritics)
                  delete updatePayload.order.shipping_address.province_code;
                  updatePayload.order.shipping_address.province = countyName;
                }

                // Also fix zip if we got one from Google and none was set
                if (!zip) {
                  const postalComp = geoData.results[0].address_components.find(
                    (c) => c.types.includes("postal_code")
                  );
                  if (postalComp?.long_name) {
                    updatePayload.order.shipping_address.zip = postalComp.long_name;
                  }
                }

                console.log("[updateOrderInShopify] Retrying Shopify update with fixed province...");
                const retryResponse = await sendToShopify(updatePayload);

                if (retryResponse.ok) {
                  console.log("[updateOrderInShopify] Retry succeeded! Province auto-fixed.");

                  // Update local DB with the corrected province
                  const correctedShippingAddress = {
                    ...args.shippingAddress,
                    state: countyName || args.shippingAddress?.state,
                    stateCode: provinceCode || args.shippingAddress?.stateCode,
                  };
                  await ctx.runMutation(api.orders.updateCustomerDetails, {
                    token: args.token,
                    orderId: args.orderId,
                    customerName: args.customerName,
                    customerEmail: args.customerEmail,
                    customerPhone: args.customerPhone,
                    shippingAddress: correctedShippingAddress,
                  });

                  return {
                    success: true,
                    message: `Comanda actualizată. Provincia a fost corectată automat la "${countyName}".`,
                  };
                }

                // Retry also failed — fall through to error
                const retryErrorText = await retryResponse.text();
                console.error("Shopify retry also failed:", retryErrorText);
              }
            }
          } catch (autoFixErr: any) {
            console.error("[updateOrderInShopify] Province auto-fix failed:", autoFixErr.message);
          }
        }

        const compactRawError = String(errorText).replace(/\s+/g, " ").trim();
        throw new ConvexError(
          details
            ? `Shopify a respins actualizarea adresei: ${details}`
            : `Shopify a respins actualizarea comenzii (HTTP ${response.status}): ${compactRawError}`
        );
      }
    } else {
      console.log("No Shopify changes to send, skipping API call");
    }

    // Also update in local database
    await ctx.runMutation(api.orders.updateCustomerDetails, {
      token: args.token,
      orderId: args.orderId,
      customerName: args.customerName,
      customerEmail: args.customerEmail,
      customerPhone: args.customerPhone,
      shippingAddress: args.shippingAddress,
    });

    return { 
      success: true, 
      message: "Comanda a fost actualizată în Shopify și local." 
    };
  },
});

// Cancel an order in Shopify
export const cancelOrder = action({
  args: {
    token: v.string(),
    orderId: v.id("shopifyOrders"),
    reason: v.optional(v.string()), // "customer", "fraud", "inventory", "declined", "other"
    notifyCustomer: v.optional(v.boolean()),
    restock: v.optional(v.boolean()), // Restock items in Shopify inventory
  },
  handler: async (ctx, args): Promise<{ success: boolean; message: string; alreadyCancelled?: boolean }> => {
    // Get user
    const user = await ctx.runQuery(api.auth.getCurrentUser, {
      token: args.token,
    });
    if (!user) {
      throw new ConvexError("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    // Get order
    const order = await ctx.runQuery(api.orders.getById, {
      token: args.token,
      id: args.orderId,
    });
    if (!order) {
      throw new ConvexError("Comanda nu a fost găsită.");
    }

    if (!order.shopifyOrderId) {
      throw new ConvexError("Comanda nu are un ID Shopify asociat.");
    }

    // Get Shopify connection
    let baseUrl: string;
    let accessToken: string;

    if (order.shopDomain) {
      // Multi-store: use OAuth connection
      const storeAuth = await ctx.runQuery(api.shopifyOauth.getStoreAccessToken, {
        token: args.token,
        shopDomain: order.shopDomain,
      });
      if (!storeAuth) {
        throw new ConvexError(`Magazinul ${order.shopDomain} nu este conectat.`);
      }
      baseUrl = storeAuth.shopUrl;
      accessToken = storeAuth.accessToken;
    } else {
      // Legacy single-store mode
      const connection = await ctx.runQuery(api.connections.getByType, {
        token: args.token,
        connectionType: "shopify",
      });

      const oauthConnection = await ctx.runQuery(api.connections.getByType, {
        token: args.token,
        connectionType: "shopify_oauth",
      });

      const shopifyConnection = connection || oauthConnection;
      if (!shopifyConnection) {
        throw new ConvexError("Shopify nu este conectat.");
      }

      const creds = shopifyConnection.credentials as {
        shop_url?: string;
        access_token: string;
        shop_domain?: string;
      };
      baseUrl = creds.shop_url || `https://${creds.shop_domain}`;
      accessToken = creds.access_token;
    }

    const apiVersion = "2023-10";

    // Build cancel payload
    const cancelPayload: {
      reason?: string;
      email?: boolean;
      restock?: boolean;
    } = {};

    // Map reason to Shopify's expected values
    if (args.reason) {
      const validReasons = ["customer", "fraud", "inventory", "declined", "other"];
      cancelPayload.reason = validReasons.includes(args.reason) ? args.reason : "other";
    } else {
      cancelPayload.reason = "other";
    }

    cancelPayload.email = args.notifyCustomer ?? false;
    cancelPayload.restock = args.restock ?? false;

    // Send cancel request to Shopify
    const response = await fetch(
      `${baseUrl}/admin/api/${apiVersion}/orders/${order.shopifyOrderId}/cancel.json`,
      {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(cancelPayload),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Shopify cancel error:", errorText);
      
      // Check if already cancelled
      if (errorText.toLowerCase().includes("cancel") || errorText.toLowerCase().includes("already")) {
        return { 
          success: true, 
          message: "Comanda era deja anulată în Shopify.",
          alreadyCancelled: true,
        };
      }
      
      throw new ConvexError(`Eroare la anularea comenzii în Shopify: ${response.status} - ${errorText}`);
    }

    console.log(`[Shopify Cancel] Successfully cancelled order ${order.orderNumber} in Shopify`);

    return { 
      success: true, 
      message: `Comanda #${order.orderNumber} a fost anulată în Shopify.`,
    };
  },
});

// ============================================
// AUTO-SETUP: Runs after a new store is connected via OAuth
// Registers webhooks + syncs orders + syncs products automatically
// ============================================
export const autoSetupNewStore = internalAction({
  args: {
    userId: v.id("profiles"),
    shopDomain: v.string(),
  },
  handler: async (ctx, args) => {
    console.log(`[Auto-Setup] Starting auto-setup for store ${args.shopDomain}`);

    // Get store auth (internal - no user token needed)
    const storeAuth = await ctx.runQuery(internal.shopifyOauth.internalGetStoreAuth, {
      userId: args.userId,
      shopDomain: args.shopDomain,
    });

    if (!storeAuth) {
      console.error(`[Auto-Setup] Store ${args.shopDomain} not found for user ${args.userId}`);
      return;
    }

    const { shopUrl: baseUrl, accessToken } = storeAuth;

    // ---- 1. REGISTER WEBHOOKS ----
    try {
      const apiVersion = "2024-01";
      const webhookUrl = process.env.CONVEX_SITE_URL
        ? `${process.env.CONVEX_SITE_URL}/webhook/shopify`
        : "https://woozy-lark-822.convex.site/webhook/shopify";

      const topics = [
        "orders/create",
        "orders/updated",
        "orders/paid",
        "orders/fulfilled",
        "products/create",
        "products/update",
        "products/delete",
      ];

      // Get existing webhooks
      const existingResponse = await fetch(
        `${baseUrl}/admin/api/${apiVersion}/webhooks.json`,
        {
          headers: {
            "X-Shopify-Access-Token": accessToken,
            "Content-Type": "application/json",
          },
        }
      );

      let existingTopics: string[] = [];
      if (existingResponse.ok) {
        const existingData = await existingResponse.json();
        existingTopics = (existingData.webhooks || [])
          .filter((w: any) => w.address === webhookUrl)
          .map((w: any) => w.topic);
      }

      const registered: string[] = [];
      for (const topic of topics) {
        if (existingTopics.includes(topic)) {
          registered.push(topic);
          continue;
        }

        const response = await fetch(
          `${baseUrl}/admin/api/${apiVersion}/webhooks.json`,
          {
            method: "POST",
            headers: {
              "X-Shopify-Access-Token": accessToken,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              webhook: { topic, address: webhookUrl, format: "json" },
            }),
          }
        );

        if (response.ok) {
          registered.push(topic);
        } else {
          const errorText = await response.text();
          console.error(`[Auto-Setup] Failed to register webhook ${topic}:`, errorText);
        }
      }
      console.log(`[Auto-Setup] Webhooks registered for ${args.shopDomain}:`, registered);
    } catch (error) {
      console.error(`[Auto-Setup] Webhook registration failed for ${args.shopDomain}:`, error);
    }

    // ---- 2. SYNC ORDERS (last 90 days) ----
    try {
      const apiVersion = "2023-10";
      const daysBack = 90;
      const limit = 50;
      const googleApiKey = process.env.GOOGLE_GEOCODING_API_KEY;
      const minDate = new Date();
      minDate.setDate(minDate.getDate() - daysBack);
      const createdAtMin = minDate.toISOString();

      let pageInfo: string | null = null;
      let hasNextPage = true;
      let totalSynced = 0;
      let pageCount = 0;
      const maxPages = 50;
      const postalCodeCache = new Map<string, string | null>();

      while (hasNextPage && pageCount < maxPages) {
        const url: string = pageInfo
          ? `${baseUrl}/admin/api/${apiVersion}/orders.json?page_info=${pageInfo}&limit=${limit}`
          : `${baseUrl}/admin/api/${apiVersion}/orders.json?status=any&limit=${limit}&created_at_min=${encodeURIComponent(createdAtMin)}&order=created_at+desc`;

        const response: Response = await fetch(url, {
          headers: {
            "X-Shopify-Access-Token": accessToken,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          console.error(`[Auto-Setup] Orders fetch failed: ${response.status}`);
          break;
        }

        const data = await response.json() as { orders?: ShopifyOrder[] };
        const orders = data.orders || [];
        pageCount++;

        if (orders.length > 0) {
          const transformedOrders = await Promise.all(
            orders.map(async (order) => {
              const transformed = transformOrder(order, args.shopDomain);
              return enrichOrderPostalCodeWithGoogle(transformed, googleApiKey, postalCodeCache);
            })
          );
          const result = await ctx.runMutation(internal.orders.internalUpsertBatch, {
            userId: args.userId,
            orders: transformedOrders,
          });
          totalSynced += result.synced;
        }

        // Pagination
        const linkHeader: string | null = response.headers.get("Link");
        if (linkHeader) {
          const nextMatch: RegExpMatchArray | null = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
          if (nextMatch) {
            const nextUrl: URL = new URL(nextMatch[1]);
            pageInfo = nextUrl.searchParams.get("page_info");
            hasNextPage = true;
          } else {
            hasNextPage = false;
          }
        } else {
          hasNextPage = false;
        }
      }

      console.log(`[Auto-Setup] Synced ${totalSynced} orders for ${args.shopDomain}`);
    } catch (error) {
      console.error(`[Auto-Setup] Order sync failed for ${args.shopDomain}:`, error);
    }

    // ---- 3. SYNC PRODUCTS ----
    try {
      const apiVersion = "2024-01";

      // Get inventory levels
      const locationResponse = await fetch(
        `${baseUrl}/admin/api/${apiVersion}/locations.json`,
        {
          headers: {
            "X-Shopify-Access-Token": accessToken,
            "Content-Type": "application/json",
          },
        }
      );

      let inventoryLevels: Record<string, number> = {};
      if (locationResponse.ok) {
        const locationData = await locationResponse.json();
        const locations = locationData.locations || [];
        if (locations.length > 0) {
          const invResponse = await fetch(
            `${baseUrl}/admin/api/${apiVersion}/inventory_levels.json?location_ids=${locations[0].id}&limit=250`,
            {
              headers: {
                "X-Shopify-Access-Token": accessToken,
                "Content-Type": "application/json",
              },
            }
          );
          if (invResponse.ok) {
            const invData = await invResponse.json();
            for (const level of invData.inventory_levels || []) {
              inventoryLevels[level.inventory_item_id.toString()] = level.available || 0;
            }
          }
        }
      }

      // Fetch products
      let pageInfo: string | null = null;
      let hasNextPage = true;
      let synced = 0;
      let pageCount = 0;
      const maxPages = 5;

      while (hasNextPage && pageCount < maxPages) {
        const url: string = pageInfo
          ? `${baseUrl}/admin/api/${apiVersion}/products.json?page_info=${pageInfo}&limit=50`
          : `${baseUrl}/admin/api/${apiVersion}/products.json?limit=50`;

        const response: Response = await fetch(url, {
          headers: {
            "X-Shopify-Access-Token": accessToken,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          console.error(`[Auto-Setup] Products fetch failed: ${response.status}`);
          break;
        }

        const data = await response.json();
        const products = data.products || [];
        pageCount++;

        for (const product of products) {
          for (const variant of product.variants || []) {
            // Skip variants without a real SKU to avoid junk entries
            if (!variant.sku || variant.sku.trim() === "") {
              console.log(`[Auto-Setup] Skipping variant ${variant.id} (no SKU) for product "${product.title}"`);
              continue;
            }
            const sku = variant.sku.trim();
            const displayName = variant.title === "Default Title" ? product.title : `${product.title} - ${variant.title}`;
            try {
              // Upsert the base SKU
              await ctx.runMutation(api.skus.upsertFromWebhook, {
                userId: args.userId,
                sku,
                name: displayName,
                description: product.body_html ? product.body_html.replace(/<[^>]*>/g, '').slice(0, 500) : undefined,
                category: product.product_type || undefined,
                sellPrice: parseFloat(variant.price),
                currentStock: inventoryLevels[variant.inventory_item_id?.toString()] ?? undefined,
                barcode: variant.barcode || undefined,
                weight: variant.weight ? parseFloat(variant.weight) : undefined,
                imageUrl: product.image?.src || undefined,
                shopifyProductId: product.id.toString(),
                shopifyVariantId: variant.id.toString(),
              });

              // Also save per-store override (name, price for this specific store)
              await ctx.runMutation(api.skus.upsertStoreOverrideFromWebhook, {
                userId: args.userId,
                sku,
                shopDomain: args.shopDomain,
                displayName,
                sellPrice: parseFloat(variant.price),
                costPrice: variant.compare_at_price ? parseFloat(variant.compare_at_price) : undefined,
              });

              synced++;
            } catch (error) {
              console.error(`[Auto-Setup] Failed to upsert SKU ${sku}:`, error);
            }
          }
        }

        // Pagination
        const linkHeader: string | null = response.headers.get("Link");
        if (linkHeader) {
          const nextMatch: RegExpMatchArray | null = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
          if (nextMatch) {
            const nextUrl: URL = new URL(nextMatch[1]);
            pageInfo = nextUrl.searchParams.get("page_info");
            hasNextPage = true;
          } else {
            hasNextPage = false;
          }
        } else {
          hasNextPage = false;
        }
      }

      console.log(`[Auto-Setup] Synced ${synced} product SKUs for ${args.shopDomain}`);
    } catch (error) {
      console.error(`[Auto-Setup] Product sync failed for ${args.shopDomain}:`, error);
    }

    console.log(`[Auto-Setup] Completed for store ${args.shopDomain}`);
  },
});