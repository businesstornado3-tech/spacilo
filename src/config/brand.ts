/**
 * Central brand configuration.
 * Change values here to rebrand the entire application.
 */
export const brand = {
  name: "Spacilo",
  shortName: "Stow",
  legalName: "Spacilo Ltd",
  tagline: "Your stuff. Space nearby.",
  propositions: {
    renter: "Your stuff. Space nearby.",
    host: "Got space? Make money.",
    ai: "Show us your stuff. We'll help find the space.",
    trust: "Storage between people, built around trust.",
  },
  supportEmail: "hello@projectstow.example",
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

export type Brand = typeof brand;
