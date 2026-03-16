import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";

export const processReturn = action({
  args: {
    token: v.string(),
    returnId: v.id("returns"),
    orderId: v.optional(v.id("shopifyOrders")),
    addStock: v.boolean(),
    stornoInvoice: v.boolean(),
    stornoAwb: v.optional(v.boolean()),
    cancelShopify: v.optional(v.boolean()),
    cancelIntern: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    stockAdded: boolean;
    invoiceStornoed: boolean;
    invoiceSource: string;
    awbCancelled: boolean;
    shopifyCancelled: boolean;
    internCancelled: boolean;
    errors: string[];
  }> => {
    const errors: string[] = [];
    let stockAdded = false;
    let invoiceStornoed = false;
    let invoiceSource = "none";
    let awbCancelled = false;
    let shopifyCancelled = false;
    let internCancelled = false;

    const returnDoc = await ctx.runQuery(api.returns.getReturnInternal, {
      token: args.token,
      returnId: args.returnId,
    });
    if (!returnDoc) {
      throw new Error("Returul nu a fost găsit.");
    }

    let order = null;
    if (args.orderId) {
      order = await ctx.runQuery(api.orders.getById, { token: args.token, id: args.orderId });
    } else if (returnDoc.shopifyOrderId) {
      order = await ctx.runQuery(api.orders.getByShopifyId, {
        token: args.token,
        shopifyOrderId: returnDoc.shopifyOrderId,
      });
    }
    if (!order && returnDoc.awbNumber) {
      order = await ctx.runQuery(api.returns.searchOrder, {
        token: args.token,
        searchTerm: returnDoc.awbNumber,
      });
    }

    if (args.stornoAwb && order && order.trackingNumber) {
      try {
        await ctx.runAction(api.sameday.stornoAwb, { token: args.token, orderId: order._id });
        awbCancelled = true;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Eroare necunoscută";
        errors.push(`AWB: ${errorMsg}`);
      }
    }

    if (args.cancelShopify && order && order.shopifyOrderId) {
      try {
        await ctx.runAction(api.shopify.cancelOrder, {
          token: args.token,
          orderId: order._id,
          reason: "customer",
          notifyCustomer: false,
          restock: false,
        });
        shopifyCancelled = true;
      } catch (error) {
        errors.push(`Shopify: ${error instanceof Error ? error.message : "Eroare necunoscută"}`);
      }
    }

    if (args.cancelIntern && order) {
      try {
        await ctx.runMutation(api.orders.cancel, { token: args.token, orderId: order._id });
        internCancelled = true;
      } catch (error) {
        errors.push(`Intern: ${error instanceof Error ? error.message : "Eroare necunoscută"}`);
      }
    }

    if (args.stornoInvoice && order) {
      if (order.invoiceNumber && order.invoiceStatus !== "storno") {
        invoiceSource = "vnt";
        try {
          await ctx.runAction(api.fgo.stornoInvoice, { token: args.token, orderId: order._id });
          invoiceStornoed = true;
        } catch (error) {
          errors.push(`Factură: ${error instanceof Error ? error.message : "Eroare"}`);
        }
      } else if (!order.invoiceNumber) {
        invoiceSource = "external";
      } else if (order.invoiceStatus === "storno") {
        invoiceSource = "already_storno";
      }
    }

    if (args.addStock && returnDoc.returnedItems && returnDoc.returnedItems.length > 0) {
      try {
        const adjustments = (returnDoc.returnedItems as Array<{ sku?: string; quantity?: number }>)
          .filter((item) => item.sku)
          .map((item) => ({ sku: item.sku!, quantity: item.quantity || 1 }));

        if (adjustments.length > 0) {
          await ctx.runMutation(api.skus.adjustStockBatch, { token: args.token, adjustments });
          stockAdded = true;
        }
      } catch (error) {
        errors.push(`Stock: ${error instanceof Error ? error.message : "Eroare"}`);
      }
    }

    const actionsLog: string[] = [];
    if (stockAdded) actionsLog.push("Stock adăugat");
    if (invoiceStornoed) actionsLog.push(`Factură stornată (${invoiceSource})`);
    if (invoiceSource === "external") actionsLog.push("Factură externă (manual)");
    if (awbCancelled) actionsLog.push("AWB anulat");
    if (shopifyCancelled) actionsLog.push("Anulat în Shopify");
    if (internCancelled) actionsLog.push("Anulat intern");

    await ctx.runMutation(api.returns.markAsProcessedInternal, {
      token: args.token,
      returnId: args.returnId,
      stockAdded,
      invoiceStornoed,
      invoiceSource,
      processNotes:
        errors.length > 0
          ? `Acțiuni: ${actionsLog.join(", ")}. Erori: ${errors.join(", ")}`
          : actionsLog.length > 0
            ? `Acțiuni: ${actionsLog.join(", ")}`
            : undefined,
    });

    if (order) {
      await ctx.runMutation(api.returns.markOrderAsReturned, {
        token: args.token,
        orderId: order._id,
        returnId: args.returnId,
      });
    }

    return {
      success: errors.length === 0,
      stockAdded,
      invoiceStornoed,
      invoiceSource,
      awbCancelled,
      shopifyCancelled,
      internCancelled,
      errors,
    };
  },
});
