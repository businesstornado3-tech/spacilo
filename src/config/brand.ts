/**
 * Central brand configuration.
 *
 * REVERSIBLE MIGRATION: every customer-facing brand string is read from here.
 * To revert to the previous working brand, restore the values in
 * `PREVIOUS_BRAND` below into `brand` — no component changes are required.
 */
export const brand = {
  name: "Spacilo",
  shortName: "Spacilo",
  legalName: "Spacilo Ltd",
  /** The AI experience name — deliberately prominent across the product. */
  ai: "Spacilo AI",
  tagline: "Space nearby. Income at home.",
  propositions: {
    renter: "Space nearby. Income at home.",
    host: "Got space? Make money.",
    ai: "Show us your stuff. We'll help find the space.",
    trust: "Storage between people, built around trust.",
  },
  supportEmail: "hello@spacilo.example",
  locale: "en-GB",
  currency: "GBP",
  currencySymbol: "£",
  country: "United Kingdom",
  /** Initial pilot areas — expandable, never hard-coded into logic. */
  pilotAreas: [
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

/** Kept for a one-step rollback of the Spacilo brand migration. */
export const PREVIOUS_BRAND = {
  name: "Project Stow",
  shortName: "Stow",
  legalName: "Project Stow Ltd",
  ai: "SpaceFit AI",
  tagline: "Your stuff. Space nearby.",
  supportEmail: "hello@projectstow.example",
} as const;

export type Brand = typeof brand;
