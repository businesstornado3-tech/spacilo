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

export interface GeocodingProvider {
  readonly name: string;
  /** Resolve free text (postcode, outcode or place) to a single best point. */
  geocode(query: string): Promise<SearchCentre | null>;
}

const BASE = "https://api.postcodes.io";

async function getJson(url: string): Promise<any | null> {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) return null;
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

const postcodesIoProvider: GeocodingProvider = {
  name: "postcodes.io",
  async geocode(rawQuery) {
    const query = normaliseLocationInput(rawQuery);
    if (query.length < 2) return null;

    // 1. Full UK postcode — the primary MVP input.
    if (isPostcode(query)) {
      const result = await getJson(`${BASE}/postcodes/${encodeURIComponent(query)}`);
      if (result) {
        return toCentre(result.latitude, result.longitude, query, postcodeDistrict(query), "postcode");
      }
    }

    // 2. Outward code on its own, e.g. "PO4".
    if (isOutcode(query)) {
      const result = await getJson(`${BASE}/outcodes/${encodeURIComponent(query.toUpperCase())}`);
      if (result) {
        const code = String(result.outcode ?? query).toUpperCase();
        return toCentre(result.latitude, result.longitude, code, code, "district");
      }
    }

    // 3. Recognised place / town / neighbourhood name.
    //    Many UK settlements share a name, so ask for a candidate list and
    //    rank it deterministically instead of trusting the first row.
    const places = await getJson(`${BASE}/places?q=${encodeURIComponent(query)}&limit=20`);
    const place = Array.isArray(places) ? pickBestPlace(query, places as PlaceCandidate[]) : null;
    if (place) {
      const label: string = (place.name_1 as string) ?? query;
      const district =
        typeof place.outcode === "string" && place.outcode ? place.outcode.toUpperCase() : null;
      return toCentre(place.latitude, place.longitude, label, district, "place");
    }


    return null;
  },
};

export function getGeocodingProvider(): GeocodingProvider {
  return postcodesIoProvider;
}
