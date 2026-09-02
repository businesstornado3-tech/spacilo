/**
 * EarnRoom Advisor — public entry point (Milestone 16).
 *
 * Surfaces import from here and nowhere deeper, so the internals can be
 * reorganised or replaced without a single component changing.
 */
export * from "./contracts";
export { assessListing, assessAll, assessmentKey, clearAssessmentCache, planFor } from "./assess";
export { rankListings, scoreListing, topReasons } from "./ranking";
export { compareListings } from "./comparison";
export { recommendForListing } from "./recommendations";
export { buildSmartSuggestions } from "./suggestions";
export { buildDecisionCards, cardFromRecommendation, cardFromSuggestion, fitDecisionCard } from "./decisions";
export { buildHostInsights } from "./insights";
export { applyChange, simulate, simulateAll } from "./whatif";
export { buildTimeline, timelineDurationMs } from "./timeline";
export { assessBooking, assessHostAcceptance } from "./booking";
export { askCopilot, classifyQuestion, copilotPrompts, type CopilotContext } from "./copilot";
export { adviseHost, adviseListing, recommend } from "./engine";
export {
  clearMemory,
  readMemory,
  recordAdvisorSignal,
  rememberEvent,
  resetAdvisorLearning,
  summariseAdvisorLearning,
  type AdvisorLearningOutcome,
  type AdvisorLearningSignal,
  type AdvisorLearningSummary,
  type IntelligenceMemory,
  type MemoryEvent,
  type MemoryEventKind,
} from "./memory";
