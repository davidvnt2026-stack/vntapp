import { action } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import { api } from "../_generated/api";
import { getSamedayAuthTokenWithCache } from "./auth";
import { findCountyId, findCityId } from "./geolocation";

function normalizeText(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function pickBestCityName(
  cities: Array<{ id?: number | string; name?: string }>,
  targetCity: string
): string | null {
  if (!cities.length) return null;
  const normalizedTarget = normalizeText(targetCity);
  const exactMatch = cities.find((city) => city.name && normalizeText(city.name) === normalizedTarget);
  if (exactMatch?.name) return exactMatch.name;
  const partialMatch = cities.find((city) => city.name && normalizeText(city.name).includes(normalizedTarget));
  if (partialMatch?.name) return partialMatch.name;
  return cities[0].name || null;
}

async function fetchCities(
  baseUrl: string,
  authToken: string,
  queryParams: string
): Promise<Array<{ id?: number | string; name?: string }>> {
  const response = await fetch(`${baseUrl}/api/geolocation/city?${queryParams}`, {
    headers: {
      "X-AUTH-TOKEN": authToken,
      Accept: "application/json",
    },
  });
  if (!response.ok) return [];
  const data = (await response.json()) as
    | Array<{ id?: number | string; name?: string }>
    | { data?: Array<{ id?: number | string; name?: string }> };
  return Array.isArray(data) ? data : data.data || [];
}

export const validateOrdersAddress = action({
  args: {
    token: v.string(),
    orderIds: v.array(v.id("shopifyOrders")),
  },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(api.auth.getCurrentUser, {
      token: args.token,
    });
    if (!user) {
      throw new ConvexError("Sesiune invalidă. Te rugăm să te autentifici din nou.");
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
    };

    if (!creds.username || !creds.password) {
      throw new ConvexError("Sameday: Lipsesc credențialele (username/password).");
    }

    const baseUrl = creds.api_url || "https://api.sameday.ro";
    const authToken = await getSamedayAuthTokenWithCache(
      ctx,
      connection as any,
      creds.username,
      creds.password,
      baseUrl
    );

    const valid: string[] = [];
    const invalid: Array<{
      orderId: string;
      orderNumber: string;
      customerName: string;
      country: string;
      county: string;
      city: string;
      postalCode: string;
      error: string;
    }> = [];

    for (const orderId of args.orderIds) {
      const order = await ctx.runQuery(api.orders.getById, {
        token: args.token,
        id: orderId,
      });

      if (!order) {
        continue;
      }

      if (order.trackingNumber) {
        valid.push(orderId);
        continue;
      }

      if (!order.shippingAddress?.city) {
        invalid.push({
          orderId: orderId,
          orderNumber: order.orderNumber ?? "",
          customerName: order.customerName ?? "Client",
          country: order.shippingAddress?.country || order.shippingAddress?.countryCode || "",
          county: order.shippingAddress?.state || order.shippingAddress?.province || "",
          city: "",
          postalCode: order.shippingAddress?.postalCode || order.shippingAddress?.zip || "",
          error: "Orașul lipsește din adresa comenzii.",
        });
        continue;
      }

      const rawCountryCode = order.shippingAddress.countryCode || "";
      const rawCountryName = order.shippingAddress.country || "";

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

      try {
        const countyId = await findCountyId(
          order.shippingAddress.state ||
            order.shippingAddress.province ||
            (destinationCountryCode === "RO" ? "București" : ""),
          authToken,
          baseUrl,
          destinationCountryCode
        );

        const postalCode =
          order.shippingAddress.postalCode ||
          order.shippingAddress.zipCode ||
          order.shippingAddress.zip;

        await findCityId(
          order.shippingAddress.city,
          countyId,
          postalCode,
          authToken,
          baseUrl,
          destinationCountryCode
        );

        valid.push(orderId);
      } catch (error: unknown) {
        let autoResolved = false;
        let resolvedCityName: string | null = null;
        try {
          const countyId = await findCountyId(
            order.shippingAddress.state ||
              order.shippingAddress.province ||
              (destinationCountryCode === "RO" ? "București" : ""),
            authToken,
            baseUrl,
            destinationCountryCode
          );

          const postalCode =
            order.shippingAddress.postalCode ||
            order.shippingAddress.zipCode ||
            order.shippingAddress.zip;

          if (postalCode) {
            const citiesByPostal = await fetchCities(
              baseUrl,
              authToken,
              `countryCode=${destinationCountryCode}&county=${countyId}&postalCode=${encodeURIComponent(
                postalCode
              )}&page=1&countPerPage=50`
            );
            resolvedCityName = pickBestCityName(citiesByPostal, order.shippingAddress.city);
          }

          if (!resolvedCityName) {
            const citiesByName = await fetchCities(
              baseUrl,
              authToken,
              `countryCode=${destinationCountryCode}&county=${countyId}&name=${encodeURIComponent(
                order.shippingAddress.city
              )}&page=1&countPerPage=50`
            );
            resolvedCityName = pickBestCityName(citiesByName, order.shippingAddress.city);
          }

          if (resolvedCityName) {
            if (normalizeText(resolvedCityName) !== normalizeText(order.shippingAddress.city)) {
              await ctx.runMutation(api.orders.updateShippingCity, {
                token: args.token,
                orderId,
                city: resolvedCityName,
              });
            }
            valid.push(orderId);
            autoResolved = true;
          }
        } catch {
          // Keep the order in invalid list if auto-resolution fails.
        }

        if (autoResolved) {
          continue;
        }

        invalid.push({
          orderId: orderId,
          orderNumber: order.orderNumber ?? "",
          customerName: order.customerName ?? "Client",
          country: destinationCountryCode,
          county: order.shippingAddress.state || order.shippingAddress.province || "",
          city: resolvedCityName || order.shippingAddress.city,
          postalCode: order.shippingAddress.postalCode || order.shippingAddress.zip || "",
          error: error instanceof Error ? error.message : "Nu s-a putut valida adresa",
        });
      }
    }

    return { valid, invalid };
  },
});
