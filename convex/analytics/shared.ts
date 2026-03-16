export function normalizeSku(value?: string): string {
  return (value || "").trim().toUpperCase();
}

export const toDateOnly = (d: Date) => d.toISOString().split("T")[0];

export function formatDisplayDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const day = date.getDate();
  const month = date.toLocaleString("en-US", { month: "short" });
  return `${day} ${month}`;
}

export async function getValidSession(ctx: any, token: string) {
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q: any) => q.eq("token", token))
    .first();

  if (!session || session.expiresAt < Date.now()) {
    throw new Error("Sesiune expirată. Te rugăm să te autentifici din nou.");
  }

  return session;
}

export async function getReturnsByRange(
  ctx: any,
  userId: string,
  startDate: string,
  endDate?: string,
  shopDomain?: string,
  scanLimit?: number
) {
  if (shopDomain) {
    const queryBuilder = endDate
      ? ctx.db
          .query("returns")
          .withIndex("by_userId_shopDomain_returnDate", (q: any) =>
            q.eq("userId", userId).eq("shopDomain", shopDomain).gte("returnDate", startDate).lte("returnDate", endDate)
          )
      : ctx.db
          .query("returns")
          .withIndex("by_userId_shopDomain_returnDate", (q: any) =>
            q.eq("userId", userId).eq("shopDomain", shopDomain).gte("returnDate", startDate)
          );
    return scanLimit ? queryBuilder.order("desc").take(scanLimit) : queryBuilder.collect();
  }

  const queryBuilder = endDate
    ? ctx.db
        .query("returns")
        .withIndex("by_userId_returnDate", (q: any) =>
          q.eq("userId", userId).gte("returnDate", startDate).lte("returnDate", endDate)
        )
    : ctx.db
        .query("returns")
        .withIndex("by_userId_returnDate", (q: any) =>
          q.eq("userId", userId).gte("returnDate", startDate)
        );
  return scanLimit ? queryBuilder.order("desc").take(scanLimit) : queryBuilder.collect();
}
