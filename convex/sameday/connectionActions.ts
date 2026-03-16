import { action } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import type { SamedayService } from "./shared";
import { authenticateSameday, getSamedayAuthTokenWithCache } from "./auth";

export const fetchPickupPoints = action({
  args: {
    username: v.string(),
    password: v.string(),
    apiUrl: v.optional(v.string()),
  },
  handler: async (
    _ctx,
    args
  ): Promise<{
    pickupPoints: Array<{
      id: number;
      name: string;
      address: string;
      isDefault: boolean;
      contactPersons: Array<{
        id: number;
        name: string;
        phone: string;
        isDefault: boolean;
      }>;
    }>;
  }> => {
    const baseUrl = args.apiUrl || "https://api.sameday.ro";

    const authToken = await authenticateSameday(args.username, args.password, baseUrl);

    const response = await fetch(`${baseUrl}/api/client/pickup-points`, {
      headers: {
        "X-AUTH-TOKEN": authToken,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Sameday: Nu s-au putut prelua punctele de ridicare - ${text}`);
    }

    const rawData = await response.json();
    console.log("=== RAW SAMEDAY PICKUP POINTS (full) ===");
    console.log(JSON.stringify(rawData, null, 2));

    const pickupPointsRaw: any[] = Array.isArray(rawData)
      ? rawData
      : rawData.data || rawData.pickupPoints || [];

    if (pickupPointsRaw.length > 0) {
      console.log("=== FIRST PICKUP POINT KEYS ===", Object.keys(pickupPointsRaw[0]));
      for (const [key, value] of Object.entries(pickupPointsRaw[0])) {
        if (value && typeof value === "object") {
          console.log(`  PP field '${key}':`, JSON.stringify(value));
        }
      }
    }

    const pickupPoints = await Promise.all(
      pickupPointsRaw.map(async (pp: any) => {
        const findContacts = (obj: any): any[] => {
          const possibleFields = [
            "pickupPointContactPerson",
            "contactPersons",
            "contactPerson",
            "contact_persons",
            "contacts",
            "defaultContactPerson",
          ];
          for (const field of possibleFields) {
            const val = obj[field];
            if (val === undefined || val === null) continue;
            if (!Array.isArray(val) && typeof val === "object") return [val];
            if (Array.isArray(val) && val.length > 0) return val;
          }
          return [];
        };

        let contactPersonsRaw = findContacts(pp);

        console.log(`PP ${pp.id} embedded fields:`, Object.keys(pp).join(", "));

        if (contactPersonsRaw.length === 0) {
          console.log(`No embedded contacts for PP ${pp.id}, trying detail endpoint...`);
          try {
            const ppDetailRes = await fetch(
              `${baseUrl}/api/client/pickup-points/${pp.id}`,
              {
                headers: {
                  "X-AUTH-TOKEN": authToken,
                  Accept: "application/json",
                },
              }
            );
            if (ppDetailRes.ok) {
              const ppDetail = await ppDetailRes.json();
              console.log(`PP ${pp.id} detail keys:`, Object.keys(ppDetail).join(", "));
              console.log(
                `PP ${pp.id} detail (first 800 chars):`,
                JSON.stringify(ppDetail).substring(0, 800)
              );
              contactPersonsRaw = findContacts(ppDetail);
              if (contactPersonsRaw.length === 0 && ppDetail.data) {
                contactPersonsRaw = findContacts(ppDetail.data);
              }
            }
          } catch (e) {
            console.log(`Failed to fetch PP detail for ${pp.id}:`, e);
          }
        }

        if (contactPersonsRaw.length === 0) {
          console.log(`Trying /pickup-points/${pp.id}/contact-persons ...`);
          try {
            const cpRes = await fetch(
              `${baseUrl}/api/client/pickup-points/${pp.id}/contact-persons`,
              {
                headers: {
                  "X-AUTH-TOKEN": authToken,
                  Accept: "application/json",
                },
              }
            );
            if (cpRes.ok) {
              const cpData = await cpRes.json();
              console.log(
                `PP ${pp.id} contact-persons endpoint:`,
                JSON.stringify(cpData).substring(0, 800)
              );
              contactPersonsRaw = Array.isArray(cpData)
                ? cpData
                : cpData.data || cpData.contactPersons || cpData.pickupPointContactPerson || [];
            } else {
              console.log(`PP ${pp.id} contact-persons endpoint: ${cpRes.status}`);
            }
          } catch (e) {
            console.log(`Failed contact-persons endpoint for PP ${pp.id}:`, e);
          }
        }

        const validContacts = contactPersonsRaw.filter((cp: any) => cp && cp.id);
        const contactPersons = validContacts.map((cp: any) => ({
          id: cp.id,
          name:
            cp.name ||
            cp.fullName ||
            `${cp.firstName || ""} ${cp.lastName || ""}`.trim() ||
            "Contact",
          phone: cp.phone || cp.phoneNumber || cp.phone_number || "",
          isDefault: cp.isDefault || cp.is_default || cp.defaultContactPerson || cp.default || false,
        }));

        console.log(
          `PP ${pp.id} "${pp.name || pp.alias}": ${contactPersons.length} contact person(s) found`
        );
        if (contactPersons.length > 0) {
          console.log(`  Contacts:`, JSON.stringify(contactPersons));
        }

        return {
          id: pp.id,
          name: pp.name || pp.alias || pp.pickupPointName || "",
          address: pp.address || pp.fullAddress || pp.street || "",
          isDefault: pp.isDefault || pp.is_default || pp.defaultPickupPoint || pp.default || false,
          contactPersons,
        };
      })
    );

    return { pickupPoints };
  },
});

export const getServices = action({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args): Promise<SamedayService[]> => {
    const user = await ctx.runQuery(api.auth.getCurrentUser, {
      token: args.token,
    });
    if (!user) {
      throw new Error("Sesiune invalidă. Te rugăm să te autentifici din nou.");
    }

    const connection = await ctx.runQuery(api.connections.getByType, {
      token: args.token,
      connectionType: "sameday",
    });
    if (!connection) {
      throw new Error(
        "Sameday nu este configurat. Mergi la Connections și adaugă credențialele Sameday."
      );
    }

    const creds = connection.credentials as {
      username?: string;
      password?: string;
      api_url?: string;
    };

    if (!creds.username || !creds.password) {
      throw new Error("Sameday: Lipsesc credențialele (username/password).");
    }

    const baseUrl = creds.api_url || "https://api.sameday.ro";

    const authToken = await getSamedayAuthTokenWithCache(
      ctx,
      connection as any,
      creds.username,
      creds.password,
      baseUrl
    );

    const response = await fetch(`${baseUrl}/api/client/services`, {
      headers: {
        "X-AUTH-TOKEN": authToken,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error("Sameday: Nu s-au putut prelua serviciile disponibile.");
    }

    const rawData = await response.json();
    console.log("=== RAW SAMEDAY SERVICES RESPONSE ===");
    console.log(JSON.stringify(rawData, null, 2));

    const data = rawData as { data?: SamedayService[] } | SamedayService[];
    const services = Array.isArray(data) ? data : data.data || [];

    if (services.length > 0) {
      console.log("=== FIRST SERVICE FULL STRUCTURE ===");
      console.log(JSON.stringify(services[0], null, 2));
      console.log("Available fields in first service:", Object.keys(services[0]));

      for (const [key, value] of Object.entries(services[0])) {
        if (value && typeof value === "object") {
          console.log(`Field '${key}' is an object/array:`, JSON.stringify(value, null, 2));
        }
      }
    }

    const servicesWithTaxes = await Promise.all(
      services.map(async (s: any) => {
        let optionalTaxes: Array<{
          id: number;
          name: string;
          code: string;
          packageType?: number;
        }> = [];

        const possibleTaxFields = [
          "serviceOptionalTaxes",
          "optionalTaxes",
          "extraOptions",
          "extraServices",
          "serviceTaxes",
          "taxes",
          "options",
        ];

        for (const field of possibleTaxFields) {
          if (s[field] && Array.isArray(s[field]) && s[field].length > 0) {
            console.log(
              `Found taxes in field '${field}' for service ${s.id}:`,
              JSON.stringify(s[field])
            );
            optionalTaxes = s[field];
            break;
          }
        }

        if (optionalTaxes.length === 0) {
          try {
            const taxResponse = await fetch(
              `${baseUrl}/api/client/services/${s.id}/optional-taxes`,
              {
                headers: {
                  "X-AUTH-TOKEN": authToken,
                  Accept: "application/json",
                },
              }
            );

            if (taxResponse.ok) {
              const taxData = await taxResponse.json();
              console.log(
                `Service ${s.id} optional-taxes endpoint response:`,
                JSON.stringify(taxData)
              );
              optionalTaxes = Array.isArray(taxData) ? taxData : taxData.data || [];
            } else {
              console.log(`Service ${s.id} optional-taxes endpoint returned ${taxResponse.status}`);
            }
          } catch (taxError) {
            console.log(`Could not fetch optional taxes for service ${s.id}:`, taxError);
          }
        }

        if (optionalTaxes.length === 0) {
          try {
            const allTaxesResponse = await fetch(
              `${baseUrl}/api/client/optional-taxes`,
              {
                headers: {
                  "X-AUTH-TOKEN": authToken,
                  Accept: "application/json",
                },
              }
            );

            if (allTaxesResponse.ok) {
              const allTaxesData = await allTaxesResponse.json();
              console.log(
                "All client optional-taxes response:",
                JSON.stringify(allTaxesData)
              );
              const allTaxes = Array.isArray(allTaxesData)
                ? allTaxesData
                : allTaxesData.data || [];
              const isApplicableToService = (tax: any): boolean => {
                const serviceId = s.id;
                if (tax?.serviceId === serviceId || tax?.service_id === serviceId) return true;
                if (tax?.service?.id === serviceId) return true;
                const ids =
                  tax?.serviceIds ||
                  tax?.service_ids ||
                  tax?.services ||
                  tax?.serviceList ||
                  tax?.availableServices;
                if (Array.isArray(ids)) {
                  return ids.map((x: any) => Number(x)).includes(Number(serviceId));
                }
                return false;
              };

              const filtered = allTaxes.filter(isApplicableToService);
              if (filtered.length > 0) {
                optionalTaxes = filtered;
                console.log(
                  `Matched ${filtered.length}/${allTaxes.length} global optional taxes for service ${s.id}`
                );
              } else {
                console.log(
                  `Global optional taxes returned ${allTaxes.length} taxes, but none matched service ${s.id}. Leaving taxes empty for this service.`
                );
              }
            }
          } catch (e) {
            // Endpoint might not exist
          }
        }

        const normalizedTaxes = optionalTaxes.map((tax: any) => ({
          id: tax.id,
          name: tax.name,
          code: tax.taxCode || tax.code || "",
          packageType: tax.packageType,
        }));

        if (normalizedTaxes.length > 0) {
          console.log(
            `=== Service ${s.id} (${s.name}) NORMALIZED TAXES ===`,
            JSON.stringify(normalizedTaxes)
          );
        }

        return {
          id: s.id,
          name: s.name,
          code: s.serviceCode || s.code || "",
          isCrossborder: s.name?.toLowerCase().includes("crossborder") || false,
          deliveryType: s.name?.toLowerCase().includes("locker") ? "locker" : "home",
          serviceOptionalTaxes: normalizedTaxes,
        };
      })
    );

    return servicesWithTaxes;
  },
});

export const debugSamedayServices = action({
  args: {},
  handler: async (ctx): Promise<{ rawResponse: unknown; services: unknown[] }> => {
    const connection = await ctx.runQuery(internal.sameday.getAnySamedayConnection);
    if (!connection) throw new Error("Sameday not configured");

    const creds = connection.credentials as {
      username?: string;
      password?: string;
      api_url?: string;
    };
    if (!creds.username || !creds.password) throw new Error("Missing credentials");

    const baseUrl = creds.api_url || "https://api.sameday.ro";
    const authToken = await getSamedayAuthTokenWithCache(
      ctx,
      connection as any,
      creds.username,
      creds.password,
      baseUrl
    );

    const response = await fetch(`${baseUrl}/api/client/services`, {
      headers: { "X-AUTH-TOKEN": authToken, Accept: "application/json" },
    });
    const rawResponse = await response.json();

    const services = Array.isArray(rawResponse) ? rawResponse : rawResponse.data || [];

    const servicesWithDebug = await Promise.all(
      services.map(async (s: any) => {
        let optionalTaxesEndpoint = null;
        try {
          const taxRes = await fetch(
            `${baseUrl}/api/client/services/${s.id}/optional-taxes`,
            {
              headers: { "X-AUTH-TOKEN": authToken, Accept: "application/json" },
            }
          );
          if (taxRes.ok) {
            optionalTaxesEndpoint = await taxRes.json();
          } else {
            optionalTaxesEndpoint = { status: taxRes.status, statusText: taxRes.statusText };
          }
        } catch (e: any) {
          optionalTaxesEndpoint = { error: e.message };
        }

        return {
          ...s,
          _debug_optionalTaxesEndpoint: optionalTaxesEndpoint,
          _debug_allKeys: Object.keys(s),
        };
      })
    );

    let globalOptionalTaxes = null;
    try {
      const globalRes = await fetch(`${baseUrl}/api/client/optional-taxes`, {
        headers: { "X-AUTH-TOKEN": authToken, Accept: "application/json" },
      });
      if (globalRes.ok) {
        globalOptionalTaxes = await globalRes.json();
      } else {
        globalOptionalTaxes = { status: globalRes.status, statusText: globalRes.statusText };
      }
    } catch (e: any) {
      globalOptionalTaxes = { error: e.message };
    }

    return {
      rawResponse: {
        servicesCount: services.length,
        firstServiceKeys: services.length > 0 ? Object.keys(services[0]) : [],
        globalOptionalTaxes,
      },
      services: servicesWithDebug,
    };
  },
});
