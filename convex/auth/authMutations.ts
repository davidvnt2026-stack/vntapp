import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { generateToken, getSessionByToken, hashPassword, requireSession, verifyPassword } from "./shared";

export const signUp = mutation({
  args: {
    email: v.string(),
    password: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .first();
    if (existing) {
      throw new Error("Email already exists");
    }

    const passwordHash = await hashPassword(args.password);
    const userId = generateToken();

    const profileId = await ctx.db.insert("profiles", {
      email: args.email.toLowerCase(),
      name: args.name,
      passwordHash,
      userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const token = generateToken();
    await ctx.db.insert("sessions", {
      userId: profileId,
      token,
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      createdAt: Date.now(),
    });

    return {
      token,
      user: {
        _id: profileId,
        email: args.email.toLowerCase(),
        name: args.name,
      },
    };
  },
});

export const signIn = mutation({
  args: {
    email: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("profiles")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .first();
    if (!user) {
      throw new Error("Invalid credentials");
    }

    const valid = await verifyPassword(args.password, user.passwordHash);
    if (!valid) {
      throw new Error("Invalid credentials");
    }

    const token = generateToken();
    await ctx.db.insert("sessions", {
      userId: user._id,
      token,
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      createdAt: Date.now(),
    });

    return {
      token,
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
      },
    };
  },
});

export const signOut = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await getSessionByToken(ctx, args.token);
    if (session) {
      await ctx.db.delete(session._id);
    }
    return { success: true };
  },
});

export const updateProfile = mutation({
  args: {
    token: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const session = await requireSession(ctx, args.token);
    await ctx.db.patch(session.userId, {
      name: args.name,
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});

export const changePassword = mutation({
  args: {
    token: v.string(),
    currentPassword: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await requireSession(ctx, args.token);
    const user = await ctx.db.get(session.userId);
    if (!user) {
      throw new Error("User not found");
    }

    const valid = await verifyPassword(args.currentPassword, user.passwordHash);
    if (!valid) {
      throw new Error("Current password is incorrect");
    }

    const newPasswordHash = await hashPassword(args.newPassword);
    await ctx.db.patch(session.userId, {
      passwordHash: newPasswordHash,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});
