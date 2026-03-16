import { action } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import { api, internal } from "../_generated/api";
import { authenticateSameday } from "./auth";
import { findCountyId } from "./geolocation";

export const testPostalCodeLookup = action({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;

    const connection = await ctx.runQuery(internal.sameday.getAnySamedayConnection);
    if (!connection) throw new ConvexError("No Sameday connection found");

    const creds = connection.credentials as {
      username?: string;
      password?: string;
      api_url?: string;
    };
    if (!creds.username || !creds.password) throw new ConvexError("Missing Sameday credentials");

    const baseUrl = creds.api_url || "https://api.sameday.ro";
    const authToken = await authenticateSameday(creds.username, creds.password, baseUrl);

    const orders = await ctx.runQuery(internal.sameday.getOrdersWithAwbs, {
      limit,
      userId: connection.userId,
      days: 90,
    });

    console.log(`Testing postal code lookup for ${orders.length} orders with AWBs...`);

    const results: Array<{
      orderNumber: string;
      trackingNumber: string;
      city: string;
      county: string;
      countryCode: string;
      existingPostalCode: string;
      samedayLookupPostalCode: string | null;
      samedayCityName: string | null;
      match: boolean | "no_existing" | "no_lookup_result";
      allCitiesReturned?: number;
      rawFirstCity?: unknown;
      error?: string;
    }> = [];

    for (const order of orders) {
      const city = order.city;
      const county = order.state;
      const countryCode = order.countryCode || "RO";
      const existingPostalCode = order.postalCode;

      try {
        let countyId: string;
        try {
          countyId = await findCountyId(county, authToken, baseUrl, countryCode);
        } catch {
          results.push({
            orderNumber: order.orderNumber,
            trackingNumber: order.trackingNumber || "",
            city,
            county,
            countryCode,
            existingPostalCode,
            samedayLookupPostalCode: null,
            samedayCityName: null,
            match: "no_lookup_result",
            error: `County not found: "${county}"`,
          });
          continue;
        }

        const cityResponse = await fetch(
          `${baseUrl}/api/geolocation/city?countryCode=${countryCode}&county=${countyId}&name=${encodeURIComponent(city)}&page=1&countPerPage=50`,
          {
            headers: {
              "X-AUTH-TOKEN": authToken,
              Accept: "application/json",
            },
          }
        );

        if (!cityResponse.ok) {
          results.push({
            orderNumber: order.orderNumber,
            trackingNumber: order.trackingNumber || "",
            city,
            county,
            countryCode,
            existingPostalCode,
            samedayLookupPostalCode: null,
            samedayCityName: null,
            match: "no_lookup_result",
            error: `City API returned ${cityResponse.status}`,
          });
          continue;
        }

        const cityData = (await cityResponse.json()) as any;
        const cities = Array.isArray(cityData) ? cityData : cityData.data || [];

        if (cities.length === 0) {
          results.push({
            orderNumber: order.orderNumber,
            trackingNumber: order.trackingNumber || "",
            city,
            county,
            countryCode,
            existingPostalCode,
            samedayLookupPostalCode: null,
            samedayCityName: null,
            match: "no_lookup_result",
            allCitiesReturned: 0,
            error: `No cities found for "${city}" in county ${county} (id=${countyId})`,
          });
          continue;
        }

        const cityLower = city.toLowerCase().trim();
        const exactMatch = cities.find(
          (c: any) => c.name?.toLowerCase().trim() === cityLower
        );
        const bestMatch = exactMatch || cities[0];

        const lookupPostalCode =
          bestMatch.postalCode ||
          bestMatch.postal_code ||
          bestMatch.zipCode ||
          bestMatch.zip ||
          bestMatch.postcode ||
          null;

        const isMatch = !existingPostalCode
          ? "no_existing"
          : !lookupPostalCode
            ? "no_lookup_result"
            : existingPostalCode.trim() === String(lookupPostalCode).trim();

        results.push({
          orderNumber: order.orderNumber,
          trackingNumber: order.trackingNumber || "",
          city,
          county,
          countryCode,
          existingPostalCode,
          samedayLookupPostalCode: lookupPostalCode ? String(lookupPostalCode) : null,
          samedayCityName: bestMatch.name || null,
          match: isMatch,
          allCitiesReturned: cities.length,
          rawFirstCity: bestMatch,
        });
      } catch (e: any) {
        results.push({
          orderNumber: order.orderNumber,
          trackingNumber: order.trackingNumber || "",
          city,
          county,
          countryCode,
          existingPostalCode,
          samedayLookupPostalCode: null,
          samedayCityName: null,
          match: "no_lookup_result",
          error: e.message,
        });
      }
    }

    const matches = results.filter((r) => r.match === true).length;
    const mismatches = results.filter((r) => r.match === false).length;
    const noExisting = results.filter((r) => r.match === "no_existing").length;
    const noLookup = results.filter((r) => r.match === "no_lookup_result").length;

    return {
      summary: {
        total: results.length,
        matches,
        mismatches,
        noExistingPostalCode: noExisting,
        noLookupResult: noLookup,
      },
      results,
    };
  },
});

export const testPostalCodeLookupGoogle = action({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;

    const apiKey = process.env.GOOGLE_GEOCODING_API_KEY;
    if (!apiKey) {
      throw new ConvexError("GOOGLE_GEOCODING_API_KEY environment variable is not set");
    }

    const connection = await ctx.runQuery(internal.sameday.getAnySamedayConnection);
    if (!connection) throw new ConvexError("No Sameday connection found");

    const orders = await ctx.runQuery(internal.sameday.getOrdersWithAwbs, {
      limit,
      userId: connection.userId,
      days: 90,
    });

    console.log(
      `[Google Geocoding] Testing postal code lookup for ${orders.length} orders with AWBs...`
    );

    const results: Array<{
      orderNumber: string;
      trackingNumber: string;
      addressSent: string;
      city: string;
      county: string;
      countryCode: string;
      existingPostalCode: string;
      googlePostalCode: string | null;
      googleFormattedAddress: string | null;
      match: boolean | "no_existing" | "no_lookup_result";
      googleStatus: string;
      rawFirstResult?: unknown;
      error?: string;
    }> = [];

    for (const order of orders) {
      const addressParts = [
        order.line1,
        order.city,
        order.state,
        order.country || "Romania",
      ].filter(Boolean);
      const addressString = addressParts.join(", ");
      const countryComponent = `country:${order.countryCode || "RO"}`;

      try {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addressString)}&components=${encodeURIComponent(countryComponent)}&key=${apiKey}`;

        const response = await fetch(url);
        if (!response.ok) {
          results.push({
            orderNumber: order.orderNumber,
            trackingNumber: order.trackingNumber || "",
            addressSent: addressString,
            city: order.city,
            county: order.state,
            countryCode: order.countryCode,
            existingPostalCode: order.postalCode,
            googlePostalCode: null,
            googleFormattedAddress: null,
            match: "no_lookup_result",
            googleStatus: `HTTP ${response.status}`,
            error: `Google API returned HTTP ${response.status}`,
          });
          continue;
        }

        const data = (await response.json()) as {
          status: string;
          results: Array<{
            formatted_address: string;
            address_components: Array<{
              long_name: string;
              short_name: string;
              types: string[];
            }>;
            geometry: { location: { lat: number; lng: number } };
          }>;
          error_message?: string;
        };

        if (data.status !== "OK" || !data.results || data.results.length === 0) {
          results.push({
            orderNumber: order.orderNumber,
            trackingNumber: order.trackingNumber || "",
            addressSent: addressString,
            city: order.city,
            county: order.state,
            countryCode: order.countryCode,
            existingPostalCode: order.postalCode,
            googlePostalCode: null,
            googleFormattedAddress: null,
            match: "no_lookup_result",
            googleStatus: data.status,
            error: data.error_message || `Google status: ${data.status}`,
          });
          continue;
        }

        const firstResult = data.results[0];
        const postalCodeComponent = firstResult.address_components.find((c) =>
          c.types.includes("postal_code")
        );
        const googlePostalCode = postalCodeComponent?.long_name || null;
        const existingPostalCode = order.postalCode;
        const isMatch = !existingPostalCode
          ? "no_existing"
          : !googlePostalCode
            ? "no_lookup_result"
            : existingPostalCode.trim() === googlePostalCode.trim();

        results.push({
          orderNumber: order.orderNumber,
          trackingNumber: order.trackingNumber || "",
          addressSent: addressString,
          city: order.city,
          county: order.state,
          countryCode: order.countryCode,
          existingPostalCode,
          googlePostalCode,
          googleFormattedAddress: firstResult.formatted_address,
          match: isMatch,
          googleStatus: data.status,
          rawFirstResult: {
            formatted_address: firstResult.formatted_address,
            address_components: firstResult.address_components,
            location: firstResult.geometry?.location,
          },
        });
      } catch (e: any) {
        results.push({
          orderNumber: order.orderNumber,
          trackingNumber: order.trackingNumber || "",
          addressSent: addressString,
          city: order.city,
          county: order.state,
          countryCode: order.countryCode,
          existingPostalCode: order.postalCode,
          googlePostalCode: null,
          googleFormattedAddress: null,
          match: "no_lookup_result",
          googleStatus: "error",
          error: e.message,
        });
      }
    }

    const matches = results.filter((r) => r.match === true).length;
    const mismatches = results.filter((r) => r.match === false).length;
    const noExisting = results.filter((r) => r.match === "no_existing").length;
    const noLookup = results.filter((r) => r.match === "no_lookup_result").length;

    return {
      summary: {
        total: results.length,
        matches,
        mismatches,
        noExistingPostalCode: noExisting,
        noLookupResult: noLookup,
        matchRate: results.length > 0 ? `${((matches / results.length) * 100).toFixed(1)}%` : "N/A",
      },
      results,
    };
  },
});

export const testPostalCodeLookupHybrid = action({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;

    const googleApiKey = process.env.GOOGLE_GEOCODING_API_KEY;
    if (!googleApiKey) {
      throw new ConvexError("GOOGLE_GEOCODING_API_KEY environment variable is not set");
    }

    const connection = await ctx.runQuery(internal.sameday.getAnySamedayConnection);
    if (!connection) throw new ConvexError("No Sameday connection found");
    const creds = connection.credentials as {
      username?: string;
      password?: string;
      api_url?: string;
    };
    if (!creds.username || !creds.password) throw new ConvexError("Missing Sameday credentials");
    const samedayBaseUrl = creds.api_url || "https://api.sameday.ro";
    const samedayToken = await authenticateSameday(
      creds.username,
      creds.password,
      samedayBaseUrl
    );

    const orders = await ctx.runQuery(internal.sameday.getOrdersWithAwbs, {
      limit,
      userId: connection.userId,
      days: 90,
    });
    console.log(`[Hybrid] Testing postal code lookup for ${orders.length} orders...`);

    const results: Array<{
      orderNumber: string;
      trackingNumber: string;
      originalCity: string;
      originalCounty: string;
      countryCode: string;
      existingPostalCode: string;
      googleNormalizedCity: string | null;
      googleNormalizedCounty: string | null;
      googlePostalCode: string | null;
      googleFormattedAddress: string | null;
      samedayPostalCode: string | null;
      samedayCityName: string | null;
      finalPostalCode: string | null;
      source: "google" | "sameday_after_google" | "sameday_fallback" | "none";
      match: boolean | "no_existing" | "no_lookup_result";
      details: string;
    }> = [];

    for (const order of orders) {
      const originalCity = order.city;
      const originalCounty = order.state;
      const countryCode = order.countryCode || "RO";
      const existingPostalCode = order.postalCode;

      let googleNormalizedCity: string | null = null;
      let googleNormalizedCounty: string | null = null;
      let googlePostalCode: string | null = null;
      let googleFormattedAddress: string | null = null;
      let samedayPostalCode: string | null = null;
      let samedayCityName: string | null = null;
      let finalPostalCode: string | null = null;
      let source: "google" | "sameday_after_google" | "sameday_fallback" | "none" = "none";
      let details = "";

      try {
        const addressParts = [
          order.line1,
          order.city,
          order.state,
          order.country || "Romania",
        ].filter(Boolean);
        const addressString = addressParts.join(", ");
        const googleUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addressString)}&components=${encodeURIComponent(`country:${countryCode}`)}&key=${googleApiKey}`;

        const googleRes = await fetch(googleUrl);
        const googleData = (await googleRes.json()) as {
          status: string;
          results: Array<{
            formatted_address: string;
            address_components: Array<{
              long_name: string;
              short_name: string;
              types: string[];
            }>;
          }>;
        };

        if (googleData.status === "OK" && googleData.results.length > 0) {
          const first = googleData.results[0];
          googleFormattedAddress = first.formatted_address;

          const localityComp = first.address_components.find((c) =>
            c.types.includes("locality")
          );
          const countyComp = first.address_components.find((c) =>
            c.types.includes("administrative_area_level_1")
          );
          const postalComp = first.address_components.find((c) =>
            c.types.includes("postal_code")
          );

          googleNormalizedCity = localityComp?.long_name || null;
          googleNormalizedCounty =
            countyComp?.long_name
              ?.replace(/^Județul\s+/i, "")
              .replace(/\s+County$/i, "") || null;
          googlePostalCode = postalComp?.long_name || null;

          if (googlePostalCode) {
            finalPostalCode = googlePostalCode;
            source = "google";
            details = `Google returned postal code directly from: "${addressString}"`;
          }
        }

        if (!finalPostalCode && googleNormalizedCity) {
          const cityToSearch = googleNormalizedCity;
          const countyToSearch = googleNormalizedCounty || originalCounty;

          try {
            const countyId = await findCountyId(
              countyToSearch,
              samedayToken,
              samedayBaseUrl,
              countryCode
            );

            const cityRes = await fetch(
              `${samedayBaseUrl}/api/geolocation/city?countryCode=${countryCode}&county=${countyId}&name=${encodeURIComponent(cityToSearch)}&page=1&countPerPage=50`,
              { headers: { "X-AUTH-TOKEN": samedayToken, Accept: "application/json" } }
            );

            if (cityRes.ok) {
              const cityData = (await cityRes.json()) as any;
              const cities = Array.isArray(cityData) ? cityData : cityData.data || [];

              if (cities.length > 0) {
                const cityLower = cityToSearch.toLowerCase().trim();
                const exactMatch = cities.find(
                  (c: any) => c.name?.toLowerCase().trim() === cityLower
                );
                const bestMatch = exactMatch || cities[0];

                samedayPostalCode = bestMatch.postalCode || null;
                samedayCityName = bestMatch.name || null;

                if (samedayPostalCode) {
                  finalPostalCode = samedayPostalCode;
                  source = "sameday_after_google";
                  details = `Google normalized "${originalCity}" -> "${cityToSearch}", Sameday found postal code for "${samedayCityName}"`;
                }
              }
            }
          } catch (e: any) {
            details += ` | Sameday after Google error: ${e.message}`;
          }
        }

        if (!finalPostalCode) {
          try {
            const countyId = await findCountyId(
              originalCounty,
              samedayToken,
              samedayBaseUrl,
              countryCode
            );

            const cityRes = await fetch(
              `${samedayBaseUrl}/api/geolocation/city?countryCode=${countryCode}&county=${countyId}&name=${encodeURIComponent(originalCity)}&page=1&countPerPage=50`,
              { headers: { "X-AUTH-TOKEN": samedayToken, Accept: "application/json" } }
            );

            if (cityRes.ok) {
              const cityData = (await cityRes.json()) as any;
              const cities = Array.isArray(cityData) ? cityData : cityData.data || [];

              if (cities.length > 0) {
                const cityLower = originalCity.toLowerCase().trim();
                const exactMatch = cities.find(
                  (c: any) => c.name?.toLowerCase().trim() === cityLower
                );
                const bestMatch = exactMatch || cities[0];

                samedayPostalCode = bestMatch.postalCode || null;
                samedayCityName = bestMatch.name || null;

                if (samedayPostalCode) {
                  finalPostalCode = samedayPostalCode;
                  source = "sameday_fallback";
                  details = `Direct Sameday lookup found postal code for "${samedayCityName}"`;
                }
              }
            }
          } catch (e: any) {
            details += ` | Sameday fallback error: ${e.message}`;
          }
        }

        if (!finalPostalCode) {
          details =
            details || `No postal code found via any method for "${originalCity}", ${originalCounty}`;
        }

        const isMatch = !existingPostalCode
          ? "no_existing"
          : !finalPostalCode
            ? "no_lookup_result"
            : existingPostalCode.trim() === finalPostalCode.trim();

        results.push({
          orderNumber: order.orderNumber,
          trackingNumber: order.trackingNumber || "",
          originalCity,
          originalCounty,
          countryCode,
          existingPostalCode,
          googleNormalizedCity,
          googleNormalizedCounty,
          googlePostalCode,
          googleFormattedAddress,
          samedayPostalCode,
          samedayCityName,
          finalPostalCode,
          source,
          match: isMatch,
          details,
        });
      } catch (e: any) {
        results.push({
          orderNumber: order.orderNumber,
          trackingNumber: order.trackingNumber || "",
          originalCity,
          originalCounty,
          countryCode,
          existingPostalCode,
          googleNormalizedCity: null,
          googleNormalizedCounty: null,
          googlePostalCode: null,
          googleFormattedAddress: null,
          samedayPostalCode: null,
          samedayCityName: null,
          finalPostalCode: null,
          source: "none",
          match: "no_lookup_result",
          details: `Error: ${e.message}`,
        });
      }
    }

    const matches = results.filter((r) => r.match === true).length;
    const mismatches = results.filter((r) => r.match === false).length;
    const noExisting = results.filter((r) => r.match === "no_existing").length;
    const noLookup = results.filter((r) => r.match === "no_lookup_result").length;

    const fromGoogle = results.filter((r) => r.source === "google").length;
    const fromSamedayAfterGoogle = results.filter((r) => r.source === "sameday_after_google").length;
    const fromSamedayFallback = results.filter((r) => r.source === "sameday_fallback").length;
    const fromNone = results.filter((r) => r.source === "none").length;

    return {
      summary: {
        total: results.length,
        matches,
        mismatches,
        noExistingPostalCode: noExisting,
        noLookupResult: noLookup,
        matchRate:
          results.length > 0 ? `${((matches / results.length) * 100).toFixed(1)}%` : "N/A",
        foundRate:
          results.length > 0
            ? `${(((results.length - noLookup) / results.length) * 100).toFixed(1)}%`
            : "N/A",
        sourceBreakdown: {
          google: fromGoogle,
          samedayAfterGoogle: fromSamedayAfterGoogle,
          samedayFallback: fromSamedayFallback,
          none: fromNone,
        },
      },
      results,
    };
  },
});

// Helper: call Google Geocoding API and parse the result.
// Returns parsed result or null if no postal code found. Throws on hard API errors (REQUEST_DENIED etc.)
type GeoResult = {
  postalCode: string;
  normalizedCity: string | null;
  normalizedCounty: string | null;
  formattedAddress: string;
};

function normalizeBucharestSectorLabel(
  city: string | null,
  county: string | null,
  postalCode: string
): string | null {
  if (!city) return null;
  const cityNorm = city.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const countyNorm = (county || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  const sectorFromPostal =
    postalCode && postalCode.length >= 2 && postalCode.startsWith("0") ? postalCode[1] : "";
  const isValidSector = ["1", "2", "3", "4", "5", "6"].includes(sectorFromPostal);
  const isBucharest = cityNorm === "bucuresti" || cityNorm === "bucharest" || countyNorm.includes("bucure");

  const explicitSectorMatch = cityNorm.match(/^sector(?:ul)?\s*([1-6])$/);
  if (explicitSectorMatch) {
    return `Sectorul ${explicitSectorMatch[1]}`;
  }

  if (isBucharest && isValidSector) {
    return `Sectorul ${sectorFromPostal}`;
  }

  return city;
}

async function callGoogleGeocode(
  addressString: string,
  countryCode: string,
  apiKey: string,
  label: string
): Promise<GeoResult | null> {
  console.log(`[lookupPostalCode] ${label}: "${addressString}"`);

  const url =
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addressString)}` +
    `&components=${encodeURIComponent(`country:${countryCode}`)}&key=${apiKey}`;
  const res = await fetch(url);
  const data = (await res.json()) as {
    status: string;
    results: Array<{
      formatted_address?: string;
      address_components: Array<{
        long_name: string;
        short_name: string;
        types: string[];
      }>;
    }>;
  };

  console.log(`[lookupPostalCode] ${label} -> status: ${data.status} | results: ${data.results?.length || 0}`);

  // Hard API errors — throw immediately, no retry will help
  if (data.status === "REQUEST_DENIED") {
    console.error(`[lookupPostalCode] Google REQUEST_DENIED — API key may be invalid or Geocoding API not enabled.`);
    throw new ConvexError(
      `Google Geocoding API key invalid sau API-ul nu este activat. Contactează administratorul.`
    );
  }
  if (data.status === "OVER_QUERY_LIMIT") {
    throw new ConvexError(
      `Limita de interogări Google Geocoding a fost depășită. Încearcă din nou mai târziu.`
    );
  }

  if (data.status !== "OK" || !data.results?.length) {
    return null; // No results — caller can retry with simpler address
  }

  const first = data.results[0];
  console.log(
    `[lookupPostalCode] ${label} -> formatted: "${first.formatted_address}"`,
    JSON.stringify(first.address_components.map((c) => ({ long_name: c.long_name, types: c.types })))
  );

  const postalComp = first.address_components.find((c) => c.types.includes("postal_code"));
  if (!postalComp?.long_name) {
    return null; // Found address but no postal code — retry with simpler query
  }

  const localityComp = first.address_components.find((c) => c.types.includes("locality"));
  const countyComp = first.address_components.find((c) =>
    c.types.includes("administrative_area_level_1")
  );

  return {
    postalCode: postalComp.long_name,
    normalizedCity: normalizeBucharestSectorLabel(
      localityComp?.long_name || null,
      countyComp?.long_name || null,
      postalComp.long_name
    ),
    normalizedCounty:
      countyComp?.long_name?.replace(/^Județul\s+/i, "").replace(/\s+County$/i, "") || null,
    formattedAddress: first.formatted_address || addressString,
  };
}

async function callSamedayPostalLookup(
  ctx: any,
  city: string,
  county: string,
  countryCode: string
): Promise<{ postalCode: string; matchedCity: string | null; details: string } | null> {
  const connection = await ctx.runQuery(internal.sameday.getAnySamedayConnection);
  if (!connection) return null;

  const creds = connection.credentials as {
    username?: string;
    password?: string;
    api_url?: string;
  };
  if (!creds.username || !creds.password) return null;

  const samedayBaseUrl = creds.api_url || "https://api.sameday.ro";
  const samedayToken = await authenticateSameday(creds.username, creds.password, samedayBaseUrl);
  const countyId = await findCountyId(county, samedayToken, samedayBaseUrl, countryCode);

  const cityRes = await fetch(
    `${samedayBaseUrl}/api/geolocation/city?countryCode=${countryCode}&county=${countyId}&name=${encodeURIComponent(city)}&page=1&countPerPage=50`,
    { headers: { "X-AUTH-TOKEN": samedayToken, Accept: "application/json" } }
  );
  if (!cityRes.ok) return null;

  const cityData = (await cityRes.json()) as any;
  const cities = Array.isArray(cityData) ? cityData : cityData.data || [];
  if (!cities.length) return null;

  const cityLower = city.toLowerCase().trim();
  const exactMatch = cities.find((c: any) => c.name?.toLowerCase().trim() === cityLower);
  const bestMatch = exactMatch || cities[0];
  const samedayPostalCode =
    bestMatch.postalCode ||
    bestMatch.postal_code ||
    bestMatch.zipCode ||
    bestMatch.zip ||
    bestMatch.postcode ||
    null;
  if (!samedayPostalCode) return null;

  const matchedCity = bestMatch.name || null;
  return {
    postalCode: String(samedayPostalCode),
    matchedCity,
    details: `Sameday geolocation: city "${matchedCity || city}", county "${county}"`,
  };
}

export const lookupPostalCode = action({
  args: {
    token: v.string(),
    addressLine1: v.optional(v.string()),
    addressLine2: v.optional(v.string()),
    city: v.string(),
    state: v.optional(v.string()),
    country: v.optional(v.string()),
    countryCode: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    postalCode: string;
    source: "google" | "sameday";
    normalizedCity: string | null;
    normalizedCounty: string | null;
    details: string;
  }> => {
    const user = await ctx.runQuery(api.auth.getCurrentUser, { token: args.token });
    if (!user) {
      throw new ConvexError("Sesiune invalidă. Te rugăm să te autentifici din nou.");
    }

    const googleApiKey = process.env.GOOGLE_GEOCODING_API_KEY;
    if (!googleApiKey) {
      throw new ConvexError("Google Geocoding API key nu este configurat.");
    }

    const city = args.city.trim();
    const state = (args.state || "").trim();
    const country = args.country || "Romania";
    const countryCode = args.countryCode || "RO";

    // Clean address: remove apartment-level details that confuse geocoding
    const rawAddress = [args.addressLine1, args.addressLine2].filter(Boolean).join(", ");
    let cleanedAddress = rawAddress
      .replace(/,?\s*\bbloc\s*\.?\s*\w+/gi, "")
      .replace(/,?\s*\bbl\s*\.?\s*\d+\w*/gi, "")
      .replace(/,?\s*\bscara\s*\.?\s*\w+/gi, "")
      .replace(/,?\s*\bsc\s*\.?\s*[a-z0-9]\b/gi, "")
      .replace(/,?\s*\b(et|etaj)\s*\.?\s*\d+/gi, "")
      .replace(/,?\s*\bapartament\s*\.?\s*\d+/gi, "")
      .replace(/,?\s*\b(ap|apt)\s*\.?\s*\d+/gi, "")
      .replace(/,?\s*\bsector\s*\d\b/gi, "")
      .replace(/,?\s*\bsectorul\s*\d\b/gi, "")
      .replace(/\bnr\s*\.?\s*/gi, " ")
      // Split number glued to next word: "42bughea" → "42 bughea"
      .replace(/(\d)([a-zA-ZăâîșțĂÂÎȘȚ])/g, "$1 $2")
      .replace(/,\s*,/g, ",")
      .replace(/,\s*$/g, "")
      .replace(/^\s*,/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    const cityLower = city.toLowerCase();
    if (cityLower && cleanedAddress.toLowerCase().trim() === cityLower) {
      cleanedAddress = "";
    }

    // Try to extract a possible sub-locality from the street address.
    // Pattern: "Street Number <sub-locality>" e.g. "Riului 42 bughea de josc"
    // If the cleaned address has words AFTER the street number, those might be a village/sub-locality.
    let possibleSubLocality = "";
    {
      const afterStreetNum = cleanedAddress.match(/^\S+\s+\d+\s+(.+)$/i);
      if (afterStreetNum) {
        possibleSubLocality = afterStreetNum[1].trim();
      }
    }

    console.log(
      `[lookupPostalCode] Raw: "${rawAddress}" -> Cleaned: "${cleanedAddress}"` +
        (possibleSubLocality ? ` | Sub-locality detected: "${possibleSubLocality}"` : "")
    );

    const makeSuccess = (r: GeoResult) => ({
      postalCode: r.postalCode,
      source: "google" as const,
      normalizedCity: r.normalizedCity,
      normalizedCounty: r.normalizedCounty,
      details: `Google Geocoding: "${r.formattedAddress}"`,
    });

    try {
      // ── Attempt 1: full cleaned address + city + state + country ──
      const fullParts = [cleanedAddress || undefined, city, state || undefined, country].filter(Boolean);
      const fullAddress = fullParts.join(", ");
      const attempt1 = await callGoogleGeocode(fullAddress, countryCode, googleApiKey, "Attempt 1 (full)");
      if (attempt1) return makeSuccess(attempt1);

      // ── Attempt 2: street + city only (no state/country noise) ──
      if (cleanedAddress) {
        const simpleAddress = `${cleanedAddress}, ${city}`;
        const attempt2 = await callGoogleGeocode(simpleAddress, countryCode, googleApiKey, "Attempt 2 (street+city)");
        if (attempt2) return makeSuccess(attempt2);
      }

      // ── Attempt 3: sub-locality as city (e.g. "Bughea de Jos" extracted from street field) ──
      if (possibleSubLocality && possibleSubLocality.toLowerCase() !== cityLower) {
        // Extract just the street part (before the sub-locality)
        const streetOnly = cleanedAddress.replace(/^(\S+\s+\d+)\s+.+$/i, "$1").trim();
        const subLocParts = [streetOnly || undefined, possibleSubLocality, city, state || undefined, country].filter(Boolean);
        const subLocAddress = subLocParts.join(", ");
        const attempt3 = await callGoogleGeocode(subLocAddress, countryCode, googleApiKey, "Attempt 3 (sub-locality)");
        if (attempt3) return makeSuccess(attempt3);

        // Try sub-locality + city directly without street
        const subLocCityAddress = [possibleSubLocality, city, state || undefined, country].filter(Boolean).join(", ");
        const attempt3b = await callGoogleGeocode(subLocCityAddress, countryCode, googleApiKey, "Attempt 3b (sub-locality as city)");
        if (attempt3b) return makeSuccess(attempt3b);
      }

      // ── Attempt 4: city + state + country only ──
      {
        const cityStateParts = [city, state || undefined, country].filter(Boolean);
        const cityStateAddress = cityStateParts.join(", ");
        const attempt4 = await callGoogleGeocode(cityStateAddress, countryCode, googleApiKey, "Attempt 4 (city+state)");
        if (attempt4) return makeSuccess(attempt4);
      }

      // ── Attempt 5: Sameday geolocation fallback using current city + county ──
      if (city && state) {
        try {
          const samedayResult = await callSamedayPostalLookup(
            ctx,
            city,
            state,
            countryCode
          );
          if (samedayResult) {
            return {
              postalCode: samedayResult.postalCode,
              source: "sameday",
              normalizedCity: normalizeBucharestSectorLabel(
                samedayResult.matchedCity || city,
                state,
                samedayResult.postalCode
              ),
              normalizedCounty: state,
              details: samedayResult.details,
            };
          }
        } catch (samedayErr: any) {
          console.warn(`[lookupPostalCode] Sameday fallback failed: ${samedayErr?.message || samedayErr}`);
        }
      }

      // All attempts failed
      throw new ConvexError(
        `Google nu a găsit cod poștal pentru "${city}"${cleanedAddress ? ` (strada: "${cleanedAddress}")` : ""}. ` +
          `Am încercat și fallback Sameday, dar fără rezultat. ` +
          `Completează codul poștal manual.`
      );
    } catch (e: any) {
      if (e.message?.includes("Google")) {
        throw e;
      }
      throw new ConvexError(`Eroare la Google Geocoding: ${e.message}`);
    }
  },
});
