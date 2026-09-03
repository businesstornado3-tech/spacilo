/**
 * Phase 11 — autonomy configuration.
 *
 * Every threshold, budget and switch lives here so a rollout, a throttle or an
 * emergency stop is a configuration change rather than a code change. Outbound
 * automation defaults to OFF: nothing external can be sent until a connector
 * and a channel are explicitly authorised and configured.
 */

export type GrowthFlagName =
  | "PHASE11_ENABLED"
  | "AI_OPPORTUNITY_RADAR_ENABLED"
  | "AI_CAMPAIGN_ENGINE_ENABLED"
  | "AI_AUTONOMOUS_SEND_ENABLED"
  | "AI_LEARNING_ENGINE_ENABLED"
  | "AI_PRODUCT_DISCOVERY_ENABLED";

export type GrowthThresholds = {
  /** Score bands. Configurable so scoring can be tuned without a deploy. */
  bandPossible: number;
  bandStrong: number;
  bandHigh: number;
  /** Minimum opportunity score before a campaign may even be considered. */
  campaignFloor: number;
  /** Minimum intent confidence for an outbound (rather than captured) action. */
  confidenceFloor: number;
  /** Confidence below which the engine refuses to make claims at all. */
  uncertaintyFloor: number;
  /** Repeat signals before an unmet need becomes a validated insight. */
  insightValidationCount: number;
};

export type GrowthLimits = {
  perSourcePerHour: number;
  perRecipientPerDay: number;
  campaignCooldownHours: number;
  followUpWindowHours: number;
  maxAttempts: number;
  suppressionDays: number;
  /** Campaign expiry — a stale opportunity is never sent. */
  campaignTtlHours: number;
};

export type GrowthBudgets = {
  /** Staged intelligence: deep reasoning only above this opportunity score. */
  deepReasoningFloor: number;
  /** Hard ceiling on paid AI calls per run. */
  maxAiCallsPerRun: number;
  maxSignalsPerRun: number;
};

export type AutonomyConfig = {
  flags: Record<GrowthFlagName, boolean>;
  thresholds: GrowthThresholds;
  limits: GrowthLimits;
  budgets: GrowthBudgets;
  /** Global kill switch for all outbound automation. */
  emergencyStop: boolean;
  /** Connector ids explicitly paused by the founder. */
  pausedConnectors: readonly string[];
  /** Channel ids explicitly paused by the founder. */
  pausedChannels: readonly string[];
  /** Opportunity categories suppressed by the founder. */
  suppressedCategories: readonly string[];
  /** Days a raw source signal may be retained by default. */
  defaultRetentionDays: number;
};

export function defaultAutonomyConfig(): AutonomyConfig {
  return {
    flags: {
      PHASE11_ENABLED: true,
      AI_OPPORTUNITY_RADAR_ENABLED: true,
      AI_CAMPAIGN_ENGINE_ENABLED: true,
      // Autonomy is ON: the engine decides and sends for itself. What stops a
      // send is never a founder approving a lead — it is the policy gate and
      // the per-channel authorisation state (credentials, terms, lawful
      // basis). With no authorised channel configured, nothing transmits.
      AI_AUTONOMOUS_SEND_ENABLED: true,
      AI_LEARNING_ENGINE_ENABLED: true,
      AI_PRODUCT_DISCOVERY_ENABLED: true,
    },
    thresholds: {
      bandPossible: 30,
      bandStrong: 60,
      bandHigh: 80,
      campaignFloor: 45,
      confidenceFloor: 0.45,
      uncertaintyFloor: 0.25,
      insightValidationCount: 3,
    },
    limits: {
      perSourcePerHour: 60,
      perRecipientPerDay: 1,
      campaignCooldownHours: 168,
      followUpWindowHours: 72,
      maxAttempts: 2,
      suppressionDays: 180,
      campaignTtlHours: 336,
    },
    budgets: {
      deepReasoningFloor: 60,
      maxAiCallsPerRun: 50,
      maxSignalsPerRun: 500,
    },
    emergencyStop: false,
    pausedConnectors: [],
    pausedChannels: [],
    suppressedCategories: [],
    defaultRetentionDays: 90,
  };
}

let config: AutonomyConfig = defaultAutonomyConfig();

export function growthConfig(): AutonomyConfig {
  return config;
}

export function setGrowthConfig(patch: Partial<AutonomyConfig>): AutonomyConfig {
  config = {
    ...config,
    ...patch,
    flags: { ...config.flags, ...(patch.flags ?? {}) },
    thresholds: { ...config.thresholds, ...(patch.thresholds ?? {}) },
    limits: { ...config.limits, ...(patch.limits ?? {}) },
    budgets: { ...config.budgets, ...(patch.budgets ?? {}) },
  };
  return config;
}

export function resetGrowthConfig(): void {
  config = defaultAutonomyConfig();
}

export function isGrowthFlagEnabled(flag: GrowthFlagName): boolean {
  if (flag === "PHASE11_ENABLED") return config.flags.PHASE11_ENABLED;
  return config.flags.PHASE11_ENABLED && config.flags[flag] === true;
}

/** The founder-level emergency stop. Blocks every outbound action at once. */
export function outboundHalted(): boolean {
  return config.emergencyStop || !isGrowthFlagEnabled("AI_AUTONOMOUS_SEND_ENABLED");
}

export function scoreBand(score: number): "low" | "possible" | "strong" | "high" {
  const t = config.thresholds;
  if (score >= t.bandHigh) return "high";
  if (score >= t.bandStrong) return "strong";
  if (score >= t.bandPossible) return "possible";
  return "low";
}
