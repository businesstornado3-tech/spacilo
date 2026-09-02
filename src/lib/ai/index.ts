/**
 * EarnRoom AI — public entry point (Phase 6A).
 *
 * Application code imports from here and nowhere deeper. That is what keeps a
 * provider swap a configuration change rather than a refactor.
 */
export * from "./core/types";
export * from "./core/errors";
export * from "./core/config";
export * from "./core/flags";
export * from "./core/explain";
export * from "./core/validate";
export {
  aiCacheKey,
  aiCacheStats,
  invalidateAiCache,
  readAiCache,
  resetAiCache,
  writeAiCache,
} from "./core/cache";
export { aiLogEntries, clearAiLog, onAiLog, type AiLogEntry, type AiLogStatus } from "./core/logger";
export {
  aiMetrics,
  aiMetricsByCapability,
  aiMetricsByProvider,
  isOverBudget,
  recordAiMetric,
  resetAiMetrics,
  type AiMetricsSnapshot,
} from "./core/metrics";
export {
  checkRateLimit,
  rateLimitMessage,
  resetRateLimits,
  type RateLimitVerdict,
} from "./core/rate-limit";
export {
  fallbackPrompt,
  getPrompt,
  listPrompts,
  promptStamp,
  renderPrompt,
  type PromptDefinition,
} from "./core/prompts";
export {
  assertMediaAllowed,
  assertNoPromptInjection,
  parseAiJson,
  redactForLog,
  sanitiseText,
} from "./core/security";
export {
  awaitAiJob,
  cancelAiJob,
  getAiJob,
  listAiJobs,
  onAiJobUpdate,
  aiQueueStats,
  resetAiQueue,
  submitAiJob,
  type AiJob,
  type AiJobStatus,
} from "./core/queue";
export {
  getAiProvider,
  listAiProviders,
  providersFor,
  registerAiProvider,
  resetAiProviders,
  setProviderEnabled,
  unregisterAiProvider,
} from "./core/provider-manager";
export { enqueueAi, executeAi, streamAi, type AiRequest } from "./core/orchestrator";
export * from "./services";
export { installLocalAiProviders } from "./providers/local";
export type {
  RankedListing,
  RankingInput,
  RankingListing,
  RankingOutput,
  RenterPreferences,
  SuitabilityAssessment,
  SuitabilityImprovement,
  SuitabilityInput,
  SuitabilityInventory,
  SuitabilitySpace,
  SuitabilityVerdict,
} from "./providers/suitability";
export type {
  DescriptionDraft,
  DescriptionInput,
  DescriptionOutput,
  DescriptionTone,
  HostInsight,
  HostInsightsInput,
  HostInsightsOutput,
  HostPricingGuidance,
  HostPricingInput,
  HostPricingMarket,
  HostPricingSpace,
  ListingQualityInput,
  ListingQualityIssue,
  ListingQualityReview,
} from "./providers/host";
export type {
  HelpArticle,
  HelpMatch,
  HelpSearchInput,
  HelpSearchOutput,
  NlSearchInput,
  NlSearchOutput,
  SearchFilters,
  SearchIntent,
  SeasonalInput,
  SeasonalOutput,
  SeasonalTheme,
  TrustPoint,
  TrustSummaryInput,
  TrustSummaryOutput,
} from "./providers/discovery";
export type {
  BookingAdvice,
  BookingAdviceInput,
  ForgottenItem,
  InventoryAssistance,
  InventoryAssistantInput,
  MessageAssistInput,
  MessageAssistOutput,
  MessageScenario,
  MessageSuggestion,
  NotificationCandidate,
  NotificationDigest,
  NotificationDigestInput,
  SmartNotificationKind,
  VehicleSize,
} from "./providers/guidance";
export type { FraudAssessment, FraudInput, FraudOutput, FraudSignal, FraudSignalCode, FraudSubject } from "./providers/fraud";
export { installEarnRoomAi, isAiInstalled } from "./bootstrap";

