import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = "RON"): string {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(date: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("ro-RO", options || {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("ro-RO", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + "...";
}

export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    ready: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    on_hold: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    pending: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
    in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    awb_generated: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    fulfilled: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    unfulfilled: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    paid: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    unpaid: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  };
  return colors[status] || colors.pending;
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function normalizeUiErrorMessage(error: any, fallback: string = "A apărut o eroare neașteptată"): string {
  // ConvexError stores the real message in .data (string or object)
  const convexData = error?.data;
  const raw =
    (typeof convexData === "string" && convexData) ||
    (convexData && typeof convexData === "object" && convexData.message) ||
    error?.message ||
    fallback;
  
  const cleaned = String(raw)
    .replace(/\[CONVEX[^\]]*\]\s*/gi, "")
    .replace(/\[Request ID:[^\]]*\]\s*/gi, "")
    .replace(/Server Error:\s*/gi, "")
    .replace(/Uncaught Error:\s*/gi, "")
    .replace(/Server Error Called by client\s*/gi, "")
    .replace(/\s+at handler\s*\([^)]+\)\s*$/i, "")
    .trim();
    
  return cleaned || fallback;
}