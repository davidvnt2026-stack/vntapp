import { mutation, query } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import { getRealUserFromToken } from "./userHelpers";
import { getSessionByToken } from "./shared";

export const getCurrentUser = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    if (!args.token) {
      return null;
    }

    const session = await getSessionByToken(ctx, args.token);
    if (!session || session.expiresAt < Date.now()) {
      return null;
    }

    const user = await ctx.db.get(session.userId);
    if (!user) {
      return null;
    }

    return {
      _id: user._id,
      email: user.email,
      name: user.name,
      userId: user.userId,
      createdAt: user.createdAt,
      isAdmin: user.isAdmin || false,
    };
  },
});

export const listUsers = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const currentUser = await getRealUserFromToken(ctx, args.token);
    if (!currentUser) {
      throw new ConvexError("Unauthorized");
    }
    if (!currentUser.isAdmin) {
      throw new ConvexError("Forbidden");
    }

    const users = await ctx.db.query("profiles").collect();
    return users.map((u) => ({
      _id: u._id,
      email: u.email,
      name: u.name,
      isAdmin: u.isAdmin || false,
      createdAt: u.createdAt,
    }));
  },
});

export const setAdminStatus = mutation({
  args: {
    token: v.string(),
    userId: v.id("profiles"),
    isAdmin: v.boolean(),
  },
  handler: async (ctx, args) => {
    const currentUser = await getRealUserFromToken(ctx, args.token);
    if (!currentUser) {
      throw new ConvexError("Unauthorized");
    }
    if (!currentUser.isAdmin) {
      throw new ConvexError("Forbidden");
    }

    await ctx.db.patch(args.userId, {
      isAdmin: args.isAdmin,
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});

export const startImpersonation = mutation({
  args: {
    token: v.string(),
    targetUserId: v.id("profiles"),
  },
  handler: async (ctx, args) => {
    const adminUser = await getRealUserFromToken(ctx, args.token);
    if (!adminUser || !adminUser.isAdmin) {
      throw new ConvexError("Only admins can impersonate users");
    }

    const targetUser = await ctx.db.get(args.targetUserId);
    if (!targetUser) {
      throw new ConvexError("User not found");
    }

    const session = await getSessionByToken(ctx, args.token);
    if (!session) {
      throw new ConvexError("Session not found");
    }

    await ctx.db.patch(session._id, { impersonatingUserId: args.targetUserId });
    return {
      success: true,
      impersonating: {
        _id: targetUser._id,
        email: targetUser.email,
        name: targetUser.name,
      },
    };
  },
});

export const stopImpersonation = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await getSessionByToken(ctx, args.token);
    if (!session) {
      throw new ConvexError("Session not found");
    }

    await ctx.db.patch(session._id, { impersonatingUserId: undefined });
    return { success: true };
  },
});

export const getImpersonationStatus = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await getSessionByToken(ctx, args.token);
    if (!session || session.expiresAt < Date.now()) {
      return { isImpersonating: false, impersonatedUser: null, realUser: null };
    }

    const realUser = await ctx.db.get(session.userId);
    if (session.impersonatingUserId) {
      const impersonatedUser = await ctx.db.get(session.impersonatingUserId);
      if (impersonatedUser) {
        return {
          isImpersonating: true,
          impersonatedUser: {
            _id: impersonatedUser._id,
            email: impersonatedUser.email,
            name: impersonatedUser.name,
          },
          realUser: realUser
            ? {
                _id: realUser._id,
                email: realUser.email,
                name: realUser.name,
                isAdmin: realUser.isAdmin || false,
              }
            : null,
        };
      }
    }

    return {
      isImpersonating: false,
      impersonatedUser: null,
      realUser: realUser
        ? {
            _id: realUser._id,
            email: realUser.email,
            name: realUser.name,
            isAdmin: realUser.isAdmin || false,
          }
        : null,
    };
  },
});
