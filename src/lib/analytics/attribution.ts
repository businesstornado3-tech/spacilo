/** Privacy-conscious first-touch attribution values. No identity or free text is stored. */

export type CampaignValues = {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
};

export type StoredAttribution = CampaignValues & {
  landingPath: string;
  referrerHost: string | null;
  issued: number;
};

export type AttributionContext = {
  landingPath: string;
  referrerHost: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
};

export const ATTRIBUTION_STORAGE_KEY = "earnroom.attribution";
export const ATTRIBUTION_RETENTION_DAYS = 90;

/** Keeps the first useful source for a bounded period without creating a profile. */
export function resolveAttribution(
  stored: StoredAttribution | null,
  current: AttributionContext,
  now: number,
): AttributionContext & { issued: number } {
  const maxAge = ATTRIBUTION_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  if (stored && stored.landingPath && now - stored.issued < maxAge) {
    return {
      landingPath: stored.landingPath,
      referrerHost: stored.referrerHost,
      utm_source: stored.utm_source,
      utm_medium: stored.utm_medium,
      utm_campaign: stored.utm_campaign,
      issued: stored.issued,
    };
  }
  return { ...current, issued: now };
}
