import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";
import type { PdfResult } from "./shared";
import { delay } from "./shared";
import { getSamedayAuthTokenWithCache } from "./auth";

export const downloadAwbPdf = action({
  args: {
    token: v.string(),
    awbNumber: v.string(),
    format: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<PdfResult> => {
    const user = await ctx.runQuery(api.auth.getCurrentUser, {
      token: args.token,
    });
    if (!user) {
      throw new Error("Sesiune invalidă. Te rugăm să te autentifici din nou.");
    }

    const connection = await ctx.runQuery(api.connections.getByType, {
      token: args.token,
      connectionType: "sameday",
    });
    if (!connection) {
      throw new Error("Sameday nu este configurat. Mergi la Connections.");
    }

    const { username, password, api_url } = connection.credentials as {
      username: string;
      password: string;
      api_url?: string;
    };
    const baseUrl = api_url || "https://api.sameday.ro";

    const authToken = await getSamedayAuthTokenWithCache(
      ctx,
      connection as any,
      username,
      password,
      baseUrl
    );

    const format = args.format || "A6";
    const response = await fetch(
      `${baseUrl}/api/awb/download/${args.awbNumber}/${format}`,
      {
        headers: {
          "X-AUTH-TOKEN": authToken,
          Accept: "application/pdf",
        },
      }
    );

    if (!response.ok) {
      let errorDetails = "";
      try {
        const errorText = await response.text();
        errorDetails = ` (${response.status}: ${errorText.substring(0, 200)})`;
      } catch {
        errorDetails = ` (${response.status})`;
      }
      throw new Error(
        `Sameday: Nu s-a putut descărca PDF-ul pentru AWB ${args.awbNumber}${errorDetails}`
      );
    }

    const contentType = response.headers.get("content-type");
    if (contentType && !contentType.includes("application/pdf")) {
      const text = await response.text();
      throw new Error(
        `Sameday: Răspuns invalid pentru AWB ${args.awbNumber} (expected PDF, got ${contentType}): ${text.substring(0, 200)}`
      );
    }

    const buffer = await response.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));

    return {
      pdf: base64,
      contentType: "application/pdf",
      filename: `AWB-${args.awbNumber}.pdf`,
    };
  },
});

export const downloadAwbPdfsBatch = action({
  args: {
    token: v.string(),
    awbNumbers: v.array(v.string()),
    format: v.optional(v.string()),
    delayMs: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    results: Array<{ awbNumber: string; pdf?: string; error?: string }>;
    successCount: number;
    failedCount: number;
  }> => {
    if (args.awbNumbers.length === 0) {
      return { results: [], successCount: 0, failedCount: 0 };
    }

    const user = await ctx.runQuery(api.auth.getCurrentUser, {
      token: args.token,
    });
    if (!user) {
      throw new Error("Sesiune invalidă. Te rugăm să te autentifici din nou.");
    }

    const connection = await ctx.runQuery(api.connections.getByType, {
      token: args.token,
      connectionType: "sameday",
    });
    if (!connection) {
      throw new Error("Sameday nu este configurat. Mergi la Connections.");
    }

    const { username, password, api_url } = connection.credentials as {
      username: string;
      password: string;
      api_url?: string;
    };
    const baseUrl = api_url || "https://api.sameday.ro";
    const format = args.format || "A6";
    const perRequestDelayMs = Math.max(0, Math.floor(args.delayMs ?? 350));

    const authToken = await getSamedayAuthTokenWithCache(
      ctx,
      connection as any,
      username,
      password,
      baseUrl
    );

    const results: Array<{ awbNumber: string; pdf?: string; error?: string }> = [];
    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < args.awbNumbers.length; i++) {
      const awbNumber = args.awbNumbers[i];

      if (i > 0 && perRequestDelayMs > 0) {
        await delay(perRequestDelayMs);
      }

      try {
        const response = await fetch(
          `${baseUrl}/api/awb/download/${awbNumber}/${format}`,
          {
            headers: {
              "X-AUTH-TOKEN": authToken,
              Accept: "application/pdf",
            },
          }
        );

        if (!response.ok) {
          let errorDetails = `${response.status}`;
          try {
            const errorText = await response.text();
            errorDetails = `${response.status}: ${errorText.substring(0, 160)}`;
          } catch {
            // ignore
          }
          results.push({
            awbNumber,
            error: `Sameday: Nu s-a putut descărca PDF-ul (${errorDetails})`,
          });
          failedCount++;
          continue;
        }

        const contentType = response.headers.get("content-type");
        if (contentType && !contentType.includes("application/pdf")) {
          const text = await response.text();
          results.push({
            awbNumber,
            error: `Sameday: Răspuns invalid (${contentType}) ${text.substring(0, 160)}`,
          });
          failedCount++;
          continue;
        }

        const buffer = await response.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        results.push({ awbNumber, pdf: base64 });
        successCount++;
      } catch (error: any) {
        results.push({
          awbNumber,
          error: error?.message || "Eroare necunoscută la descărcarea AWB",
        });
        failedCount++;
      }
    }

    return { results, successCount, failedCount };
  },
});
