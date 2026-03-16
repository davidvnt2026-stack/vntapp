import type { DailyReturnGroup } from "./types";

export function formatReturnsDate(dateStr: string): string {
  const date = new Date(dateStr);
  const options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  };
  return date.toLocaleDateString("ro-RO", options);
}

export function exportDailyHistoryCsv(dailyHistory: DailyReturnGroup[]): string {
  const headers = ["Data", "Unitati", "Comenzi", "SKU-uri"];
  const rows = dailyHistory.map((day) => [
    day.date,
    day.totalUnits,
    day.totalOrders,
    day.uniqueSkus,
  ]);

  return [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
}
