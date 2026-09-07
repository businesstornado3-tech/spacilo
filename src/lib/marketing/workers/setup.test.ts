import { describe, expect, it } from "vitest";

import { normaliseHardware } from "./hardware";
import {
  capabilityVerdict,
  installerFileName,
  pairingCodeFromFileName,
  setupView,
  type SetupSignals,
} from "./setup";

const BASE: SetupSignals = {
  sessionCreated: false,
  downloadStarted: false,
  claimed: false,
  heartbeatAt: null,
  hardware: null,
  expired: false,
  installerAvailable: true,
};

describe("installer filename carries the setup session", () => {
  it("names the download after the code", () => {
    expect(installerFileName("abcd2345")).toBe("EarnRoom-Video-Worker-Setup-ABCD2345.exe");
  });

  it("reads the code back out", () => {
    expect(pairingCodeFromFileName("EarnRoom-Video-Worker-Setup-ABCD2345.exe")).toBe("ABCD2345");
  });

  it("refuses anything else", () => {
    expect(pairingCodeFromFileName("setup.exe")).toBeNull();
    expect(pairingCodeFromFileName("EarnRoom-Video-Worker-Setup-.exe")).toBeNull();
  });
});

describe("setup never claims progress it cannot prove", () => {
  it("says so plainly when no installer is published", () => {
    const view = setupView({ ...BASE, installerAvailable: false, sessionCreated: true });
    expect(view.stage).toBe("UNAVAILABLE");
  });

  it("waits at installing until a machine claims the session", () => {
    const view = setupView({ ...BASE, sessionCreated: true, downloadStarted: true });
    expect(view.stage).toBe("INSTALLING");
    expect(view.detail).toContain("Open the downloaded");
    expect(view.connected).toBe(false);
  });

  it("moves to connecting only once the machine has paired", () => {
    expect(setupView({ ...BASE, sessionCreated: true, downloadStarted: true, claimed: true }).stage).toBe(
      "CONNECTING",
    );
  });

  it("detects hardware after the first heartbeat", () => {
    const view = setupView({
      ...BASE,
      sessionCreated: true,
      downloadStarted: true,
      claimed: true,
      heartbeatAt: "2026-09-07T09:00:00.000Z",
    });
    expect(view.stage).toBe("DETECTING");
  });

  it("connects only with a heartbeat and real hardware", () => {
    const view = setupView({
      ...BASE,
      sessionCreated: true,
      downloadStarted: true,
      claimed: true,
      heartbeatAt: "2026-09-07T09:00:00.000Z",
      hardware: normaliseHardware({ dedicatedVramGb: 12, ramGb: 32 }),
    });
    expect(view.stage).toBe("CONNECTED");
    expect(view.connected).toBe(true);
    expect(view.completed).toContain("STARTING");
  });

  it("times out an unclaimed session", () => {
    const view = setupView({ ...BASE, sessionCreated: true, downloadStarted: true, expired: true });
    expect(view.stage).toBe("EXPIRED");
  });
});

describe("capability verdict is honest about weak machines", () => {
  it("calls a dedicated card ready", () => {
    expect(capabilityVerdict(normaliseHardware({ dedicatedVramGb: 12 })).word).toBe("READY");
  });

  it("calls shared-memory-only machines limited", () => {
    const verdict = capabilityVerdict(normaliseHardware({ sharedGpuMemoryGb: 16, ramGb: 16 }));
    expect(verdict.word).toBe("LIMITED");
    expect(verdict.detail).toContain("short, simple animated videos");
  });
});
