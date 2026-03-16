export type ReturnStatus = "pending" | "processed" | "cancelled";
export type InvoiceSource = "vnt" | "external" | "unknown";

export const toDateOnly = (d: Date) => d.toISOString().split("T")[0];

export async function getReturnsByDateRange(
  ctx: any,
  userId: string,
  startDate: string,
  endDate?: string,
  shopDomain?: string
) {
  if (shopDomain) {
    return endDate
      ? await ctx.db
          .query("returns")
          .withIndex("by_userId_shopDomain_returnDate", (q: any) =>
            q.eq("userId", userId).eq("shopDomain", shopDomain).gte("returnDate", startDate).lte("returnDate", endDate)
          )
          .collect()
      : await ctx.db
          .query("returns")
          .withIndex("by_userId_shopDomain_returnDate", (q: any) =>
            q.eq("userId", userId).eq("shopDomain", shopDomain).gte("returnDate", startDate)
          )
          .collect();
  }

  return endDate
    ? await ctx.db
        .query("returns")
        .withIndex("by_userId_returnDate", (q: any) =>
          q.eq("userId", userId).gte("returnDate", startDate).lte("returnDate", endDate)
        )
        .collect()
    : await ctx.db
        .query("returns")
        .withIndex("by_userId_returnDate", (q: any) =>
          q.eq("userId", userId).gte("returnDate", startDate)
        )
        .collect();
}
