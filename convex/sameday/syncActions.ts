import { action, internalAction } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import { api, internal } from "../_generated/api";
import type { SamedayStatusResponse } from "./shared";
import { delay } from "./shared";
import { getSamedayAuthTokenWithCache } from "./auth";

const apiAny = api as any;
const internalAny = internal as any;

export const syncDeliveryStatus = action({
  args: {
    token: v.string(),
    orderId: v.id("shopifyOrders"),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ success: boolean; status?: string; error?: string }> => {
    const user = await ctx.runQuery(apiAny.auth.getCurrentUser, {
      token: args.token,
    });
    if (!user) {
      throw new ConvexError("Sesiune invalidă. Te rugăm să te autentifici din nou.");
    }

    const order = await ctx.runQuery(apiAny.orders.getById, {
      token: args.token,
      id: args.orderId,
    });
    if (!order) {
      throw new ConvexError("Comanda nu a fost găsită.");
    }

    if (!order.trackingNumber) {
      return { success: false, error: "Comanda nu are AWB" };
    }

    const connection = await ctx.runQuery(apiAny.connections.getByType, {
      token: args.token,
      connectionType: "sameday",
    });
    if (!connection) {
      throw new ConvexError("Sameday nu este configurat.");
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
      `${baseUrl}/api/client/awb/${order.trackingNumber}/status`,
      {
        headers: {
          "X-AUTH-TOKEN": authToken,
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      return { success: false, error: `Nu s-a putut obține statusul AWB` };
    }

    const statusData = (await response.json()) as SamedayStatusResponse;

    const statusLabel =
      statusData.expeditionStatus?.statusLabel ||
      statusData.expeditionStatus?.status ||
      "necunoscut";

    await ctx.runMutation(internalAny.orders.updateDeliveryStatusInternal, {
      orderId: args.orderId,
      deliveryStatus: statusLabel,
    });

    await ctx.runMutation(internalAny.awb.updateStatusInternal, {
      awbNumber: order.trackingNumber,
      statusHistory: statusData.expeditionHistory || [],
      currentStatus: statusLabel,
    });

    return { success: true, status: statusLabel };
  },
});

export const syncAllDeliveryStatuses = action({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args): Promise<{ synced: number; failed: number }> => {
    const user = await ctx.runQuery(apiAny.auth.getCurrentUser, {
      token: args.token,
    });
    if (!user) {
      throw new ConvexError("Sesiune invalidă. Te rugăm să te autentifici din nou.");
    }

    const connection = await ctx.runQuery(apiAny.connections.getByType, {
      token: args.token,
      connectionType: "sameday",
    });
    if (!connection) {
      throw new ConvexError("Sameday nu este configurat.");
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

    const orders = await ctx.runQuery(apiAny.orders.listWithAwbUndelivered, {
      token: args.token,
      limit: 500,
      days: 45,
    });

    let synced = 0;
    let failed = 0;

    for (const order of orders) {
      try {
        await delay(200);

        const response = await fetch(
          `${baseUrl}/api/client/awb/${order.trackingNumber}/status`,
          {
            headers: {
              "X-AUTH-TOKEN": authToken,
              Accept: "application/json",
            },
          }
        );

        if (response.ok) {
          const statusData = (await response.json()) as SamedayStatusResponse;
          const statusLabel =
            statusData.expeditionStatus?.statusLabel ||
            statusData.expeditionStatus?.status ||
            "necunoscut";

          await ctx.runMutation(internalAny.orders.updateDeliveryStatusInternal, {
            orderId: order._id,
            deliveryStatus: statusLabel,
          });

          synced++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }

    return { synced, failed };
  },
});

export const syncAllDeliveryStatusesCron = internalAction({
  args: {},
  handler: async (
    ctx
  ): Promise<{ totalUsers: number; totalSynced: number; totalFailed: number; skipped?: boolean }> => {
    const cronEnabled = process.env.CRON_ENABLED;
    if (cronEnabled !== "true") {
      console.log("[Cron] Skipped - CRON_ENABLED is not set to 'true' (dev environment)");
      return { totalUsers: 0, totalSynced: 0, totalFailed: 0, skipped: true };
    }

    const connections = await ctx.runQuery(internalAny.sameday.getAllSamedayConnections);

    let totalSynced = 0;
    let totalFailed = 0;

    for (const connection of connections) {
      try {
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

        let cursor: string | undefined = undefined;
        let pagesDone = false;
        let userOrderCount = 0;

        while (!pagesDone) {
          const page: {
            orders: Array<{ _id: any; trackingNumber: string; orderNumber: string }>;
            isDone: boolean;
            continueCursor: string | null;
          } = await ctx.runQuery(internalAny.sameday.getOrdersNeedingStatusUpdate, {
            userId: connection.userId,
            cursor,
            pageSize: 200,
          });

          userOrderCount += page.orders.length;

          for (const order of page.orders) {
            try {
              await delay(200);

              const response = await fetch(
                `${baseUrl}/api/client/awb/${order.trackingNumber}/status`,
                {
                  headers: {
                    "X-AUTH-TOKEN": authToken,
                    Accept: "application/json",
                  },
                }
              );

              if (response.ok) {
                const statusData = (await response.json()) as SamedayStatusResponse;
                const statusLabel =
                  statusData.expeditionStatus?.statusLabel ||
                  statusData.expeditionStatus?.status ||
                  "necunoscut";

                await ctx.runMutation(internalAny.orders.updateDeliveryStatusInternal, {
                  orderId: order._id,
                  deliveryStatus: statusLabel,
                });

                totalSynced++;
              } else {
                totalFailed++;
              }
            } catch (err) {
              console.error(`[Cron] Error syncing order ${order.orderNumber}:`, err);
              totalFailed++;
            }
          }

          pagesDone = page.isDone;
          cursor = page.continueCursor ?? undefined;
        }

        console.log(`[Cron] User ${connection.userId}: ${userOrderCount} orders synced`);
      } catch (err) {
        console.error(`[Cron] Error processing user ${String((connection as { userId?: unknown }).userId)}:`, err);
      }
    }

    console.log(`[Cron] Sync complete: ${totalSynced} synced, ${totalFailed} failed`);

    return {
      totalUsers: connections.length,
      totalSynced,
      totalFailed,
    };
  },
});
