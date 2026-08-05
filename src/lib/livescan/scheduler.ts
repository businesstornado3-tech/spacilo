/**
 * Inference scheduling.
 *
 * The camera can preview at 30 fps while detection runs far slower. This
 * scheduler owns that separation and three hard rules:
 *
 *   - never run two inference passes at once;
 *   - never run while the document is hidden;
 *   - slow down automatically when the device is struggling.
 *
 * Pure and injectable: `now` is always supplied, so it is fully testable.
 */

export interface InferenceSchedulerOptions {
  /** Target gap between inference passes on a healthy device. */
  baseIntervalMs: number;
  /** Never poll faster than this. */
  minIntervalMs: number;
  /** Never poll slower than this. */
  maxIntervalMs: number;
}

export const DEFAULT_INFERENCE_OPTIONS: InferenceSchedulerOptions = {
  baseIntervalMs: 350,
  minIntervalMs: 200,
  maxIntervalMs: 2000,
};

export class InferenceScheduler {
  private readonly options: InferenceSchedulerOptions;
  private interval: number;
  private running = false;
  private hidden = false;
  private lastStartedAt = -Infinity;

  constructor(options: Partial<InferenceSchedulerOptions> = {}) {
    this.options = { ...DEFAULT_INFERENCE_OPTIONS, ...options };
    this.interval = this.options.baseIntervalMs;
  }

  get intervalMs(): number {
    return this.interval;
  }

  get inFlight(): boolean {
    return this.running;
  }

  get paused(): boolean {
    return this.hidden;
  }

  /** Background tabs must not burn battery on detection. */
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
  }

  shouldRun(now: number): boolean {
    if (this.running || this.hidden) return false;
    return now - this.lastStartedAt >= this.interval;
  }

  begin(now: number): void {
    this.running = true;
    this.lastStartedAt = now;
  }

  /**
   * Records how long the pass took and adapts. A pass that takes longer than
   * the interval means the device cannot keep up, so we back off.
   */
  end(durationMs: number): void {
    this.running = false;
    const target = Math.max(this.options.baseIntervalMs, durationMs * 1.5);
    this.interval = Math.min(
      this.options.maxIntervalMs,
      Math.max(this.options.minIntervalMs, Math.round(target)),
    );
  }

  reset(): void {
    this.running = false;
    this.hidden = false;
    this.lastStartedAt = -Infinity;
    this.interval = this.options.baseIntervalMs;
  }
}
