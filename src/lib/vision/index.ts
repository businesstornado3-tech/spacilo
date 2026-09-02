/**
 * EarnRoom Vision AI — public entry point.
 *
 * Belongings → Vision AI → Inventory → SpacePlanner → Compatibility → Booking
 * Space      → Vision AI → Space value → Listing → Bookings
 */
export * from "./types";
export * from "./canonical";
export * from "./taxonomy";
export * from "./provider";
export * from "./inventory";
export * from "./space-value";
export * from "./stages";
export * from "./selection";
export * from "./crop";
export * from "./detection-cache";
export * from "./photo-quality";
export type { MergeReport, MergeDecision } from "./merge";
