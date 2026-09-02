/**
 * schema.org JSON-LD builders.
 *
 * Rules enforced here (brief §72-74):
 *  - only factual, already-public information is emitted
 *  - never an exact address/postcode — approximate area / postcode
 *    district only, matching what is already shown on the page
 *  - never fabricated ratings, reviews, prices, or business details
 *  - no legal entity name unless it genuinely exists in brand config
 */
import { brand } from "@/config/brand";
import { siteOrigin } from "@/lib/seo/meta";

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: brand.name,
    url: siteOrigin(),
    logo: `${siteOrigin()}/favicon.png`,
  };
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: brand.name,
    url: siteOrigin(),
    potentialAction: {
      "@type": "SearchAction",
      target: `${siteOrigin()}/search?location={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

export type ListingJsonLdInput = {
  id: string;
  title: string;
  description: string | null;
  /** Approximate area only — never an exact address. */
  approximateArea: string | null;
  /** Postcode district only (e.g. "PO4"), never a full postcode. */
  postcodeDistrict: string | null;
  monthlyPricePence: number | null;
  currency?: string | null;
  imageUrls?: string[];
  averageRating?: number | null;
  reviewCount?: number;
};

/**
 * Place/Offer-style JSON-LD for a single published listing. Built entirely
 * from data already rendered on the public listing page — no exact address,
 * no invented rating/review/availability data.
 */
export function listingJsonLd(input: ListingJsonLdInput) {
  const url = `${siteOrigin()}/spaces/${input.id}`;
  const areaParts = [input.approximateArea, input.postcodeDistrict].filter(Boolean);

  const json: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: input.title,
    url,
    ...(input.description ? { description: input.description } : {}),
    ...(input.imageUrls?.length ? { image: input.imageUrls } : {}),
    ...(areaParts.length
      ? {
          areaServed: {
            "@type": "Place",
            name: areaParts.join(", "),
          },
        }
      : {}),
  };

  const rating = aggregateRatingJsonLd(input.averageRating ?? null, input.reviewCount ?? 0);
  if (rating) json["aggregateRating"] = rating;

  if (typeof input.monthlyPricePence === "number") {
    json["offers"] = {
      "@type": "Offer",
      url,
      priceCurrency: input.currency ?? "GBP",
      price: (input.monthlyPricePence / 100).toFixed(2),
      availability: "https://schema.org/InStock",
    };
  }

  return json;
}

/** Breadcrumb trail for a public page. Paths must be real, indexable routes. */
export function breadcrumbJsonLd(trail: readonly { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: `${siteOrigin()}${crumb.path === "/" ? "" : crumb.path}`,
    })),
  };
}

/** FAQPage schema built only from question/answer copy already on the page. */
export function faqJsonLd(entries: readonly { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entries.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: { "@type": "Answer", text: entry.answer },
    })),
  };
}

/**
 * AggregateRating for a listing. Only emitted when real reviews exist —
 * never fabricate a rating or a review count.
 */
export function aggregateRatingJsonLd(averageRating: number | null, reviewCount: number) {
  if (!averageRating || reviewCount < 1) return null;
  return {
    "@type": "AggregateRating",
    ratingValue: Number(averageRating.toFixed(1)),
    reviewCount,
    bestRating: 5,
    worstRating: 1,
  };
}

/** Renders a JSON-LD object as a router `scripts` entry. */
export function jsonLdScript(data: unknown) {
  return {
    type: "application/ld+json",
    children: JSON.stringify(data),
  };
}
