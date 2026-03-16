import type { Id } from "../_generated/dataModel";
import { getSessionByToken } from "./shared";

export async function getUserFromToken(
  ctx: { db: any },
  token: string
): Promise<{ _id: Id<"profiles">; email: string; name?: string; isAdmin?: boolean } | null> {
  if (!token) {
    return null;
  }

  const session = await getSessionByToken(ctx, token);
  if (!session || session.expiresAt < Date.now()) {
    return null;
  }

  if (session.impersonatingUserId) {
    const impersonatedUser = await ctx.db.get(session.impersonatingUserId);
    if (impersonatedUser) {
      return {
        _id: impersonatedUser._id,
        email: impersonatedUser.email,
        name: impersonatedUser.name,
        isAdmin: false,
      };
    }
  }

  const user = await ctx.db.get(session.userId);
  if (!user) {
    return null;
  }

  return {
    _id: user._id,
    email: user.email,
    name: user.name,
    isAdmin: user.isAdmin || false,
  };
}

export async function getRealUserFromToken(
  ctx: { db: any },
  token: string
): Promise<{ _id: Id<"profiles">; email: string; name?: string; isAdmin?: boolean } | null> {
  if (!token) {
    return null;
  }

  const session = await getSessionByToken(ctx, token);
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
    isAdmin: user.isAdmin || false,
  };
}
