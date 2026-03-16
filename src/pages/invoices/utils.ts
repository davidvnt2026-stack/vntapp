import type { InvoicePeriod } from "./types";

function formatDateOnly(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function getHalfMonthPeriod(baseDate: Date, half: 1 | 2): InvoicePeriod {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const start = new Date(year, month, half === 1 ? 1 : 16);
  const lastDay = new Date(year, month + 1, 0).getDate();
  const end = new Date(year, month, half === 1 ? 15 : lastDay);
  return {
    startDate: formatDateOnly(start),
    endDate: formatDateOnly(end),
  };
}

export function getDefaultBiMonthlyPeriod(): InvoicePeriod {
  const now = new Date();
  return getHalfMonthPeriod(now, now.getDate() <= 15 ? 1 : 2);
}

export function formatMonth(month: string): string {
  const [year, m] = month.split("-");
  const date = new Date(Number(year), Number(m) - 1, 1);
  return date.toLocaleDateString("ro-RO", { month: "long", year: "numeric" });
}
