import { describe, expect, it, vi } from "vitest";

import {
  claimGrowthCampaignLock,
  persistGrowthCampaignResult,
  persistGrowthLearningSignal,
} from "./persistence";
import type { GrowthPersistenceClient } from "./persistence";

type Recorder = { table: string; payload: unknown; filters: Record<string, unknown> };

/**
 * A minimal Supabase query-builder double. It records what the persistence
 * layer asked for so the safety-critical behaviour — lock ownership and
 * retry-safe learning writes — can be asserted without a live database.
 */
function fakeClient(options: {
  updateResult?: { data: unknown; error: null } | { data: null; error: null };
  insertError?: { code: string; message: string } | null;
  recorder?: Recorder[];
}): GrowthPersistenceClient {
  const recorder = options.recorder ?? [];
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const builder: Record<string, unknown> = {
        update(payload: unknown) {
          recorder.push({ table, payload, filters });
          return builder;
        },
        insert(payload: unknown) {
          recorder.push({ table, payload, filters });
          return Promise.resolve({ data: null, error: options.insertError ?? null });
        },
        eq(column: string, value: unknown) {
          filters[column] = value;
          return builder;
        },
        is(column: string, value: unknown) {
          filters[column] = value;
          return builder;
        },
        select() {
          return builder;
        },
        maybeSingle() {
          return Promise.resolve(options.updateResult ?? { data: { id: "c1" }, error: null });
        },
      };
      return builder;
    },
  } as unknown as GrowthPersistenceClient;
}

describe("growth campaign lock ownership", () => {
  it("only claims a campaign that is unlocked and unsent", async () => {
    const recorder: Recorder[] = [];
    const claimed = await claimGrowthCampaignLock(
      fakeClient({ recorder }),
      "c1",
      "lock-a",
      1_000_000,
    );

    expect(claimed).toBe(true);
    expect(recorder[0]?.filters).toMatchObject({ id: "c1", send_lock: null, sent_at: null });
  });

  it("reports a lost race instead of overwriting another worker's lock", async () => {
    const claimed = await claimGrowthCampaignLock(
      fakeClient({ updateResult: { data: null, error: null } }),
      "c1",
      "lock-b",
      1_000_000,
    );

    expect(claimed).toBe(false);
  });

  it("refuses to write a result unless this worker still owns the lock", async () => {
    await expect(
      persistGrowthCampaignResult(
        fakeClient({ updateResult: { data: null, error: null } }),
        "c1",
        "lock-a",
        { state: "SENT", attemptNumber: 1, sentAt: 1_000_001, lastError: null },
      ),
    ).rejects.toThrow(/send lock/i);
  });

  it("releases the lock it owns when persisting a result", async () => {
    const recorder: Recorder[] = [];
    await persistGrowthCampaignResult(fakeClient({ recorder }), "c1", "lock-a", {
      state: "SENT",
      attemptNumber: 1,
      sentAt: 1_000_001,
      lastError: null,
    });

    expect(recorder[0]?.filters).toMatchObject({ id: "c1", send_lock: "lock-a" });
    expect(recorder[0]?.payload).toMatchObject({ send_lock: null, locked_at: null });
  });
});

describe("growth learning idempotency", () => {
  it("stores the supplied idempotency key with the outcome", async () => {
    const recorder: Recorder[] = [];
    await persistGrowthLearningSignal(
      fakeClient({ recorder }),
      { opportunityKey: "opp_a", channel: "email", outcome: "sent", at: 5 },
      { source: "growth.delivery" },
      "camp-1:1:sent",
    );

    expect(recorder[0]?.payload).toMatchObject({
      idempotency_key: "camp-1:1:sent",
      opportunity_key: "opp_a",
      outcome: "sent",
    });
  });

  it("swallows a duplicate-key retry rather than double-counting an outcome", async () => {
    await expect(
      persistGrowthLearningSignal(
        fakeClient({ insertError: { code: "23505", message: "duplicate key" } }),
        { opportunityKey: "opp_a", channel: "email", outcome: "sent", at: 5 },
        {},
        "camp-1:1:sent",
      ),
    ).resolves.toBeUndefined();
  });

  it("still surfaces a genuine write failure", async () => {
    await expect(
      persistGrowthLearningSignal(
        fakeClient({ insertError: { code: "42501", message: "permission denied" } }),
        { opportunityKey: "opp_a", channel: null, outcome: "converted", at: 5 },
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("growth persistence never invents identity", () => {
  it("writes no raw recipient address on a learning signal", async () => {
    const recorder: Recorder[] = [];
    await persistGrowthLearningSignal(
      fakeClient({ recorder }),
      { opportunityKey: "opp_a", channel: "sms", outcome: "blocked", at: 9 },
      { source: "growth.delivery" },
      "camp-2:1:blocked",
    );

    expect(JSON.stringify(recorder[0]?.payload)).not.toMatch(/@|\+44/);
    expect(vi.isMockFunction(fakeClient)).toBe(false);
  });
});
