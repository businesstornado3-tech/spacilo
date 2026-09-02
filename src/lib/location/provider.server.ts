/**
 * Provider-neutral geocoding boundary (server only).
 *
 * The rest of the app never imports a provider directly — it calls
 * `getGeocodingProvider()`. Swapping to Google/Mapbox later means adding a
 * provider here and changing the factory, nothing else.
 *
 * Current provider: postcodes.io — an open UK postcode/place service that
 * needs no API key. Any provider credential added later MUST be read from
 * process.env inside the request handler and never sent to the browser.
 */
import {
  isOutcode,
  isPlausibleUkPoint,
  isPostcode,
  normaliseLocationInput,
  postcodeDistrict,
  type SearchCentre,
} from "./schema";
import { resolvePlace, splitQuery, type PlaceCandidate } from "./place-ranking";


export interface GeocodeResolution {
  centre: SearchCentre;
  /**
   * Equally plausible places elsewhere in the country. Non-empty means the
   * query was genuinely ambiguous and the user should be able to correct it.
   */
  alternatives: SearchCentre[];
}

export interface GeocodingProvider {
  readonly name: string;
  /** Resolve free text (postcode, outcode or place) to a single best point. */
  geocode(query: string): Promise<SearchCentre | null>;
  /** Same resolution, plus any same-strength alternatives for disambiguation. */
  geocodeDetailed(query: string): Promise<GeocodeResolution | null>;
}

const BASE = "https://api.postcodes.io";

async function getJson(url: string): Promise<any | null> {
  let response: Response;
  try {
    response = await fetch(url, { headers: { accept: "application/json" } });
  } catch (error) {
    // Preserve transport/service failures so the server function can tell
    // users to retry instead of reporting a false "not found" result.
    throw new Error("Geocoding service request failed", { cause: error });
  }
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Geocoding service returned ${response.status}`);
  }
  const body = (await response.json()) as { status?: number; result?: unknown };
  if (!body || body.status !== 200 || !body.result) return null;
  return body.result;
}

function toCentre(
  lat: unknown,
  lng: unknown,
  label: string,
  district: string | null,
  precision: SearchCentre["precision"],
): SearchCentre | null {
  const point = { lat: Number(lat), lng: Number(lng) };
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return null;
  if (!isPlausibleUkPoint(point)) return null;
  return { ...point, label, district, precision };
}

function placeToCentre(place: PlaceCandidate, fallbackLabel: string): SearchCentre | null {
  const label = typeof place.name_1 === "string" && place.name_1 ? place.name_1 : fallbackLabel;
  const district =
    typeof place.outcode === "string" && place.outcode ? place.outcode.toUpperCase() : null;
  const context = [place.district_borough, place.county_unitary, place.region].find(
    (value): value is string =>
      typeof value === "string" &&
      value.trim().length > 0 &&
      value.trim().toLowerCase() !== label.trim().toLowerCase(),
  );
  // The user must be able to see WHICH same-named place was chosen.
  const fullLabel = [label, context, district].filter(Boolean).join(", ");
  return toCentre(place.latitude, place.longitude, fullLabel, district, "place");
}

const postcodesIoProvider: GeocodingProvider = {
  name: "postcodes.io",
  async geocode(rawQuery) {
    return (await this.geocodeDetailed(rawQuery))?.centre ?? null;
  },
  async geocodeDetailed(rawQuery) {
    const query = normaliseLocationInput(rawQuery);
    if (query.length < 2) return null;

    // 1. Full UK postcode — the primary MVP input.
    if (isPostcode(query)) {
      const result = await getJson(`${BASE}/postcodes/${encodeURIComponent(query)}`);
      if (result) {
        const centre = toCentre(
          result.latitude,
          result.longitude,
          query,
          postcodeDistrict(query),
          "postcode",
        );
        return centre ? { centre, alternatives: [] } : null;
      }
    }

    // 2. Outward code on its own, e.g. "PO4".
    if (isOutcode(query)) {
      const result = await getJson(`${BASE}/outcodes/${encodeURIComponent(query.toUpperCase())}`);
      if (result) {
        const code = String(result.outcode ?? query).toUpperCase();
        const centre = toCentre(result.latitude, result.longitude, code, code, "district");
        return centre ? { centre, alternatives: [] } : null;
      }
    }

    // 3. Recognised place / town / neighbourhood name.
    //    Many UK settlements share a name, so ask for a candidate list and
    //    rank it deterministically instead of trusting the first row.
    // The provider endpoint accepts a place name, not the display label we
    // generate for a chosen candidate ("Newport, Isle of Wight, PO30").
    // Keep the full query for qualifier-aware ranking below.
    const placeQuery = query.includes(",") ? splitQuery(query).name : query;
    const places = await getJson(`${BASE}/places?q=${encodeURIComponent(placeQuery)}&limit=20`);
    const resolution = Array.isArray(places)
      ? resolvePlace(query, places as PlaceCandidate[])
      : { best: null, alternatives: [] };
    if (resolution.best) {
      const centre = placeToCentre(resolution.best, query);
      if (centre) {
        const alternatives = resolution.alternatives
          .map((row) => placeToCentre(row, query))
          .filter((row): row is SearchCentre => row !== null);
        return { centre, alternatives };
      }
    }

    return null;
  },
};

export function getGeocodingProvider(): GeocodingProvider {
  return postcodesIoProvider;
}
