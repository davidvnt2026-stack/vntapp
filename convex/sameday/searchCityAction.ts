import { action } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import { api } from "../_generated/api";
import { getSamedayAuthTokenWithCache } from "./auth";
import { findCountyId } from "./geolocation";

function normalizeText(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function getSearchNameCandidates(name: string): string[] {
  const normalized = normalizeText(name);
  const stripped = normalized
    .replace(/^(com\.?|comuna|sat\.?|satul|oras|orasul|municipiu|municipiul|mun\.?)\s+/i, "")
    .trim();
  return Array.from(new Set([name.trim(), stripped].filter((x) => x.length > 0)));
}

function matchesCityCandidate(cityName: string, candidates: string[]): boolean {
  const normalizedCity = normalizeText(cityName);
  return candidates.some((candidateRaw) => {
    const candidate = normalizeText(candidateRaw);
    if (!candidate) return false;
    if (normalizedCity === candidate) return true;
    if (normalizedCity.includes(candidate) || candidate.includes(normalizedCity)) return true;
    const parts = candidate.split(/[\s-]+/).filter((p) => p.length > 2);
    return parts.some((part) => normalizedCity.includes(part));
  });
}

function levenshteinDistance(a: string, b: string): number {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left) return right.length;
  if (!right) return left.length;

  const prev: number[] = new Array(right.length + 1);
  const curr: number[] = new Array(right.length + 1);
  for (let j = 0; j <= right.length; j++) prev[j] = j;

  for (let i = 1; i <= left.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= right.length; j++) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost
      );
    }
    for (let j = 0; j <= right.length; j++) prev[j] = curr[j];
  }

  return prev[right.length];
}

function citySimilarityScore(cityName: string, candidates: string[]): number {
  const normalizedCity = normalizeText(cityName);
  if (!normalizedCity) return Number.NEGATIVE_INFINITY;

  let bestScore = Number.NEGATIVE_INFINITY;
  for (const rawCandidate of candidates) {
    const candidate = normalizeText(rawCandidate);
    if (!candidate) continue;

    let score = 0;
    if (normalizedCity === candidate) {
      score += 1000;
    } else if (normalizedCity.startsWith(candidate) || candidate.startsWith(normalizedCity)) {
      score += 650;
    } else if (normalizedCity.includes(candidate) || candidate.includes(normalizedCity)) {
      score += 450;
    }

    const cityTokens = new Set(normalizedCity.split(/[\s-]+/).filter((t) => t.length > 1));
    const candidateTokens = new Set(candidate.split(/[\s-]+/).filter((t) => t.length > 1));
    let tokenOverlap = 0;
    for (const token of candidateTokens) {
      if (cityTokens.has(token)) tokenOverlap++;
    }
    score += tokenOverlap * 120;

    const distance = levenshteinDistance(normalizedCity, candidate);
    score -= distance * 12;

    bestScore = Math.max(bestScore, score);
  }

  return bestScore;
}

function rankCitiesByQuery(
  cities: Array<{ id: string; name: string }>,
  candidates: string[]
): Array<{ id: string; name: string }> {
  return [...cities]
    .sort((a, b) => {
      const byScore = citySimilarityScore(b.name, candidates) - citySimilarityScore(a.name, candidates);
      if (byScore !== 0) return byScore;
      return a.name.localeCompare(b.name, "ro");
    });
}

export const searchSamedayCity = action({
  args: {
    token: v.string(),
    county: v.string(),
    countryCode: v.optional(v.string()),
    name: v.string(),
    postalCode: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args
  ): Promise<Array<{ id: string; name: string }>> => {
    const user = await ctx.runQuery(api.auth.getCurrentUser as any, {
      token: args.token,
    });
    if (!user) throw new ConvexError("Sesiune invalidă.");

    const connection = await ctx.runQuery(api.connections.getByType as any, {
      token: args.token,
      connectionType: "sameday",
    });
    if (!connection) throw new ConvexError("Sameday nu este configurat.");

    const creds = connection.credentials as {
      username?: string;
      password?: string;
      api_url?: string;
    };
    if (!creds.username || !creds.password) throw new ConvexError("Lipsesc credențialele Sameday.");

    const baseUrl = creds.api_url || "https://api.sameday.ro";
    const authToken = await getSamedayAuthTokenWithCache(
      ctx,
      connection as any,
      creds.username,
      creds.password,
      baseUrl
    );

    const countryCode = args.countryCode || "RO";

    try {
      const countyId = await findCountyId(args.county, authToken, baseUrl, countryCode);
      const seenIds = new Set<string>();
      const mergedCities: Array<{ id: string; name: string }> = [];

      const addCities = (rawCities: any[]) => {
        for (const city of rawCities) {
          const id = String(city.id);
          if (seenIds.has(id) || !city.name) continue;
          seenIds.add(id);
          mergedCities.push({ id, name: city.name });
        }
      };

      if (args.postalCode && args.postalCode.trim().length > 0) {
        const byPostalResponse = await fetch(
          `${baseUrl}/api/geolocation/city?countryCode=${countryCode}&county=${countyId}&postalCode=${encodeURIComponent(
            args.postalCode.trim()
          )}&page=1&countPerPage=50`,
          {
            headers: {
              "X-AUTH-TOKEN": authToken,
              Accept: "application/json",
            },
          }
        );
        if (byPostalResponse.ok) {
          const byPostalData = await byPostalResponse.json();
          const byPostalCities = Array.isArray(byPostalData) ? byPostalData : byPostalData.data || [];
          addCities(byPostalCities);
        }
      }

      const nameCandidates = getSearchNameCandidates(args.name);
      for (const candidate of nameCandidates) {
        const response = await fetch(
          `${baseUrl}/api/geolocation/city?countryCode=${countryCode}&county=${countyId}&name=${encodeURIComponent(
            candidate
          )}&page=1&countPerPage=50`,
          {
            headers: {
              "X-AUTH-TOKEN": authToken,
              Accept: "application/json",
            },
          }
        );
        if (!response.ok) continue;
        const data = await response.json();
        const cities = Array.isArray(data) ? data : data.data || [];
        addCities(cities);
      }

      if (mergedCities.length === 0) {
        const allCitiesResponse = await fetch(
          `${baseUrl}/api/geolocation/city?countryCode=${countryCode}&county=${countyId}&page=1&countPerPage=500`,
          {
            headers: {
              "X-AUTH-TOKEN": authToken,
              Accept: "application/json",
            },
          }
        );
        if (allCitiesResponse.ok) {
          const allCitiesData = await allCitiesResponse.json();
          const allCities = Array.isArray(allCitiesData) ? allCitiesData : allCitiesData.data || [];
          const filtered = allCities.filter((c: any) => c?.name && matchesCityCandidate(c.name, nameCandidates));
          if (filtered.length > 0) {
            addCities(
              rankCitiesByQuery(
                filtered.map((c: any) => ({ id: String(c.id), name: String(c.name) })),
                nameCandidates
              ).slice(0, 50)
            );
          } else {
            // Last-resort fallback: provide closest city names from county, not just first page order.
            addCities(
              rankCitiesByQuery(
                allCities
                  .filter((c: any) => c?.name && c?.id !== undefined && c?.id !== null)
                  .map((c: any) => ({ id: String(c.id), name: String(c.name) })),
                nameCandidates
              ).slice(0, 30)
            );
          }
        }
      }

      return rankCitiesByQuery(mergedCities, nameCandidates);
    } catch (e) {
      console.error("Eroare la căutarea orașului:", e);
      return [];
    }
  },
});
