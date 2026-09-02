/**
 * Central brand configuration.
 *
 * Every customer-facing brand string is read from here so the approved
 * identity remains consistent across product, email and metadata surfaces.
 */
export const brand = {
  name: "EarnRoom",
  shortName: "EarnRoom",
  /**
   * NO REGISTERED ENTITY HAS BEEN CONFIRMED. Until the owner supplies the
   * registered company name, number and office, this stays the trading name
   * and legal pages must not assert a corporate entity.
   */
  legalName: "EarnRoom",
  /** The AI experience name — deliberately prominent across the product. */
  ai: "EarnRoom AI",
  tagline: "Make space earn.",
  propositions: {
    renter: "Space nearby. Income at home.",
    host: "Got space? Make money.",
    ai: "Show us your stuff. We'll help find the space.",
    trust: "Storage between people, built around trust.",
  },
  supportEmail: "hello@earnroom.example",
  locale: "en-GB",
  currency: "GBP",
  currencySymbol: "£",
  country: "United Kingdom",
  /** The service is UK-wide; availability varies by location. */
  serviceArea: "United Kingdom",
  positioning: "Building a smarter way to use space across the UK.",
  availabilityNote: "Available across the UK — availability varies by location.",
  /**
   * Areas where supply is currently concentrated. Marketing context only:
   * never the scope of the business and never used in search logic.
   */
  focusAreas: [
    "Portsmouth",
    "Southsea",
    "Fratton",
    "Milton",
    "Eastney",
    "Copnor",
    "North End",
    "Hilsea",
    "Cosham",
  ],
} as const;

export type Brand = typeof brand;
