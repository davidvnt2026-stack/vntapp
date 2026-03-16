import { action } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import { api } from "../_generated/api";
import type { AwbResult, BatchAwbResult } from "./shared";
import { delay } from "./shared";
import { getSamedayAuthTokenWithCache } from "./auth";
import { findCountyId, findCityId } from "./geolocation";

export const generateAwb = action({
  args: {
    token: v.string(),
    orderId: v.id("shopifyOrders"),
    serviceId: v.optional(v.number()),
    openPackage: v.optional(v.boolean()),
    serviceTaxIds: v.optional(v.array(v.number())),
    serviceTaxes: v.optional(v.array(v.object({ id: v.number(), code: v.string() }))),
  },
  returns: v.object({
    success: v.literal(true),
    alreadyExists: v.optional(v.boolean()),
    awbNumber: v.string(),
    message: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<AwbResult> => {
    const user = await ctx.runQuery(api.auth.getCurrentUser, {
      token: args.token,
    });
    if (!user) {
      throw new ConvexError("Sesiune invalidă. Te rugăm să te autentifici din nou.");
    }

    const order = await ctx.runQuery(api.orders.getById, {
      token: args.token,
      id: args.orderId,
    });
    if (!order) {
      throw new ConvexError("Comanda nu a fost găsită.");
    }

    if (order.trackingNumber) {
      return {
        success: true,
        alreadyExists: true,
        awbNumber: order.trackingNumber,
      };
    }

    if (!order.customerPhone) {
      throw new ConvexError(
        `Comanda ${order.orderNumber}: Lipsește numărul de telefon. AWB-ul necesită un telefon valid.`
      );
    }
    if (!order.shippingAddress?.line1) {
      throw new ConvexError(`Comanda ${order.orderNumber}: Lipsește adresa de livrare.`);
    }
    if (!(order.shippingAddress?.state || order.shippingAddress?.province)) {
      throw new ConvexError(
        `Comanda ${order.orderNumber}: Province/Region este obligatoriu. Completează județul/regiunea în Shopify.`
      );
    }
    if (!order.shippingAddress?.city) {
      throw new ConvexError(
        `Comanda ${order.orderNumber}: Câmpul City este obligatoriu. Elimină cartier/zona din câmp și păstrează doar orașul.`
      );
    }

    const connection = await ctx.runQuery(api.connections.getByType, {
      token: args.token,
      connectionType: "sameday",
    });
    if (!connection) {
      throw new ConvexError("Sameday nu este configurat. Mergi la Connections și adaugă credențialele Sameday.");
    }

    const creds = connection.credentials as {
      username?: string;
      password?: string;
      api_url?: string;
      pickup_location?: string;
      contact_person_id?: string;
    };

    if (!creds.username || !creds.password) {
      throw new ConvexError("Sameday: Lipsesc credențialele (username/password). Configurează în Connections.");
    }
    if (!creds.pickup_location) {
      throw new ConvexError("Sameday: Lipsește Pickup Point ID. Configurează în Connections.");
    }
    if (!creds.contact_person_id) {
      throw new ConvexError("Sameday: Lipsește Contact Person ID. Configurează în Connections.");
    }

    const username = creds.username;
    const password = creds.password;
    const pickup_location = creds.pickup_location;
    const contact_person_id = creds.contact_person_id;
    const baseUrl = creds.api_url || "https://api.sameday.ro";

    const authToken = await getSamedayAuthTokenWithCache(
      ctx,
      connection as any,
      username,
      password,
      baseUrl
    );

    const crossborderServiceIds = [28, 29, 30, 31];
    const isCrossborder = args.serviceId ? crossborderServiceIds.includes(args.serviceId) : false;

    const rawCountryCode = order.shippingAddress.countryCode || "";
    const rawCountryName = order.shippingAddress.country || "";

    console.log(
      `AWB ${order.orderNumber} - Raw address data: countryCode="${rawCountryCode}", country="${rawCountryName}", city="${order.shippingAddress.city}", state="${order.shippingAddress.state}"`
    );

    const countryNameToCode: Record<string, string> = {
      Romania: "RO",
      România: "RO",
      Rumania: "RO",
      Hungary: "HU",
      Ungaria: "HU",
      Magyarország: "HU",
      Bulgaria: "BG",
      Bulgarien: "BG",
    };

    let destinationCountryCode = rawCountryCode.toUpperCase();
    if (!["RO", "HU", "BG"].includes(destinationCountryCode)) {
      destinationCountryCode = countryNameToCode[rawCountryName] || "RO";
    }

    if (isCrossborder && destinationCountryCode === "RO") {
      console.warn(
        `Cross-border service selected but country detected as RO. Address country: "${rawCountryName}" (code: "${rawCountryCode}")`
      );
      throw new ConvexError(
        `Sameday: Serviciul cross-border necesită o adresă din altă țară. Țara detectată: ${rawCountryName || "Romania"}. Verifică adresa de livrare în Shopify.`
      );
    }

    console.log(
      `AWB for ${order.orderNumber}: Country=${destinationCountryCode}, Crossborder=${isCrossborder}, ServiceId=${args.serviceId}`
    );

    const countyId = await findCountyId(
      order.shippingAddress.state ||
        order.shippingAddress.province ||
        (destinationCountryCode === "RO" ? "București" : ""),
      authToken,
      baseUrl,
      destinationCountryCode
    );
    const cityId = await findCityId(
      order.shippingAddress.city || (destinationCountryCode === "RO" ? "București" : ""),
      countyId,
      order.shippingAddress.postalCode ||
        order.shippingAddress.zipCode ||
        order.shippingAddress.zip,
      authToken,
      baseUrl,
      destinationCountryCode
    );

    const observation = order.items
      .map(
        (item: { sku?: string; quantity: number; name: string }) =>
          `${order.orderNumber} x ${item.sku || ""} x ${item.quantity} x ${item.name}`
      )
      .join("; ")
      .substring(0, 200);

    const paymentMethodLower = order.paymentMethod?.toLowerCase() || "";
    console.log(
      `[COD DEBUG] Order ${order.orderNumber}: paymentMethod="${order.paymentMethod}" | paymentMethodLower="${paymentMethodLower}" | paymentStatus="${order.paymentStatus}"`
    );
    const knownOnlinePayments = [
      "shopify_payments",
      "stripe",
      "paypal",
      "card",
      "credit",
      "debit",
      "gpay",
      "apple_pay",
      "google_pay",
    ];
    const isOnlinePayment =
      knownOnlinePayments.some((p) => paymentMethodLower.includes(p)) ||
      order.paymentStatus === "paid" ||
      order.paymentStatus === "partially_paid";
    const isCOD =
      paymentMethodLower.includes("cod") ||
      paymentMethodLower.includes("ramburs") ||
      paymentMethodLower.includes("cash") ||
      paymentMethodLower.includes("la livrare") ||
      (order.paymentStatus === "pending" && !isOnlinePayment);
    const codAmount = isCOD ? order.totalPrice : 0;

    console.log(
      `AWB ${order.orderNumber}: paymentMethod="${order.paymentMethod}", paymentStatus="${order.paymentStatus}", isCOD=${isCOD}, isOnlinePayment=${isOnlinePayment}, codAmount=${codAmount}, totalPrice=${order.totalPrice}`
    );

    let serviceTaxesArray: number[] = [];

    if (args.serviceTaxes && args.serviceTaxes.length > 0) {
      serviceTaxesArray = args.serviceTaxes.map((tax) => tax.id);
      console.log("Sending service taxes (array):", serviceTaxesArray, "openPackage:", args.openPackage);
    } else if (args.serviceTaxIds && args.serviceTaxIds.length > 0) {
      serviceTaxesArray = args.serviceTaxIds;
      console.log("Sending service tax IDs (legacy array):", serviceTaxesArray, "openPackage:", args.openPackage);
    } else if (args.openPackage) {
      const serviceIdForTax = args.serviceId || 7;
      console.log(
        "Open package requested without tax ID - auto-fetching OPCG tax for service",
        serviceIdForTax
      );
      try {
        const taxesResponse = await fetch(
          `${baseUrl}/api/client/services/${serviceIdForTax}/optional-taxes`,
          {
            headers: {
              "X-AUTH-TOKEN": authToken,
              Accept: "application/json",
            },
          }
        );
        if (taxesResponse.ok) {
          const taxesData = await taxesResponse.json();
          const taxes = Array.isArray(taxesData) ? taxesData : taxesData.data || [];
          const opcgTax = taxes.find(
            (t: { taxCode?: string; code?: string; packageType?: number }) =>
              (t.taxCode === "OPCG" || t.code === "OPCG") && t.packageType === 0
          );
          if (opcgTax) {
            serviceTaxesArray = [opcgTax.id];
            console.log("Auto-fetched OPCG tax ID:", opcgTax.id);
          } else {
            console.warn("OPCG tax not found for service", serviceIdForTax, "- open package may not work");
          }
        }
      } catch (e) {
        console.warn("Failed to auto-fetch OPCG tax:", e);
      }
    }

    const postalCode =
      order.shippingAddress.postalCode ||
      order.shippingAddress.zipCode ||
      order.shippingAddress.zip ||
      order.shippingAddress.postal_code ||
      order.shippingAddress.postcode ||
      "";

    if (isCrossborder && !postalCode) {
      throw new ConvexError(
        `Comanda ${order.orderNumber}: Lipsește codul poștal. Pentru livrări internaționale (${destinationCountryCode}), codul poștal este obligatoriu. Adaugă-l în Shopify.`
      );
    }

    const awbRequest: Record<string, unknown> = {
      packageType: 0,
      packageWeight: 1,
      packageNumber: 1,
      insuredValue: 0,
      cashOnDelivery: codAmount,
      cashOnDeliveryReturns: 0,
      awbPayment: 1,
      thirdPartyPickup: 0,
      pickupPoint: pickup_location,
      contactPerson: contact_person_id,
      service: args.serviceId || 7,
      clientInternalReference: `${order.orderNumber}-${(args.orderId as string).slice(-8)}-${Date.now().toString(36)}`,
      awbRecipient: {
        name: order.customerName || "Client",
        phoneNumber: order.customerPhone.replace(/\s/g, ""),
        address:
          order.shippingAddress.line1 +
          (order.shippingAddress.line2 ? ` ${order.shippingAddress.line2}` : ""),
        postalCode: postalCode,
        county: countyId,
        city: cityId,
        personType: 0,
      },
      parcels: [
        {
          weight: 1,
          width: 5,
          length: 10,
          height: 1,
        },
      ],
      observation,
    };

    if (isCrossborder && codAmount > 0) {
      const orderCurrency = order.currency;
      if (orderCurrency && orderCurrency !== "RON") {
        awbRequest.currency = orderCurrency;
        console.log(`Cross-border COD with order currency: ${orderCurrency}`);
      } else {
        const currencyMap: Record<string, string> = {
          HU: "HUF",
          BG: "BGN",
        };
        if (currencyMap[destinationCountryCode]) {
          awbRequest.currency = currencyMap[destinationCountryCode];
          console.log(`Cross-border COD with mapped currency: ${awbRequest.currency}`);
        }
      }
    }

    if (serviceTaxesArray.length > 0) {
      awbRequest.serviceTaxes = serviceTaxesArray;
    }

    const response = await fetch(`${baseUrl}/api/awb`, {
      method: "POST",
      headers: {
        "X-AUTH-TOKEN": authToken,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(awbRequest),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Sameday AWB creation failed. Status: ${response.status}, Response: ${errorText}`
      );
      console.error(`AWB Request was:`, JSON.stringify(awbRequest, null, 2));

      let errorMsg = `Eroare Sameday: ${errorText}`;

      const extractErrorMessages = (value: unknown): string[] => {
        if (!value) return [];
        if (typeof value === "string") return [value];
        if (Array.isArray(value)) return value.flatMap(extractErrorMessages);
        if (typeof value === "object") {
          const obj = value as Record<string, unknown>;
          const direct = Array.isArray(obj.errors)
            ? (obj.errors as unknown[]).flatMap(extractErrorMessages)
            : [];
          const children = obj.children ? extractErrorMessages(obj.children) : [];
          const nested = Object.values(obj).flatMap(extractErrorMessages);
          return [...direct, ...children, ...nested];
        }
        return [];
      };

      try {
        const errorData = JSON.parse(errorText);
        if (errorData.message) {
          errorMsg = `Sameday: ${errorData.message}`;
        }
        if (errorData.errors) {
          const errors = Array.from(
            new Set(
              extractErrorMessages(errorData.errors)
                .map((s) => (typeof s === "string" ? s.trim() : ""))
                .filter(Boolean)
            )
          );
          if (errors.length > 0) {
            errorMsg = `Sameday: ${errors.join(", ")}`;
          }
        }
      } catch {
        // Use raw error text
      }

      const normalizedError = `${errorMsg}\n${errorText}`.toLowerCase();
      const phoneHintByCountry: Record<string, string> = {
        RO: "Format recomandat: +40 urmat de 9 cifre.",
        HU: "Format recomandat: +36 urmat de 8-9 cifre.",
        BG: "Format recomandat: +359 urmat de 9 cifre.",
      };

      if (normalizedError.includes("not found the city")) {
        errorMsg =
          `Sameday: Nu s-a găsit localitatea. City/Post Code/Province nu se potrivesc între ele. ` +
          `Verifică exact codul poștal pentru orașul selectat și elimină cartier/zona din City.`;
      } else if (normalizedError.includes("postcode") && normalizedError.includes("city")) {
        errorMsg =
          `Sameday: Codul poștal nu corespunde cu orașul. ` +
          `Folosește codul poștal exact al localității (nu cod generic).`;
      } else if (normalizedError.includes("province") && normalizedError.includes("required")) {
        errorMsg =
          `Sameday: Province/Region este obligatoriu. Completează județul/regiunea în Shopify.`;
      } else if (normalizedError.includes("invalid phone")) {
        errorMsg =
          `Sameday: Număr de telefon invalid. ${phoneHintByCountry[destinationCountryCode] || "Folosește format internațional."}`;
      } else if (
        normalizedError.includes("invalid address format") ||
        normalizedError.includes("street not recognized")
      ) {
        errorMsg =
          `Sameday: Adresă invalidă. Păstrează strada curată în Address1 (fără detalii excesive: bloc/scară/etaj). ` +
          `Mută detaliile suplimentare în Address2/Notes.`;
      } else if (normalizedError.includes("[object object]")) {
        errorMsg =
          `Sameday: Eroare tehnică externă (răspuns invalid de la curier). ` +
          `Verifică telefonul, City/Post Code/Province și încearcă din nou.`;
      }

      if (errorText.includes("county") || errorText.includes("city")) {
        errorMsg += ` (Country: ${destinationCountryCode}, County ID: ${countyId}, City ID: ${cityId})`;
      }

      throw new ConvexError(errorMsg);
    }

    const awbResponse = (await response.json()) as { awbNumber?: string; awb_number?: string };
    const awbNumber = awbResponse.awbNumber || awbResponse.awb_number;

    if (!awbNumber) {
      throw new ConvexError("Sameday nu a returnat un număr AWB. Încearcă din nou.");
    }

    await ctx.runMutation(api.awb.createTracking, {
      userId: user._id,
      orderId: args.orderId,
      awbNumber,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      shippingAddress: order.shippingAddress,
      codAmount,
      samedayResponse: awbResponse,
    });

    await ctx.runMutation(api.orders.updateTracking, {
      orderId: args.orderId,
      trackingNumber: awbNumber,
      fulfillmentStatus: "fulfilled",
    });

    try {
      await ctx.runAction(api.shopify.fulfillOrder, {
        token: args.token,
        orderId: args.orderId,
        trackingNumber: awbNumber,
        trackingCompany: "Sameday",
        notifyCustomer: false,
      });
    } catch (shopifyError: unknown) {
      console.error(
        "Shopify fulfillment failed:",
        shopifyError instanceof Error ? shopifyError.message : "Unknown error"
      );
    }

    try {
      await ctx.runAction(api.sameday.syncDeliveryStatus, {
        token: args.token,
        orderId: args.orderId,
      });
    } catch (statusError: unknown) {
      console.error(
        "Initial status sync failed:",
        statusError instanceof Error ? statusError.message : "Unknown error"
      );
    }

    return {
      success: true,
      awbNumber,
      message: `AWB ${awbNumber} created successfully`,
    };
  },
});

export const generateBatchAwb = action({
  args: {
    token: v.string(),
    orderIds: v.array(v.id("shopifyOrders")),
    serviceId: v.optional(v.number()),
    openPackage: v.optional(v.boolean()),
    serviceTaxIds: v.optional(v.array(v.number())),
    serviceTaxes: v.optional(v.array(v.object({ id: v.number(), code: v.string() }))),
  },
  handler: async (ctx, args): Promise<BatchAwbResult> => {
    const results: BatchAwbResult["results"] = [];

    for (let i = 0; i < args.orderIds.length; i++) {
      const orderId = args.orderIds[i];

      if (i > 0) {
        await delay(1000);
      }

      try {
        const order = await ctx.runQuery(api.orders.getById, {
          token: args.token,
          id: orderId,
        });

        const orderOpenPackage = args.openPackage || (order?.openPackageRequested === true);

        const result = await ctx.runAction(api.sameday.generateAwb, {
          token: args.token,
          orderId,
          serviceId: args.serviceId,
          openPackage: orderOpenPackage,
          serviceTaxIds: orderOpenPackage ? args.serviceTaxIds : undefined,
          serviceTaxes: orderOpenPackage ? args.serviceTaxes : undefined,
        });

        results.push({
          orderId: orderId as string,
          orderNumber: order?.orderNumber || "Unknown",
          success: true,
          awbNumber: result.awbNumber,
        });
      } catch (error: unknown) {
        const order = await ctx.runQuery(api.orders.getById, {
          token: args.token,
          id: orderId,
        });

        results.push({
          orderId: orderId as string,
          orderNumber: order?.orderNumber || "Unknown",
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
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
