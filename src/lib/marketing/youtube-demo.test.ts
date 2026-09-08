import { describe, expect, it } from "vitest";

import {
  YOUTUBE_DEMO_SCOPES,
  YOUTUBE_DEMO_STEPS,
  clientHint,
  demoRecordingPath,
  evidencedSteps,
  recordingLabel,
  redactSensitive,
  runStatusLabel,
  type DemoRunView,
} from "./youtube-demo";

function run(patch: Partial<DemoRunView> = {}): DemoRunView {
  return {
    id: "run-1",
    status: "STARTED",
    scopes: YOUTUBE_DEMO_SCOPES.map((entry) => entry.scope),
    environment: "https://earnroom.co.uk",
    channel: null,
    marketingVideoId: null,
    youtubeVideoId: null,
    youtubeUrl: null,
    recordingStatus: "NOT_STARTED",
    recordingBytes: null,
    recordingMime: null,
    recordingUrl: null,
    notes: null,
    createdAt: "2026-09-08T10:00:00.000Z",
    updatedAt: "2026-09-08T10:00:00.000Z",
    ...patch,
  };
}

describe("youtube verification demo", () => {
  it("requests exactly the two production scopes", () => {
    expect(YOUTUBE_DEMO_SCOPES.map((entry) => entry.short)).toEqual([
      "youtube.upload",
      "youtube.readonly",
    ]);
    for (const entry of YOUTUBE_DEMO_SCOPES) expect(entry.use.length).toBeGreaterThan(30);
  });

  it("covers every step Google's review expects, including the unverified screen", () => {
    const ids = YOUTUBE_DEMO_STEPS.map((step) => step.id);
    expect(ids).toContain("unverified_screen");
    expect(ids).toContain("readonly_demo");
    expect(ids).toContain("real_upload");
    expect(ids[0]).toBe("open_app");
  });

  it("claims no evidence for a run that has done nothing", () => {
    expect(evidencedSteps(run())).toEqual([]);
  });

  it("claims readonly evidence only once a real channel came back", () => {
    const steps = evidencedSteps(run({ channel: { id: "UC1", title: "EarnRoom", customUrl: null } }));
    expect(steps).toContain("readonly_demo");
    expect(steps).not.toContain("real_upload");
  });

  it("claims upload evidence only with a real YouTube video id", () => {
    const steps = evidencedSteps(
      run({ marketingVideoId: "v1", youtubeVideoId: "abc123", status: "COMPLETE" }),
    );
    expect(steps).toContain("real_upload");
    expect(steps).toContain("youtube_result");
    expect(steps).toContain("final_state");
  });

  it("redacts access tokens, refresh tokens, client secrets and passwords", () => {
    const text = redactSensitive(
      "token ya29.a0AfB_x1 and 1//04abcdefghijklmnopqrstuvwx and GOCSPX-abc123 and password: hunter2",
    );
    expect(text).not.toContain("ya29.a0AfB_x1");
    expect(text).not.toContain("GOCSPX-abc123");
    expect(text).not.toContain("hunter2");
    expect(text).toContain("[redacted]");
  });

  it("never prints a whole client id", () => {
    const hint = clientHint("1234567890abcdefghijklmn.apps.googleusercontent.com");
    expect(hint).toContain("apps.googleusercontent.com");
    expect(hint).not.toContain("efghijklmn");
    expect(clientHint(null)).toBe("Not configured");
  });

  it("stores recordings under a private, run-scoped path", () => {
    expect(demoRecordingPath("run-1", "webm")).toBe("youtube-oauth-demo/run-1.webm");
    expect(demoRecordingPath("run-1", "../..")).toBe("youtube-oauth-demo/run-1.webm");
  });

  it("labels the paused state as safe for credentials", () => {
    expect(recordingLabel("PAUSED")).toMatch(/credentials/i);
    expect(runStatusLabel("COMPLETE")).toMatch(/complete/i);
  });
});
