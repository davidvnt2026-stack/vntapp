"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

// ============================================
// COURIER SUMMARY WEBHOOK
// Receives Excel file from Make (automation), parses it,
// and runs the same admin courier summary save flow.
// ============================================

/**
 * Parse a numeric value from an Excel cell (same logic as frontend).
 */
function parseNumericValue(value: any): number {
  if (value === null || value === undefined || value === "") return 0;
  let stringValue = String(value)
    .trim()
    .replace(/\s+/g, "")
    .replace(/RON/gi, "")
    .replace(/[^\d,.-]/g, "")
    .replace(",", ".");
  return parseFloat(stringValue) || 0;
}

/**
 * Normalize an address string (same logic as frontend).
 */
function normalizeAddress(value: any): string {
  if (!value) return "";
  return String(value).trim();
}

/**
 * Process an Excel worksheet and extract address groups with COD totals.
 * Mirrors the frontend processSheet() logic from CourierSummaryPage.
 */
function processSheet(worksheet: any, XLSX: any): {
  groups: Array<{ address: string; total: number; orderCount: number }>;
  grandTotal: number;
  totalRows: number;
} {
  const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1:Z1000");
  const groupsMap = new Map<string, { total: number; count: number }>();
  let grandTotal = 0;
  let totalRows = 0;

  for (let row = range.s.r + 1; row <= range.e.r; row++) {
    const columnCells: any[] = [];
    for (let col = 0; col <= 10; col++) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: col })];
      columnCells.push(cell ? cell.v : "");
    }

    // Column 5 = pickup address
    const pickupAddress = normalizeAddress(columnCells[5]);
    if (!pickupAddress) continue;

    // Column 7 = COD amount
    const codAmount = parseNumericValue(columnCells[7]);
    grandTotal += codAmount;
    totalRows++;

    if (!groupsMap.has(pickupAddress)) {
      groupsMap.set(pickupAddress, { total: 0, count: 0 });
    }
    const group = groupsMap.get(pickupAddress)!;
    group.total += codAmount;
    group.count++;
  }

  const groups = Array.from(groupsMap.entries())
    .map(([address, data]) => ({
      address,
      total: data.total,
      orderCount: data.count,
    }))
    .sort((a, b) => b.total - a.total);

  return { groups, grandTotal, totalRows };
}

/**
 * Action: Process courier summary Excel file posted from Make.
 * Parses the Excel, extracts address groups, and saves via adminSaveRevenueForUsers.
 *
 * The file is received as a base64-encoded string (from the HTTP endpoint).
 */
export const processExcelFromWebhook = action({
  args: {
    fileBase64: v.string(),
    fileName: v.optional(v.string()),
    date: v.optional(v.string()), // Optional override, defaults to today
    sheetName: v.optional(v.string()), // Optional sheet name override
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    error?: string;
    date?: string;
    sheet?: string;
    fileName?: string;
    totalRows: number;
    addressGroups?: number;
    grandTotal: number;
    saveResult?: any;
  }> => {
    // Dynamic import of xlsx (node runtime)
    const xlsxModule = await import("xlsx");
    const XLSX = xlsxModule.default || xlsxModule;

    // Decode base64 to buffer
    const buffer = Buffer.from(args.fileBase64, "base64");
    const wb = XLSX.read(buffer, { type: "buffer" });

    console.log(
      `[CourierSummaryWebhook] Processing file: ${args.fileName || "unknown"}, sheets: ${wb.SheetNames.join(", ")}`
    );

    // Find the right sheet (same logic as frontend)
    let targetSheet: string;

    if (args.sheetName && wb.SheetNames.includes(args.sheetName)) {
      targetSheet = args.sheetName;
    } else {
      // Look for "expeditii" or "expeditie" sheet
      const expeditiiSheet = wb.SheetNames.find(
        (name: string) =>
          name.toLowerCase().includes("expeditii") ||
          name.toLowerCase().includes("expeditie")
      );

      if (expeditiiSheet) {
        targetSheet = expeditiiSheet;
      } else if (wb.SheetNames.length === 1) {
        targetSheet = wb.SheetNames[0];
      } else {
        throw new Error(
          `Multiple sheets found (${wb.SheetNames.join(", ")}), but none match "expeditii/expeditie". ` +
          `Please specify the sheet name via the "sheetName" parameter.`
        );
      }
    }

    console.log(`[CourierSummaryWebhook] Using sheet: "${targetSheet}"`);

    const worksheet = wb.Sheets[targetSheet];
    const { groups, grandTotal, totalRows } = processSheet(worksheet, XLSX);

    if (groups.length === 0) {
      return {
        success: false,
        error: "No data found in the spreadsheet. Check that column F has pickup addresses and column H has COD amounts.",
        totalRows: 0,
        grandTotal: 0,
      };
    }

    // Determine date: use provided date or today
    const date = args.date || new Date().toISOString().split("T")[0];

    console.log(
      `[CourierSummaryWebhook] Parsed ${totalRows} rows, ${groups.length} address groups, ` +
      `grand total: ${grandTotal}, date: ${date}`
    );

    // Use an internal admin mutation that doesn't require a user token.
    // @ts-ignore TS2589 — large generated api type graph
    const result = await ctx.runMutation(api.courierRevenue.adminSaveRevenueFromWebhook, {
      date,
      groups,
    });

    return {
      success: true,
      date,
      sheet: targetSheet,
      fileName: args.fileName || "unknown",
      totalRows,
      addressGroups: groups.length,
      grandTotal,
      saveResult: result,
    };
  },
});
