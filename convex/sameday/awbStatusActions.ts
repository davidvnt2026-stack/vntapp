import { action } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import { api, internal } from "../_generated/api";
import type { BatchAwbResult, SamedayStatusResponse } from "./shared";
import { getSamedayAuthTokenWithCache } from "./auth";

export const fetchAwbStatus = action({
  args: {
    token: v.string(),
    awbNumber: v.string(),
  },
  handler: async (ctx, args): Promise<SamedayStatusResponse> => {
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
      throw new ConvexError("Sameday nu este configurat. Mergi la Connections.");
    }

    const { username, password, api_url } = connection.credentials as {
      username: string;
      password: string;
      api_url?: string;
    };
    const baseUrl = api_url || "https://api.sameday.ro";

    const authToken = await getSamedayAuthTokenWithCache(
      ctx,
      connection as any,
      username,
      password,
      baseUrl
    );

    const response = await fetch(
      `${baseUrl}/api/client/awb/${args.awbNumber}/status`,
      {
        headers: {
          "X-AUTH-TOKEN": authToken,
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new ConvexError(`Sameday: Nu s-a putut obține statusul AWB ${args.awbNumber}`);
    }

    const statusData = (await response.json()) as SamedayStatusResponse;
    const statusLabel =
      statusData.expeditionStatus?.statusLabel ||
      statusData.expeditionStatus?.status ||
      "necunoscut";

    await ctx.runMutation(internal.awb.updateStatusInternal, {
      awbNumber: args.awbNumber,
      statusHistory: statusData.expeditionHistory || [],
      currentStatus: statusLabel,
    });

    return statusData;
  },
});

export const cancelAwb = action({
  args: {
    token: v.string(),
    awbNumber: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: true }> => {
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
      throw new ConvexError("Sameday nu este configurat. Mergi la Connections.");
    }

    const { username, password, api_url } = connection.credentials as {
      username: string;
      password: string;
      api_url?: string;
    };
    const baseUrl = api_url || "https://api.sameday.ro";

    const authToken = await getSamedayAuthTokenWithCache(
      ctx,
      connection as any,
      username,
      password,
      baseUrl
    );

    const response = await fetch(`${baseUrl}/api/awb/${args.awbNumber}`, {
      method: "DELETE",
      headers: {
        "X-AUTH-TOKEN": authToken,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (errorText.includes("transition") || errorText.includes("state")) {
        throw new ConvexError(
          `AWB ${args.awbNumber} nu poate fi anulat - coletul a fost deja ridicat de curier.`
        );
      }
      throw new ConvexError(`Sameday: Nu s-a putut anula AWB-ul. ${errorText}`);
    }

    await ctx.runMutation(internal.awb.updateStatusInternal, {
      awbNumber: args.awbNumber,
      currentStatus: "cancelled",
      statusHistory: [],
    });

    return { success: true };
  },
});

export const stornoAwb = action({
  args: {
    token: v.string(),
    orderId: v.id("shopifyOrders"),
  },
  handler: async (ctx, args): Promise<{ success: true }> => {
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

    if (!order.trackingNumber) {
      throw new ConvexError("Comanda nu are un AWB de anulat.");
    }

    const awbNumber = order.trackingNumber;

    const connection = await ctx.runQuery(api.connections.getByType, {
      token: args.token,
      connectionType: "sameday",
    });
    if (!connection) {
      throw new ConvexError("Sameday nu este configurat. Mergi la Connections.");
    }

    const { username, password, api_url } = connection.credentials as {
      username: string;
      password: string;
      api_url?: string;
    };
    const baseUrl = api_url || "https://api.sameday.ro";

    const authToken = await getSamedayAuthTokenWithCache(
      ctx,
      connection as any,
      username,
      password,
      baseUrl
    );

    console.log(`[Sameday Storno] Attempting to cancel AWB: ${awbNumber}`);

    const response = await fetch(`${baseUrl}/api/awb/${awbNumber}`, {
      method: "DELETE",
      headers: {
        "X-AUTH-TOKEN": authToken,
        Accept: "application/json",
      },
    });

    console.log(`[Sameday Storno] Response status: ${response.status}, ok: ${response.ok}`);

    const responseText = await response.text();
    console.log(`[Sameday Storno] Response body: ${responseText}`);

    if (!response.ok) {
      const errorLower = responseText.toLowerCase();

      console.log(
        `[Sameday Storno] ERROR - AWB: ${awbNumber}, Status: ${response.status}, Response: ${responseText}`
      );

      if (
        errorLower.includes("comanda anulata") ||
        errorLower.includes("cancel") ||
        errorLower.includes("already") ||
        errorLower.includes("deleted") ||
        errorLower.includes("not found")
      ) {
        console.log(
          `[Sameday Storno] AWB ${awbNumber} appears to be already cancelled or in final state, clearing local tracking`
        );
        await ctx.runMutation(api.orders.clearTracking, {
          orderId: args.orderId,
        });
        return { success: true };
      }
      if (
        errorLower.includes("picked") ||
        errorLower.includes("in transit") ||
        errorLower.includes("delivered") ||
        errorLower.includes("cannot transition")
      ) {
        throw new ConvexError(`AWB ${awbNumber} nu poate fi anulat - coletul a fost deja preluat/livrat de curier.`);
      }
      throw new ConvexError(
        `Sameday: Nu s-a putut anula AWB-ul ${awbNumber}. Status: ${response.status}, Răspuns: ${responseText}`
      );
    }

    await ctx.runMutation(internal.awb.updateStatusInternal, {
      awbNumber,
      currentStatus: "cancelled",
      statusHistory: [],
    });

    await ctx.runMutation(api.orders.clearTracking, {
      orderId: args.orderId,
    });

    return { success: true };
  },
});

export const stornoBatchAwb = action({
  args: {
    token: v.string(),
    orderIds: v.array(v.id("shopifyOrders")),
  },
  handler: async (ctx, args): Promise<BatchAwbResult> => {
    const results: BatchAwbResult["results"] = [];

    for (const orderId of args.orderIds) {
      try {
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

        if (!order.trackingNumber) {
          results.push({
            orderId: orderId,
            orderNumber: order.orderNumber,
            success: false,
            error: "Nu are AWB",
          });
          continue;
        }

        await ctx.runAction(api.sameday.stornoAwb, {
          token: args.token,
          orderId,
        });

        results.push({
          orderId: orderId,
          orderNumber: order.orderNumber,
          success: true,
          awbNumber: order.trackingNumber,
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
    }

    return {
      results,
      summary: {
        total: args.orderIds.length,
        successful: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
      },
    };
  },
});
