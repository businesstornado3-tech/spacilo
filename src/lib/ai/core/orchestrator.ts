/**
 * The AI Orchestrator.
 *
 * Every AI request in Spacilo passes through here. Nothing else may call a
 * provider. In one place it handles validation, security, rate limiting,
 * caching, routing, timeouts, retries, provider fallback, structured
 * responses, logging, metrics and graceful degradation.
 */
import { readAiCache, readStaleAiCache, writeAiCache, aiCacheKey } from "./cache";
import { capabilityConfig } from "./config";
import { AiError, toAiError } from "./errors";
import { isCapabilityEnabled, isFlagEnabled } from "./flags";
import { logAi } from "./logger";
import { isOverBudget, recordAiMetric } from "./metrics";
import { promptStamp } from "./prompts";
import { providersFor } from "./provider-manager";
import { checkRateLimit } from "./rate-limit";
import { submitAiJob, type AiJob, type AiPriorityAlias } from "./queue-types";
import { buildUsage, EMPTY_USAGE, estimateTokens } from "./usage";
import { assertValid, type AiSchema } from "./validate";
import type {
  AiCapability,
  AiExplanation,
  AiPriority,
  AiProvider,
  AiProviderContext,
  AiResponse,
  AiStreamChunk,
  AiWarning,
} from "./types";

export interface AiRequest<I, O = unknown> {
  capability: AiCapability;
  input: I;
  /** Prompt id from the library. Recorded on the response for traceability. */
  promptId?: string;
  /** Schema the provider output must satisfy before it reaches a caller. */
  schema?: AiSchema<O>;
  /** Overrides the derived cache key. */
  cacheKey?: string;
  skipCache?: boolean;
  signal?: AbortSignal;
  /** Non-identifying rate-limit subject, e.g. a hashed user id. */
  userKey?: string;
  ip?: string;
  priority?: AiPriority;
  onProgress?: (fraction: number) => void;
  /** Default explanation when a provider does not supply one. */
  explanation?: AiExplanation;
}

let counter = 0;

function newRequestId(): string {
  counter += 1;
  return `ai_${Date.now().toString(36)}_${counter.toString(36)}`;
}

function envelope<O>(
  capability: AiCapability,
  requestId: string,
  patch: Partial<AiResponse<O>>,
): AiResponse<O> {
  return {
    requestId,
    success: false,
    capability,
    provider: "none",
    model: "none",
    confidence: 0,
    processingMs: 0,
    usage: EMPTY_USAGE,
    cached: false,
    attempts: 0,
    fallbackUsed: false,
    degraded: false,
    result: null,
    warnings: [],
    errors: [],
    ...patch,
  };
}

function failure<O>(
  capability: AiCapability,
  requestId: string,
  error: AiError,
  patch: Partial<AiResponse<O>> = {},
): AiResponse<O> {
  return envelope<O>(capability, requestId, {
    ...patch,
    success: false,
    errors: [{ code: error.code, message: error.message, retryable: error.retryable }],
  });
}

/** Runs one AI request end to end and always resolves with an envelope. */
export async function executeAi<I, O>(request: AiRequest<I, O>): Promise<AiResponse<O>> {
  const requestId = newRequestId();
  const startedAt = Date.now();
  const { capability } = request;
  const config = capabilityConfig(capability);
  const stamp = request.promptId ? promptStamp(request.promptId) : {};
  const warnings: AiWarning[] = [];

  if (!isCapabilityEnabled(capability)) {
    const error = new AiError("disabled", capability);
    logAi(baseLog(requestId, capability, "none", "none", "failed", 0, error.code));
    return failure<O>(capability, requestId, error, stamp);
  }

  const providers = providersFor(capability);
  if (providers.length === 0) {
    const error = new AiError("provider_unavailable", capability);
    logAi(baseLog(requestId, capability, "none", "none", "failed", 0, error.code));
    return failure<O>(capability, requestId, error, stamp);
  }

  const limit = checkRateLimit({
    capability,
    provider: providers[0]!.id,
    ...(request.userKey ? { userKey: request.userKey } : {}),
    ...(request.ip ? { ip: request.ip } : {}),
  });
  if (!limit.allowed) {
    const error = new AiError("rate_limited", limit.scope);
    logAi(baseLog(requestId, capability, providers[0]!.id, providers[0]!.model, "failed", 0, error.code));
    return failure<O>(capability, requestId, error, stamp);
  }

  const cacheKey = request.cacheKey ?? aiCacheKey(capability, request.input);
  if (!request.skipCache) {
    const cached = readAiCache<AiResponse<O>>(cacheKey);
    if (cached) {
      const response: AiResponse<O> = { ...cached, requestId, cached: true, processingMs: 0 };
      logAi(baseLog(requestId, capability, response.provider, response.model, "cached", 0));
      recordAiMetric({
        capability,
        provider: response.provider,
        success: true,
        latencyMs: 0,
        confidence: response.confidence,
        cached: true,
        fallbackUsed: false,
        totalTokens: 0,
        estimatedCostPence: 0,
      });
      return response;
    }
  }

  if (isOverBudget()) {
    const stale = readStaleAiCache<AiResponse<O>>(cacheKey);
    if (stale) {
      warnings.push({ code: "budget_degraded", message: "Showing a recent Spacilo AI result." });
      return { ...stale, requestId, cached: true, degraded: true, warnings };
    }
    const error = new AiError("budget_exceeded");
    logAi(baseLog(requestId, capability, providers[0]!.id, providers[0]!.model, "failed", 0, error.code));
    return failure<O>(capability, requestId, error, stamp);
  }

  logAi(baseLog(requestId, capability, providers[0]!.id, providers[0]!.model, "started", 0));

  let attempts = 0;
  let lastError: AiError = new AiError("provider_unavailable");

  for (let index = 0; index < providers.length; index += 1) {
    const provider = providers[index]!;
    const isFallback = index > 0;

    for (let attempt = 1; attempt <= config.retries + 1; attempt += 1) {
      attempts += 1;
      try {
        const context: AiProviderContext = {
          requestId,
          capability,
          attempt,
          ...(request.signal ? { signal: request.signal } : {}),
          ...(request.onProgress ? { onProgress: request.onProgress } : {}),
        };
        const output = await withTimeout(
          provider.run(request.input, context),
          config.timeoutMs,
          request.signal,
        );

        const result = request.schema
          ? assertValid(request.schema, output.result)
          : (output.result as O);

        const confidence = clamp01(output.confidence ?? 0.8);
        if (confidence < config.minConfidence) {
          warnings.push({
            code: "low_confidence",
            message: "Spacilo AI is not fully confident here — please check the details.",
          });
        }

        const processingMs = Date.now() - startedAt;
        const usage = buildUsage(provider.model, {
          promptTokens: output.usage?.promptTokens ?? estimateTokens(request.input),
          completionTokens: output.usage?.completionTokens ?? estimateTokens(result),
        });

        const response: AiResponse<O> = envelope<O>(capability, requestId, {
          ...stamp,
          success: true,
          provider: provider.id,
          model: provider.model,
          confidence,
          processingMs,
          usage,
          attempts,
          fallbackUsed: isFallback,
          result,
          warnings: [...warnings, ...(output.warnings ?? [])],
          ...(output.explanation ?? request.explanation
            ? { explanation: output.explanation ?? request.explanation! }
            : {}),
        });

        if (!request.skipCache) writeAiCache(cacheKey, capability, response);
        logAi({
          ...baseLog(requestId, capability, provider.id, provider.model, "succeeded", processingMs),
          totalTokens: usage.totalTokens,
          estimatedCostPence: usage.estimatedCostPence,
          confidence,
          attempts,
          fallbackUsed: isFallback,
        });
        recordAiMetric({
          capability,
          provider: provider.id,
          success: true,
          latencyMs: processingMs,
          confidence,
          cached: false,
          fallbackUsed: isFallback,
          totalTokens: usage.totalTokens,
          estimatedCostPence: usage.estimatedCostPence,
        });
        return response;
      } catch (error) {
        lastError = toAiError(error);
        if (lastError.code === "cancelled") break;
        if (!lastError.retryable) break;
      }
    }

    if (lastError.code === "cancelled") break;
  }

  const processingMs = Date.now() - startedAt;
  logAi({
    ...baseLog(requestId, capability, providers[0]!.id, providers[0]!.model, "failed", processingMs, lastError.code),
    attempts,
    detail: lastError.detail ?? "",
  });
  recordAiMetric({
    capability,
    provider: providers[0]!.id,
    success: false,
    cancelled: lastError.code === "cancelled",
    latencyMs: processingMs,
    confidence: 0,
    cached: false,
    fallbackUsed: providers.length > 1,
    totalTokens: 0,
    estimatedCostPence: 0,
  });

  // Graceful degradation: a stale cached answer beats an empty screen.
  const stale = lastError.code === "cancelled" ? null : readStaleAiCache<AiResponse<O>>(cacheKey);
  if (stale) {
    return {
      ...stale,
      requestId,
      cached: true,
      degraded: true,
      attempts,
      warnings: [
        ...warnings,
        { code: "degraded", message: "Showing a recent Spacilo AI result while the service recovers." },
      ],
    };
  }

  return failure<O>(capability, requestId, lastError, { ...stamp, attempts, processingMs });
}

/**
 * Submits the same request as a background job. The caller gets a job it can
 * observe or cancel; the interface never waits.
 */
export function enqueueAi<I, O>(
  request: AiRequest<I, O>,
  label = `${request.capability} analysis`,
): AiJob<AiResponse<O>> {
  if (!isFlagEnabled("backgroundJobs")) {
    const job = submitAiJob<AiResponse<O>>(
      { capability: request.capability, label, priority: request.priority ?? "normal" },
      () => executeAi(request),
    );
    return job;
  }
  return submitAiJob<AiResponse<O>>(
    { capability: request.capability, label, priority: request.priority ?? "normal" },
    (context) =>
      executeAi({
        ...request,
        signal: request.signal ?? context.signal,
        onProgress: (fraction) => {
          context.report(fraction);
          request.onProgress?.(fraction);
        },
      }),
  );
}

/**
 * Streams a capability when the active provider supports it, falling back to a
 * single final chunk when it does not. The interface never freezes either way.
 */
export async function* streamAi<I, O>(
  request: AiRequest<I, O>,
): AsyncGenerator<AiStreamChunk<AiResponse<O>>> {
  const provider = providersFor(request.capability)[0] as AiProvider<I, O> | undefined;
  const streamable = isFlagEnabled("streaming") && provider?.stream;

  if (!streamable || !provider) {
    const response = await executeAi(request);
    yield { result: response, done: true };
    return;
  }

  const requestId = newRequestId();
  const startedAt = Date.now();
  const context: AiProviderContext = {
    requestId,
    capability: request.capability,
    attempt: 1,
    ...(request.signal ? { signal: request.signal } : {}),
  };

  try {
    let last: O | undefined;
    for await (const chunk of provider.stream!(request.input, context)) {
      if (chunk.result !== undefined) last = chunk.result;
      if (!chunk.done) {
        yield { ...(chunk.delta !== undefined ? { delta: chunk.delta } : {}), done: false };
      }
    }
    const processingMs = Date.now() - startedAt;
    const result = request.schema ? assertValid(request.schema, last) : (last as O);
    const usage = buildUsage(provider.model, {
      promptTokens: estimateTokens(request.input),
      completionTokens: estimateTokens(result),
    });
    recordAiMetric({
      capability: request.capability,
      provider: provider.id,
      success: true,
      latencyMs: processingMs,
      confidence: 0.8,
      cached: false,
      fallbackUsed: false,
      totalTokens: usage.totalTokens,
      estimatedCostPence: usage.estimatedCostPence,
    });
    yield {
      done: true,
      result: envelope<O>(request.capability, requestId, {
        ...(request.promptId ? promptStamp(request.promptId) : {}),
        success: true,
        provider: provider.id,
        model: provider.model,
        confidence: 0.8,
        processingMs,
        usage,
        attempts: 1,
        result,
      }),
    };
  } catch (error) {
    const aiError = toAiError(error);
    yield { done: true, result: failure<O>(request.capability, requestId, aiError) };
  }
}

/* -------------------------------------------------------------- helpers */

function baseLog(
  requestId: string,
  capability: AiCapability,
  provider: string,
  model: string,
  status: "started" | "succeeded" | "failed" | "cached" | "queued" | "cancelled",
  latencyMs: number,
  errorCode?: string,
) {
  return {
    requestId,
    capability,
    provider,
    model,
    status,
    latencyMs,
    totalTokens: 0,
    estimatedCostPence: 0,
    confidence: 0,
    attempts: 0,
    cached: status === "cached",
    fallbackUsed: false,
    ...(errorCode ? { errorCode } : {}),
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

async function withTimeout<T>(work: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) throw new AiError("cancelled");
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new AiError("timeout", `${ms}ms`)), ms);
        if (signal) {
          onAbort = () => reject(new AiError("cancelled"));
          signal.addEventListener("abort", onAbort, { once: true });
        }
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    if (signal && onAbort) signal.removeEventListener("abort", onAbort);
  }
}

export type { AiPriorityAlias };
