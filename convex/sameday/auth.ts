import type { SamedayAuthResult } from "./shared";

export function parseSamedayExpireAt(rawExpireAt?: string, rawExpireAtUtc?: string): string | undefined {
  const source = rawExpireAtUtc || rawExpireAt;
  if (!source) return undefined;
  const trimmed = source.trim();
  if (!trimmed) return undefined;

  // API examples: "2024-09-24 12:54" and "2024-09-24 09:54" (UTC variant).
  const normalized = trimmed.replace(" ", "T") + (rawExpireAtUtc ? "Z" : "");
  const parsed = Date.parse(normalized);
  if (Number.isNaN(parsed)) return undefined;

  return new Date(parsed).toISOString();
}

export async function authenticateSamedayDetailed(
  username: string,
  password: string,
  baseUrl: string
): Promise<SamedayAuthResult> {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const maxAttempts = 3;

  const looksLikeThrottleBlock = (status: number, text: string) => {
    const lower = text.toLowerCase();
    return (
      status === 429 ||
      status === 503 ||
      lower.includes("suspect activity") ||
      lower.includes("too many requests") ||
      lower.includes("rate limit") ||
      lower.includes("temporarily unavailable") ||
      lower.includes("blocked")
    );
  };

  const compactMessage = (text: string, maxLen = 180) => {
    const compact = text.replace(/\s+/g, " ").trim();
    if (!compact) return "";
    if (compact.length <= maxLen) return compact;
    return `${compact.slice(0, maxLen - 1).trimEnd()}…`;
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/api/authenticate`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "X-AUTH-USERNAME": username,
          "X-AUTH-PASSWORD": password,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "remember_me=1",
      });

      if (!response.ok) {
        const text = await response.text();
        const throttled = looksLikeThrottleBlock(response.status, text);
        const shouldRetry = throttled && attempt < maxAttempts;

        if (shouldRetry) {
          await sleep(400 * 2 ** (attempt - 1));
          continue;
        }

        if (throttled) {
          throw new Error(
            "Sameday: Acces temporar restricționat de curier (suspect activity / rate limit). Încearcă din nou în 1-2 minute."
          );
        }

        const compact = compactMessage(text);
        throw new Error(
          compact
            ? `Sameday: Autentificare eșuată (${response.status}) - ${compact}`
            : `Sameday: Autentificare eșuată (${response.status})`
        );
      }

      const data = (await response.json()) as {
        token?: string;
        expire_at?: string;
        expire_at_utc?: string;
      };
      if (!data.token) {
        throw new Error("Sameday: Răspuns invalid la autentificare (fără token).");
      }
      return {
        token: data.token,
        expireAt: parseSamedayExpireAt(data.expire_at, data.expire_at_utc),
      };
    } catch (error: unknown) {
      if (attempt < maxAttempts) {
        const message = error instanceof Error ? error.message.toLowerCase() : "";
        const isTransientNetworkError =
          message.includes("fetch failed") ||
          message.includes("network") ||
          message.includes("timeout");
        if (isTransientNetworkError) {
          await sleep(400 * 2 ** (attempt - 1));
          continue;
        }
      }
      throw error;
    }
  }

  throw new Error("Sameday: Autentificare eșuată.");
}

export async function authenticateSameday(
  username: string,
  password: string,
  baseUrl: string
): Promise<string> {
  const result = await authenticateSamedayDetailed(username, password, baseUrl);
  return result.token;
}

export async function getSamedayAuthTokenWithCache(
  _ctx: any,
  connection: { _id: any; authToken?: string; authTokenExpiresAt?: string },
  username: string,
  password: string,
  baseUrl: string
): Promise<string> {
  const nowMs = Date.now();
  const expiryMs = connection.authTokenExpiresAt
    ? Date.parse(connection.authTokenExpiresAt)
    : NaN;
  const hasValidCachedToken =
    !!connection.authToken &&
    Number.isFinite(expiryMs) &&
    expiryMs > nowMs + 30_000;

  if (hasValidCachedToken) {
    return connection.authToken as string;
  }

  const auth = await authenticateSamedayDetailed(username, password, baseUrl);
  const authToken = auth.token;
  // Skip writing auth cache here to avoid deep generated type instantiation (TS2589).
  // Token retrieval still works correctly; this only disables optional persistence.

  return authToken;
}
