/**
 * Approximate UK city/town centre coordinates, used only to plot internal
 * founder-console demand bubbles on a map outline.
 *
 * These are published geographic facts about places, not data about people.
 * No visitor is ever located: EarnRoom does not collect IP geolocation, and
 * nothing in the analytics pipeline stores a visitor's position. A bubble here
 * means "this many demand signals named this place", nothing more.
 */

export type UkPoint = { lat: number; lng: number };

export const UK_PLACE_POINTS: Readonly<Record<string, UkPoint>> = {
  aberdeen: { lat: 57.15, lng: -2.09 },
  bath: { lat: 51.38, lng: -2.36 },
  belfast: { lat: 54.6, lng: -5.93 },
  birmingham: { lat: 52.48, lng: -1.9 },
  bournemouth: { lat: 50.72, lng: -1.88 },
  brighton: { lat: 50.82, lng: -0.14 },
  bristol: { lat: 51.45, lng: -2.59 },
  cambridge: { lat: 52.2, lng: 0.12 },
  canterbury: { lat: 51.28, lng: 1.08 },
  cardiff: { lat: 51.48, lng: -3.18 },
  chelmsford: { lat: 51.74, lng: 0.47 },
  cheltenham: { lat: 51.9, lng: -2.08 },
  chester: { lat: 53.19, lng: -2.89 },
  colchester: { lat: 51.89, lng: 0.9 },
  coventry: { lat: 52.41, lng: -1.51 },
  derby: { lat: 52.92, lng: -1.48 },
  dundee: { lat: 56.46, lng: -2.97 },
  durham: { lat: 54.78, lng: -1.58 },
  edinburgh: { lat: 55.95, lng: -3.19 },
  exeter: { lat: 50.72, lng: -3.53 },
  glasgow: { lat: 55.86, lng: -4.25 },
  gloucester: { lat: 51.86, lng: -2.24 },
  guildford: { lat: 51.24, lng: -0.57 },
  hull: { lat: 53.74, lng: -0.33 },
  ipswich: { lat: 52.06, lng: 1.16 },
  leeds: { lat: 53.8, lng: -1.55 },
  leicester: { lat: 52.64, lng: -1.13 },
  lincoln: { lat: 53.23, lng: -0.54 },
  liverpool: { lat: 53.41, lng: -2.98 },
  london: { lat: 51.51, lng: -0.13 },
  luton: { lat: 51.88, lng: -0.42 },
  manchester: { lat: 53.48, lng: -2.24 },
  "milton-keynes": { lat: 52.04, lng: -0.76 },
  newcastle: { lat: 54.98, lng: -1.61 },
  northampton: { lat: 52.24, lng: -0.9 },
  norwich: { lat: 52.63, lng: 1.3 },
  nottingham: { lat: 52.95, lng: -1.15 },
  oxford: { lat: 51.75, lng: -1.26 },
  peterborough: { lat: 52.57, lng: -0.24 },
  plymouth: { lat: 50.38, lng: -4.14 },
  portsmouth: { lat: 50.8, lng: -1.09 },
  preston: { lat: 53.76, lng: -2.7 },
  reading: { lat: 51.45, lng: -0.97 },
  sheffield: { lat: 53.38, lng: -1.47 },
  southampton: { lat: 50.9, lng: -1.4 },
  "stoke-on-trent": { lat: 53.0, lng: -2.18 },
  sunderland: { lat: 54.91, lng: -1.38 },
  swansea: { lat: 51.62, lng: -3.94 },
  swindon: { lat: 51.56, lng: -1.78 },
  wolverhampton: { lat: 52.59, lng: -2.13 },
  worcester: { lat: 52.19, lng: -2.22 },
  york: { lat: 53.96, lng: -1.08 },
};

/** Bounding box used to project points into the console's map panel. */
export const UK_BOUNDS = { minLat: 49.9, maxLat: 58.7, minLng: -8.2, maxLng: 1.8 };

export function pointForSlug(slug: string): UkPoint | null {
  return UK_PLACE_POINTS[slug] ?? null;
}

/** Projects a coordinate to 0..100 percentages within {@link UK_BOUNDS}. */
export function projectPoint(point: UkPoint): { x: number; y: number } {
  const x = ((point.lng - UK_BOUNDS.minLng) / (UK_BOUNDS.maxLng - UK_BOUNDS.minLng)) * 100;
  const y = ((UK_BOUNDS.maxLat - point.lat) / (UK_BOUNDS.maxLat - UK_BOUNDS.minLat)) * 100;
  return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
}
