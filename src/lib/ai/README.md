# Spacilo AI Foundation (Phase 6A)

The production AI layer. Everything above it imports from `@/lib/ai` and
nowhere deeper, so a provider swap is a configuration change rather than a
refactor. This phase adds no visible UI.

## Layout

```text
src/lib/ai/
├── core/
│   ├── types.ts             standard AiResponse envelope, provider contract
│   ├── config.ts            timeouts, retries, provider order, budgets
│   ├── flags.ts             per-capability feature flags
│   ├── errors.ts            AiError codes + user-safe recovery paths
│   ├── security.ts          sanitising, PII redaction, injection guards
│   ├── validate.ts          schema validation for structured responses
│   ├── cache.ts             content-hashed cache with TTL + stale reads
│   ├── logger.ts            privacy-safe breadcrumbs
│   ├── metrics.ts           latency, success rate, cost
│   ├── rate-limit.ts        sliding windows per user / IP / provider
│   ├── prompts.ts           versioned prompt library with fallbacks
│   ├── explain.ts           explainable-AI reasoning objects
│   ├── usage.ts             token + cost estimation
│   ├── provider-manager.ts  pluggable provider registry
│   ├── queue.ts             priority background jobs
│   └── orchestrator.ts      executeAi / enqueueAi / streamAi
├── providers/local.ts       adapters over the existing intelligence engines
├── services/index.ts        the only API the app calls
└── bootstrap.ts             installSpaciloAi(), called once in src/router.tsx
```

## Calling AI

```ts
import { visionAi } from "@/lib/ai";

const response = await visionAi.analyseBelongings({ photos });
if (!response.success) showError(response.errors[0].message);
```

Every call returns the same envelope, and never throws:

```ts
{
  success, result, confidence, explanation, errors, warnings,
  provider, model, promptId, promptVersion, capability,
  requestId, latencyMs, attempts, fallbackUsed, cached, usage
}
```

Long jobs use the queue instead:

```ts
const job = visionAi.queueBelongings({ photos });
onAiJobUpdate(job.id, (next) => setProgress(next.progress));
```

Chat-style surfaces stream:

```ts
for await (const chunk of assistantAi.stream({ question, context })) { ... }
```

## Adding a provider

1. Implement `AiProvider<Input, Output>` (`id`, `kind`, `model`, `remote`,
   `capabilities`, `run`, optional `stream`, `estimateCost`, `healthCheck`).
2. `registerAiProvider(myProvider)` inside `installSpaciloAi()`.
3. Add its id to the capability's `providers` list in `core/config.ts` — order
   is the fallback order.

Remote providers hold no credentials: they call a Spacilo server function which
reads the key server-side. `setAiFlags({ remoteProviders: false })` disables
them all instantly.

## Adding a capability

1. Add the name to `AiCapability` in `core/types.ts`.
2. Add defaults in `core/config.ts` and a flag in `core/flags.ts`.
3. Add a versioned prompt in `core/prompts.ts` (plus a simpler fallback).
4. Add a feature service function in `services/index.ts`.

## Operating notes

- Failures degrade: retry → next provider → fallback prompt → stale cache →
  structured error with a recovery path. The UI never sees an exception.
- Prompts are versioned; changing one means a new version, not an edit.
- Logs, metrics and cache keys never contain photos, filenames, free text or
  identifiers.
- `aiMetrics()`, `aiLogEntries()`, `aiCacheStats()` and `aiQueueStats()` back
  future admin diagnostics.
