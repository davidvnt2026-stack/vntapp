"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

// ============================================
// EXTERNAL AWB LOOKUP
// Scans an external AWB → checks Sameday → downloads PDF → extracts order number
// ============================================

async function authenticateSameday(
  username: string,
  password: string,
  baseUrl: string
): Promise<string> {
  const response = await fetch(`${baseUrl}/api/authenticate`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "X-Auth-Username": username,
      "X-Auth-Password": password,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "remember_me=true",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Sameday: Autentificare eșuată - ${text}`);
  }

  const data = (await response.json()) as { token: string };
  return data.token;
}

/**
 * Extract text content from a PDF buffer using unpdf (serverless-friendly).
 */
async function extractTextFromPdf(pdfBuffer: Buffer): Promise<string> {
  const { extractText } = await import("unpdf");
  const result = await extractText(new Uint8Array(pdfBuffer), {
    mergePages: true,
  });
  return result.text;
}

/**
 * Extract order number from PDF text.
 * Looks for patterns like:
 *   OBS: #18977 x x 1 x ...
 *   #18977-9s80mv1d-mlaxqcv5
 */
function extractOrderNumber(text: string): string | null {
  // Pattern 1: OBS: #NNNNN (the observation field on Sameday labels)
  const obsMatch = text.match(/OBS:\s*#(\d{4,7})/i);
  if (obsMatch) return obsMatch[1];

  // Pattern 2: #NNNNN-xxxxxxx (clientInternalReference format)
  const refMatch = text.match(/#(\d{4,7})-[a-z0-9]/i);
  if (refMatch) return refMatch[1];

  // Pattern 3: Any standalone #NNNNN (4-7 digit order number)
  const genericMatch = text.match(/#(\d{4,7})\b/);
  if (genericMatch) return genericMatch[1];

  return null;
}

export const lookupExternalAwb = action({
  args: {
    token: v.string(),
    awbNumber: v.string(),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    orderNumber: string;
    trackingNumber: string | null;
    orderId: string;
    customerName: string | null;
    status: string | null;
    totalPrice: number | null;
  }> => {
    // 1. Validate user
    // @ts-ignore TS2589 — large generated api type graph
    const user = await ctx.runQuery(api.auth.getCurrentUser, {
      token: args.token,
    });
    if (!user) {
      throw new Error("Sesiune expirată. Te rugăm să te autentifici din nou.");
    }

    // 2. Get Sameday connection
    // @ts-ignore TS2589 — large generated api type graph
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

    // 3. Authenticate with Sameday
    const authToken = await authenticateSameday(username, password, baseUrl);

    // 4. Check AWB status — validates it exists in Sameday
    //    Sameday adds "001" parcel suffix to barcodes on labels, so try variants
    const awbVariants: string[] = [args.awbNumber];
    // If ends with 3-digit parcel suffix (001, 002…), also try without it
    if (/\d{3}$/.test(args.awbNumber) && args.awbNumber.length > 10) {
      awbVariants.push(args.awbNumber.slice(0, -3));
    }
    // Also try with "001" appended
    if (!args.awbNumber.endsWith("001")) {
      awbVariants.push(args.awbNumber + "001");
    }

    console.log(`[ExternalAWB] Trying AWB variants: ${awbVariants.join(", ")}`);

    let awbToUse = args.awbNumber;
    let statusResponse: Response | null = null;
    const attempts: string[] = [];

    for (const variant of awbVariants) {
      const resp = await fetch(
        `${baseUrl}/api/client/awb/${variant}/status`,
        {
          headers: {
            "X-AUTH-TOKEN": authToken,
            Accept: "application/json",
          },
        }
      );
      attempts.push(`${variant}→${resp.status}`);
      console.log(`[ExternalAWB] Try ${variant}: HTTP ${resp.status}`);
      if (resp.ok) {
        awbToUse = variant;
        statusResponse = resp;
        break;
      }
    }

    if (!statusResponse || !statusResponse.ok) {
      throw new Error(
        `AWB nu a fost găsit în Sameday. Încercări: ${attempts.join(", ")}`
      );
    }

    // 5. Download AWB PDF (use the variant that worked)
    const pdfResponse = await fetch(
      `${baseUrl}/api/awb/download/${awbToUse}/A6`,
      {
        headers: {
          "X-AUTH-TOKEN": authToken,
          Accept: "application/pdf",
        },
      }
    );

    if (!pdfResponse.ok) {
      throw new Error(
        `Nu s-a putut descărca PDF-ul pentru AWB ${args.awbNumber}`
      );
    }

    // Check it's actually a PDF
    const contentType = pdfResponse.headers.get("content-type");
    if (contentType && !contentType.includes("application/pdf")) {
      throw new Error(
        `Răspuns invalid de la Sameday (expected PDF, got ${contentType})`
      );
    }

    // 6. Parse PDF to extract text
    const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
    const pdfText = await extractTextFromPdf(pdfBuffer);

    console.log(
      `[ExternalAWB] PDF text for ${args.awbNumber}: ${pdfText.substring(0, 300)}`
    );

    // 7. Extract order number from PDF text
    const orderNumber = extractOrderNumber(pdfText);
    if (!orderNumber) {
      throw new Error(
        `Nu s-a putut extrage numărul comenzii din AWB ${args.awbNumber}. Text PDF: "${pdfText.substring(0, 200)}"`
      );
    }

    console.log(
      `[ExternalAWB] Extracted order #${orderNumber} from AWB ${args.awbNumber}`
    );

    // 8. Look up order in our database by exact order number
    // @ts-ignore TS2589 — large generated api type graph
    const order = await ctx.runQuery(api.orders.getByOrderNumber, {
      token: args.token,
      orderNumber,
    });

    if (!order) {
      throw new Error(
        `Comanda #${orderNumber} nu a fost găsită în baza de date`
      );
    }

    return {
      orderNumber: order.orderNumber,
      trackingNumber: order.trackingNumber || null,
      orderId: order._id,
      customerName: order.customerName || null,
      status: order.status || null,
      totalPrice: order.totalPrice || null,
    };
  },
});
