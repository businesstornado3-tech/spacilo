/**
 * Guest SpaceFit — security and abuse-boundary tests.
 *
 * These are behavioural tests of the server boundary itself, not of the pure
 * helpers: they exercise session issuance, cross-guest isolation, every rate
 * limit, upload validation, image cleanup, concurrency/idempotency and the
 * claim path, against an in-memory stand-in for the database and storage.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FakeSupabase } from "@/lib/spacefit-guest/fake-supabase";
import { hashGuestToken } from "@/lib/spacefit-guest/token.server";
import {
  GUEST_IP_WINDOW_MINUTES,
  MAX_GUEST_PHOTOS,
  MAX_GUEST_RUNS_PER_IP,
  MAX_GUEST_SESSIONS_PER_IP,
  MAX_RUNS_PER_GUEST_SESSION,
} from "@/lib/spacefit-guest/config";

const db = new FakeSupabase();

const provider = {
  id: "test-provider",
  model: "test-model",
  analyseInventoryPhotos: vi.fn(),
  analyseSpacePhotos: vi.fn(),
};

vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return currentDb();
  },
}));

vi.mock("@/lib/spacefit-vision/provider.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/spacefit-vision/provider.server")>();
  return {
    ...actual,
    getVisionProvider: async () => currentProvider(),
  };
});

let active: FakeSupabase = db;
const currentDb = () => active;
const currentProvider = () => provider;

const { claimGuestSession, createGuestSession, GuestSpaceFitError, runGuestAnalysis } =
  await import("@/lib/spacefit-guest/guest.server");

/* ------------------------------------------------------------- helpers */

/** A base64 payload that decodes to exactly `bytes` bytes. */
function image(bytes = 1024, mimeType = "image/jpeg") {
  return { mimeType, base64: Buffer.alloc(bytes, 7).toString("base64") };
}

function detection(label: string) {
  return {
    label,
    suggested_category: "boxes",
    suggested_catalogue_key: null,
    estimated_quantity: 2,
    minimum_plausible_quantity: null,
    maximum_plausible_quantity: null,
    object_confidence: "medium",
    quantity_confidence: "medium",
    inventory_intent: "likely_inventory",
    repeated_item_group: false,
    stackable_suggestion: "unknown",
    fragile_suggestion: "unknown",
    orientation_flexible_suggestion: "unknown",
    source_photo_indexes: [0],
    possible_duplicate_group: null,
    duplicate_certainty: null,
    possible_restricted_item: false,
    restricted_reason: null,
    notes: null,
  };
}

const spaceScan = {
  estimated_width_m: 3,
  estimated_depth_m: 5,
  estimated_usable_height_m: 2.2,
  measurement_confidence: "medium" as const,
  reference_used: "standard doorway",
  obstacles: [],
  limitations: [],
  notes: null,
};

function sessionRow(token: string) {
  const hash = hashGuestToken(token);
  return db.rows("guest_spacefit_sessions").find((row) => row["token_hash"] === hash);
}

async function expectCategory(promise: Promise<unknown>, category: string) {
  await expect(promise).rejects.toBeInstanceOf(GuestSpaceFitError);
  await promise.catch((error: InstanceType<typeof GuestSpaceFitError>) => {
    expect(error.category).toBe(category);
  });
}

beforeEach(() => {
  active = db;
  db.tables.clear();
  db.uploads.length = 0;
  db.removals.length = 0;
  db.rpcCalls.length = 0;
  db.uploadFails = false;
  provider.analyseInventoryPhotos.mockReset();
  provider.analyseSpacePhotos.mockReset();
  provider.analyseInventoryPhotos.mockResolvedValue({
    result: { detections: [detection("cardboard box")] },
  });
  provider.analyseSpacePhotos.mockResolvedValue({ result: spaceScan });
});

/* ------------------------------------------------------------ sessions */

describe("guest sessions", () => {
  it("issues an unguessable reference and stores only its hash", async () => {
    const session = await createGuestSession("renter", "203.0.113.10");

    expect(session.token).toMatch(/^[A-Za-z0-9_-]{40,64}$/);
    const row = sessionRow(session.token)!;
    expect(row["token_hash"]).not.toBe(session.token);
    expect(row["token_hash"]).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(row)).not.toContain(session.token);
  });

  it("never repeats a reference", async () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 5; i += 1) {
      tokens.add((await createGuestSession("renter", null)).token);
    }
    expect(tokens.size).toBe(5);
  });

  it("expires sessions in the future, not the past", async () => {
    const session = await createGuestSession("host", null);
    expect(new Date(session.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("rejects an unknown reference", async () => {
    await expectCategory(
      runGuestAnalysis({ token: "z".repeat(43), kind: "renter", images: [image()] }),
      "session_invalid",
    );
  });

  it("rejects a malformed reference before any lookup", async () => {
    await expectCategory(
      runGuestAnalysis({ token: "short", kind: "renter", images: [image()] }),
      "session_invalid",
    );
    expect(db.rows("guest_spacefit_runs")).toHaveLength(0);
  });

  it("rejects an expired session", async () => {
    const session = await createGuestSession("renter", null);
    sessionRow(session.token)!["expires_at"] = new Date(Date.now() - 1000).toISOString();

    await expectCategory(
      runGuestAnalysis({ token: session.token, kind: "renter", images: [image()] }),
      "session_expired",
    );
  });

  it("refuses to run a scan of the wrong kind for the session", async () => {
    const session = await createGuestSession("renter", null);
    await expectCategory(
      runGuestAnalysis({ token: session.token, kind: "host", images: [image()] }),
      "invalid_request",
    );
  });

  it("keeps one guest's result unreachable with another guest's reference", async () => {
    const a = await createGuestSession("renter", null);
    const b = await createGuestSession("renter", null);
    await runGuestAnalysis({ token: a.token, kind: "renter", images: [image()] });

    const other = await claimGuestSession({
      supabase: db,
      userId: "user-b",
      token: b.token,
    }).catch((error) => error);
    expect(other).toBeInstanceOf(GuestSpaceFitError);
    expect(sessionRow(a.token)!["result"]).toBeTruthy();
    expect(sessionRow(b.token)!["result"]).toBeFalsy();
  });
});

/* -------------------------------------------------------- rate limiting */

describe("guest rate limits", () => {
  it("caps scans per session", async () => {
    const session = await createGuestSession("renter", null);
    sessionRow(session.token)!["run_count"] = MAX_RUNS_PER_GUEST_SESSION;

    await expectCategory(
      runGuestAnalysis({ token: session.token, kind: "renter", images: [image()] }),
      "rate_limited",
    );
  });

  it("counts each completed scan against the session allowance", async () => {
    const session = await createGuestSession("renter", null);
    await runGuestAnalysis({ token: session.token, kind: "renter", images: [image()] });
    expect(sessionRow(session.token)!["run_count"]).toBe(1);
  });

  it("caps sessions per network within the window", async () => {
    for (let i = 0; i < MAX_GUEST_SESSIONS_PER_IP; i += 1) {
      await createGuestSession("renter", "198.51.100.4");
    }
    await expectCategory(createGuestSession("renter", "198.51.100.4"), "rate_limited");
    await expect(createGuestSession("renter", "198.51.100.5")).resolves.toBeTruthy();
  });

  it("forgets sessions older than the rolling window", async () => {
    for (let i = 0; i < MAX_GUEST_SESSIONS_PER_IP; i += 1) {
      await createGuestSession("renter", "198.51.100.7");
    }
    for (const row of db.rows("guest_spacefit_sessions")) {
      row["created_at"] = new Date(
        Date.now() - (GUEST_IP_WINDOW_MINUTES + 5) * 60_000,
      ).toISOString();
    }
    await expect(createGuestSession("renter", "198.51.100.7")).resolves.toBeTruthy();
  });

  it("caps total scans per network across sessions", async () => {
    const first = await createGuestSession("renter", "198.51.100.9");
    const rows = db.rows("guest_spacefit_sessions");
    rows[0]!["run_count"] = MAX_GUEST_RUNS_PER_IP;

    await expectCategory(
      runGuestAnalysis({ token: first.token, kind: "renter", images: [image()] }),
      "rate_limited",
    );
  });

  it("throttles anonymous visitors without an address by session only", async () => {
    const session = await createGuestSession("renter", null);
    await expect(
      runGuestAnalysis({ token: session.token, kind: "renter", images: [image()] }),
    ).resolves.toBeTruthy();
  });
});

/* -------------------------------------------------------------- privacy */

describe("guest privacy", () => {
  it("stores a salted hash of the address, never the address", async () => {
    const session = await createGuestSession("renter", "203.0.113.55");
    const row = sessionRow(session.token)!;

    expect(row["ip_hash"]).toBeTruthy();
    expect(row["ip_hash"]).not.toContain("203.0.113.55");
    expect(JSON.stringify(row)).not.toContain("203.0.113.55");
  });

  it("gives different addresses different hashes", async () => {
    const a = await createGuestSession("renter", "203.0.113.1");
    const b = await createGuestSession("renter", "203.0.113.2");
    expect(sessionRow(a.token)!["ip_hash"]).not.toBe(sessionRow(b.token)!["ip_hash"]);
  });
});

/* ------------------------------------------------------- upload security */

describe("guest upload validation", () => {
  it("refuses a file type outside the allowlist", async () => {
    const session = await createGuestSession("renter", null);
    await expectCategory(
      runGuestAnalysis({
        token: session.token,
        kind: "renter",
        images: [image(1024, "application/pdf")],
      }),
      "invalid_request",
    );
    expect(provider.analyseInventoryPhotos).not.toHaveBeenCalled();
  });

  it("refuses an oversized image", async () => {
    const session = await createGuestSession("renter", null);
    await expectCategory(
      runGuestAnalysis({
        token: session.token,
        kind: "renter",
        images: [image(9 * 1024 * 1024)],
      }),
      "invalid_request",
    );
  });

  it("refuses an empty photo set", async () => {
    const session = await createGuestSession("renter", null);
    await expectCategory(
      runGuestAnalysis({ token: session.token, kind: "renter", images: [] }),
      "invalid_request",
    );
  });

  it("never sends more than the guest photo allowance to the provider", async () => {
    const session = await createGuestSession("renter", null);
    await runGuestAnalysis({
      token: session.token,
      kind: "renter",
      images: Array.from({ length: MAX_GUEST_PHOTOS + 3 }, () => image()),
    });

    const call = provider.analyseInventoryPhotos.mock.calls[0]![0];
    expect(call.images).toHaveLength(MAX_GUEST_PHOTOS);
  });
});

/* --------------------------------------------------------- image retention */

describe("guest image retention", () => {
  it("uploads to the isolated private bucket with server-generated names", async () => {
    const session = await createGuestSession("renter", null);
    await runGuestAnalysis({ token: session.token, kind: "renter", images: [image()] });

    expect(db.uploads).toHaveLength(1);
    expect(db.uploads[0]!.bucket).toBe("guest-scans");
    expect(db.uploads[0]!.path).toMatch(/^id-\d+\/[0-9a-f-]{36}\.jpg$/);
  });

  it("deletes every uploaded image once the scan succeeds", async () => {
    const session = await createGuestSession("renter", null);
    await runGuestAnalysis({ token: session.token, kind: "renter", images: [image(), image()] });

    expect(db.removals).toHaveLength(1);
    expect(db.removals[0]!.paths).toEqual(db.uploads.map((upload) => upload.path));
  });

  it("deletes uploaded images even when the provider fails", async () => {
    provider.analyseInventoryPhotos.mockRejectedValue(new Error("provider down"));
    const session = await createGuestSession("renter", null);

    await expect(
      runGuestAnalysis({ token: session.token, kind: "renter", images: [image()] }),
    ).rejects.toBeInstanceOf(GuestSpaceFitError);
    expect(db.removals[0]!.paths).toHaveLength(1);
  });

  it("still analyses when storage is unavailable, and stores nothing", async () => {
    db.uploadFails = true;
    const session = await createGuestSession("renter", null);

    await expect(
      runGuestAnalysis({ token: session.token, kind: "renter", images: [image()] }),
    ).resolves.toMatchObject({ kind: "renter" });
    expect(db.uploads).toHaveLength(0);
    expect(db.removals).toHaveLength(0);
  });
});

/* --------------------------------------------- concurrency and idempotency */

describe("guest scan concurrency", () => {
  it("returns the first answer for a repeated attempt id without calling the provider twice", async () => {
    const session = await createGuestSession("renter", null);
    const args = {
      token: session.token,
      kind: "renter" as const,
      images: [image()],
      clientRequestId: "attempt-1",
    };

    const first = await runGuestAnalysis(args);
    const second = await runGuestAnalysis(args);

    expect(first.reused).toBe(false);
    expect(second.reused).toBe(true);
    expect(provider.analyseInventoryPhotos).toHaveBeenCalledTimes(1);
  });

  it("refuses a second scan while one is running", async () => {
    const session = await createGuestSession("renter", null);
    db.seed("guest_spacefit_runs", {
      session_id: sessionRow(session.token)!["id"],
      status: "running",
    });

    await expectCategory(
      runGuestAnalysis({ token: session.token, kind: "renter", images: [image()] }),
      "rate_limited",
    );
  });

  it("lets a failed attempt be retried with the same attempt id", async () => {
    provider.analyseInventoryPhotos.mockRejectedValueOnce(new Error("transient"));
    const session = await createGuestSession("renter", null);
    const args = {
      token: session.token,
      kind: "renter" as const,
      images: [image()],
      clientRequestId: "attempt-retry",
    };

    await expect(runGuestAnalysis(args)).rejects.toBeInstanceOf(GuestSpaceFitError);
    await expect(runGuestAnalysis(args)).resolves.toMatchObject({ reused: false });
  });
});

/* ---------------------------------------------------------------- claim */

describe("claiming a guest scan", () => {
  async function scannedRenter() {
    const session = await createGuestSession("renter", null);
    await runGuestAnalysis({ token: session.token, kind: "renter", images: [image()] });
    return session;
  }

  it("creates pending, reviewable detections owned by the claimant", async () => {
    const session = await scannedRenter();
    const result = await claimGuestSession({
      supabase: db,
      userId: "user-1",
      token: session.token,
    });

    expect(result.kind).toBe("renter");
    const detections = db.rows("inventory_detections");
    expect(detections.length).toBeGreaterThan(0);
    for (const row of detections) {
      expect(row["review_status"]).toBe("pending");
      expect(row["user_id"]).toBe("user-1");
    }
  });

  it("marks the session claimed so it cannot be replayed anonymously", async () => {
    const session = await scannedRenter();
    await claimGuestSession({ supabase: db, userId: "user-1", token: session.token });

    expect(sessionRow(session.token)!["claimed_by"]).toBe("user-1");
    await expectCategory(
      runGuestAnalysis({ token: session.token, kind: "renter", images: [image()] }),
      "already_claimed",
    );
  });

  it("is idempotent — a second claim never duplicates items", async () => {
    const session = await scannedRenter();
    await claimGuestSession({ supabase: db, userId: "user-1", token: session.token });
    const afterFirst = db.rows("inventory_detections").length;

    const again = await claimGuestSession({ supabase: db, userId: "user-1", token: session.token });
    expect(again).toMatchObject({ idempotent: true });
    expect(db.rows("inventory_detections")).toHaveLength(afterFirst);
  });

  it("refuses a claim from a different account", async () => {
    const session = await scannedRenter();
    await claimGuestSession({ supabase: db, userId: "user-1", token: session.token });

    await expectCategory(
      claimGuestSession({ supabase: db, userId: "user-2", token: session.token }),
      "already_claimed",
    );
  });

  it("refuses to claim an expired session", async () => {
    const session = await scannedRenter();
    sessionRow(session.token)!["expires_at"] = new Date(Date.now() - 1000).toISOString();

    await expectCategory(
      claimGuestSession({ supabase: db, userId: "user-1", token: session.token }),
      "session_expired",
    );
  });

  it("refuses to claim a session that produced no result", async () => {
    const session = await createGuestSession("renter", null);
    await expectCategory(
      claimGuestSession({ supabase: db, userId: "user-1", token: session.token }),
      "session_invalid",
    );
  });

  it("uses the SERVER-stored result, ignoring anything the client believes", async () => {
    const session = await scannedRenter();
    sessionRow(session.token)!["result"] = {
      kind: "renter",
      detections: [
        {
          ...detection("server-truth sofa"),
          catalogue_key: null,
          category: "boxes",
          catalogue_strength: "none",
        },
      ],
    };

    await claimGuestSession({ supabase: db, userId: "user-1", token: session.token });
    const labels = db.rows("inventory_detections").map((row) => row["detected_label"]);
    expect(labels).toEqual(["server-truth sofa"]);
  });

  it("returns a host scan as an unverified proposal and writes no listing", async () => {
    const session = await createGuestSession("host", null);
    await runGuestAnalysis({ token: session.token, kind: "host", images: [image()] });

    const result = await claimGuestSession({
      supabase: db,
      userId: "host-1",
      token: session.token,
    });

    expect(result.kind).toBe("host");
    expect(db.rows("spaces")).toHaveLength(0);
    expect(sessionRow(session.token)!["status"]).toBe("claimed");
  });
});
