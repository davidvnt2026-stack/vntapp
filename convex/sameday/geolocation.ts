// Special county mappings for cross-border countries
// Budapest is a special case - it's the capital city but Sameday lists it under "Pest" county
export const COUNTY_MAPPINGS: Record<string, Record<string, string[]>> = {
  HU: {
    "budapest": ["Pest", "Budapest"],
    "csongrád": ["Csongrád-Csanád", "Csongrád"],
    "csongrad": ["Csongrád-Csanád", "Csongrád"],
    "győr": ["Győr-Moson-Sopron"],
    "gyor": ["Győr-Moson-Sopron"],
    "borsod": ["Borsod-Abaúj-Zemplén"],
  },
  BG: {
    "sofia": ["Sofia", "Sofia-grad", "Sofia City"],
  },
};

export async function findCountyId(
  countyName: string,
  authToken: string,
  baseUrl: string,
  countryCode: string = "RO"
): Promise<string> {
  const normalizedInput = countyName.toLowerCase().trim();

  const countryMappings = COUNTY_MAPPINGS[countryCode] || {};
  let searchNames: string[] = [countyName];

  for (const [key, alternatives] of Object.entries(countryMappings)) {
    if (normalizedInput.includes(key)) {
      searchNames = [...alternatives, countyName];
      console.log(`County mapping found: "${countyName}" -> trying: ${searchNames.join(", ")}`);
      break;
    }
  }

  for (const searchName of searchNames) {
    const response = await fetch(
      `${baseUrl}/api/geolocation/county?name=${encodeURIComponent(searchName)}&countryCode=${countryCode}&page=1&countPerPage=10`,
      {
        headers: {
          "X-AUTH-TOKEN": authToken,
          Accept: "application/json",
        },
      }
    );

    if (response.ok) {
      const data =
        (await response.json()) as
          | {
              data?: Array<{ id: number; name?: string; latinName?: string; code?: string }>;
            }
          | Array<{ id: number; name?: string; latinName?: string; code?: string }>;
      const counties = Array.isArray(data) ? data : data.data || [];

      console.log(`County search for "${searchName}" in ${countryCode}:`, counties.slice(0, 3));

      if (counties.length > 0) {
        const normalizedSearch = normalizeText(searchName);
        const exactMatch = counties.find((county) => {
          const normalizedName = normalizeText(county.name || "");
          const normalizedLatinName = normalizeText(county.latinName || "");
          return (
            normalizedName === normalizedSearch ||
            normalizedLatinName === normalizedSearch
          );
        });
        if (exactMatch) {
          return String(exactMatch.id);
        }

        const tokenMatch = counties.find((county) => {
          const normalizedName = normalizeText(county.name || "");
          const normalizedLatinName = normalizeText(county.latinName || "");
          return (
            normalizedName.split(/[\s-]+/).includes(normalizedSearch) ||
            normalizedLatinName.split(/[\s-]+/).includes(normalizedSearch)
          );
        });
        if (tokenMatch) {
          return String(tokenMatch.id);
        }

        return String(counties[0].id);
      }
    }
  }

  if (countryCode !== "RO") {
    const allResponse = await fetch(
      `${baseUrl}/api/geolocation/county?countryCode=${countryCode}&page=1&countPerPage=100`,
      {
        headers: {
          "X-AUTH-TOKEN": authToken,
          Accept: "application/json",
        },
      }
    );
    if (allResponse.ok) {
      const allData =
        (await allResponse.json()) as
          | { data?: Array<{ id: number; name?: string }> }
          | Array<{ id: number; name?: string }>;
      const allCounties = Array.isArray(allData) ? allData : allData.data || [];

      const searchTerms = normalizedInput.split(/[\s,]+/).filter((t) => t.length > 2);

      let match = allCounties.find((c) =>
        searchTerms.some((term) => c.name?.toLowerCase().includes(term))
      );

      if (!match && normalizedInput.includes("budapest")) {
        match = allCounties.find(
          (c) =>
            c.name?.toLowerCase().includes("pest") || c.name?.toLowerCase().includes("budapest")
        );
      }

      if (match) {
        console.log(`Found county match: ${match.name} (ID: ${match.id})`);
        return String(match.id);
      }

      console.log(`Available counties in ${countryCode}:`, allCounties.map((c) => c.name).slice(0, 10));
    }
  }

  if (countryCode === "RO") {
    return "1";
  }

  throw new Error(`Sameday: Nu s-a găsit județul "${countyName}" în ${countryCode}. Verifică adresa.`);
}

function normalizeText(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function getCitySearchCandidates(cityName: string): string[] {
  const normalized = normalizeText(cityName);
  const stripped = normalized
    .replace(/^(com\.?|comuna|sat\.?|satul|oras|orasul|municipiu|municipiul|mun\.?)\s+/i, "")
    .trim();
  return Array.from(new Set([normalized, stripped].filter((x) => x.length > 0)));
}

export async function findCityId(
  cityName: string,
  countyId: string,
  postalCode: string | undefined,
  authToken: string,
  baseUrl: string,
  countryCode: string = "RO"
): Promise<string> {
  const cityCandidates = getCitySearchCandidates(cityName);
  const normalizedCityName = cityCandidates[0] || normalizeText(cityName);

  if (countryCode === "RO" && (normalizedCityName === "bucuresti" || normalizedCityName === "bucharest")) {
    if (postalCode && postalCode.startsWith("0") && postalCode.length >= 2) {
      const sectorDigit = postalCode[1];
      if (["1", "2", "3", "4", "5", "6"].includes(sectorDigit)) {
        cityCandidates.push(`sector ${sectorDigit}`);
        cityCandidates.push(`sectorul ${sectorDigit}`);
      }
    }
  }

  if (postalCode) {
    const response = await fetch(
      `${baseUrl}/api/geolocation/city?countryCode=${countryCode}&county=${countyId}&postalCode=${postalCode}&page=1&countPerPage=10`,
      {
        headers: {
          "X-AUTH-TOKEN": authToken,
          Accept: "application/json",
        },
      }
    );

    if (response.ok) {
      const data =
        (await response.json()) as { data?: Array<{ id: number; name?: string }> } | Array<{ id: number; name?: string }>;
      const cities = Array.isArray(data) ? data : data.data || [];
      if (cities.length === 1) {
        return String(cities[0].id);
      } else if (cities.length > 1) {
        const exactMatch = cities.find((c) => {
          if (!c.name) return false;
          const normalizedName = normalizeText(c.name);
          return cityCandidates.includes(normalizedName);
        });
        if (exactMatch) {
          return String(exactMatch.id);
        }
        const partialMatch = cities.find((c) => {
          if (!c.name) return false;
          const normalizedName = normalizeText(c.name);
          return cityCandidates.some(
            (candidate) => normalizedName.includes(candidate) || candidate.includes(normalizedName)
          );
        });
        if (partialMatch) {
          return String(partialMatch.id);
        }
        return String(cities[0].id);
      }
    }
  }

  const response = await fetch(
    `${baseUrl}/api/geolocation/city?countryCode=${countryCode}&county=${countyId}&page=1&countPerPage=500`,
    {
      headers: {
        "X-AUTH-TOKEN": authToken,
        Accept: "application/json",
      },
    }
  );

  if (!response.ok) {
    throw new Error("Sameday: Nu s-a putut găsi localitatea în baza de date.");
  }

  const data =
    (await response.json()) as
      | { data?: Array<{ id: number; name?: string }> }
      | Array<{ id: number; name?: string }>;
  const cities = Array.isArray(data) ? data : data.data || [];

  const match = cities.find((c) => {
    if (!c.name) return false;
    const normalizedName = normalizeText(c.name);
    return cityCandidates.includes(normalizedName);
  });

  if (match) {
    return String(match.id);
  }

  const partialMatch = cities.find((c) => {
    if (!c.name) return false;
    const normalizedName = normalizeText(c.name);
    return cityCandidates.some(
      (candidate) => normalizedName.includes(candidate) || candidate.includes(normalizedName)
    );
  });
  if (partialMatch) {
    return String(partialMatch.id);
  }

  if (cities.length === 0) {
    throw new Error(
      `Sameday: Nu s-a găsit nicio localitate pentru county=${countyId} în ${countryCode}. Verifică Province/Region.`
    );
  }

  throw new Error(
    `Sameday: Localitatea "${cityName}" nu se potrivește cu codul poștal/județul selectat. Verifică City + Post Code + Province.`
  );
}
