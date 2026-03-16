import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { getUserFromToken } from "../auth";

export const getReturnInternal = query({
  args: {
    token: v.string(),
    returnId: v.id("returns"),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) return null;

    const returnDoc = await ctx.db.get(args.returnId);
    if (!returnDoc || returnDoc.userId !== user._id) return null;
    return returnDoc;
  },
});

export const markAsProcessedInternal = mutation({
  args: {
    token: v.string(),
    returnId: v.id("returns"),
    stockAdded: v.boolean(),
    invoiceStornoed: v.boolean(),
    invoiceSource: v.string(),
    processNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) throw new Error("Sesiune expirată.");

    const returnDoc = await ctx.db.get(args.returnId);
    if (!returnDoc || returnDoc.userId !== user._id) {
      throw new Error("Returul nu a fost găsit.");
    }

    const existingNotes = returnDoc.notes || "";
    const processInfo = `\n[Procesat ${new Date().toLocaleString("ro-RO")}] Stock: ${
      args.stockAdded ? "Da" : "Nu"
    }, Invoice storno: ${args.invoiceStornoed ? "Da" : "Nu"} (${args.invoiceSource})`;
    const additionalNotes = args.processNotes ? `\n${args.processNotes}` : "";

    await ctx.db.patch(args.returnId, {
      returnStatus: "processed",
      notes: existingNotes + processInfo + additionalNotes,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});
