import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { getUserFromToken } from "./auth";

export const logFrontendError = mutation({
  args: {
    token: v.optional(v.string()),
    message: v.string(),
    stack: v.optional(v.string()),
    componentStack: v.optional(v.string()),
    url: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let userId;
    if (args.token) {
      try {
        const user = await getUserFromToken(ctx, args.token);
        if (user) {
          userId = user._id;
        }
      } catch (e) {
        // ignore errors getting user for logging
      }
    }
    
    await ctx.db.insert("errorLogs", {
      message: args.message,
      stack: args.stack,
      componentStack: args.componentStack,
      url: args.url,
      userId,
      createdAt: Date.now(),
    });
  }
});
