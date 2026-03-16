import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getUserFromToken } from "./auth";

export const list = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new Error("Unauthorized");
    }
    
    const connections = await ctx.db
      .query("userConnections")
      .withIndex("by_userId", q => q.eq("userId", user._id))
      .collect();
    
    // Hide sensitive credentials in response
    return connections.map(conn => ({
      _id: conn._id,
      connectionType: conn.connectionType,
      connectionName: conn.connectionName,
      isActive: conn.isActive,
      hasCredentials: !!conn.credentials,
      createdAt: conn.createdAt,
      updatedAt: conn.updatedAt,
    }));
  },
});

export const getByType = query({
  args: {
    token: v.string(),
    connectionType: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new Error("Unauthorized");
    }
    
    const connection = await ctx.db
      .query("userConnections")
      .withIndex("by_userId_type", q => 
        q.eq("userId", user._id).eq("connectionType", args.connectionType)
      )
      .first();
    
    return connection;
  },
});

export const create = mutation({
  args: {
    token: v.string(),
    connectionType: v.string(),
    connectionName: v.string(),
    credentials: v.any(),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new Error("Unauthorized");
    }
    
    // Check if connection of this type already exists
    const existing = await ctx.db
      .query("userConnections")
      .withIndex("by_userId_type", q => 
        q.eq("userId", user._id).eq("connectionType", args.connectionType)
      )
      .first();
    
    if (existing) {
      // Update existing connection
      await ctx.db.patch(existing._id, {
        connectionName: args.connectionName,
        credentials: args.credentials,
        isActive: true,
        updatedAt: Date.now(),
      });
      return existing._id;
    }
    
    // Create new connection
    const id = await ctx.db.insert("userConnections", {
      userId: user._id,
      connectionType: args.connectionType,
      connectionName: args.connectionName,
      credentials: args.credentials,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    
    return id;
  },
});

export const update = mutation({
  args: {
    token: v.string(),
    connectionId: v.id("userConnections"),
    connectionName: v.optional(v.string()),
    credentials: v.optional(v.any()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new Error("Unauthorized");
    }
    
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.userId !== user._id) {
      throw new Error("Connection not found");
    }
    
    const updates: Record<string, any> = {
      updatedAt: Date.now(),
    };
    
    if (args.connectionName !== undefined) {
      updates.connectionName = args.connectionName;
    }
    if (args.credentials !== undefined) {
      updates.credentials = args.credentials;
    }
    if (args.isActive !== undefined) {
      updates.isActive = args.isActive;
    }
    
    await ctx.db.patch(args.connectionId, updates);
    
    return { success: true };
  },
});

export const remove = mutation({
  args: {
    token: v.string(),
    connectionId: v.id("userConnections"),
  },
  handler: async (ctx, args) => {
    const user = await getUserFromToken(ctx, args.token);
    if (!user) {
      throw new Error("Unauthorized");
    }
    
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.userId !== user._id) {
      throw new Error("Connection not found");
    }
    
    await ctx.db.delete(args.connectionId);
    
    return { success: true };
  },
});

// Update auth token cache for Sameday
export const updateAuthToken = mutation({
  args: {
    connectionId: v.id("userConnections"),
    authToken: v.string(),
    expiresAt: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.connectionId, {
      authToken: args.authToken,
      authTokenExpiresAt: args.expiresAt,
      updatedAt: Date.now(),
    });
  },
});
