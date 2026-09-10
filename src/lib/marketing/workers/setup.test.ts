import { describe, expect, it } from "vitest";

import { normaliseHardware } from "./hardware";
import {
  capabilityVerdict,
  computerSetupState,
  installerFileName,
  pairingCodeFromPairFileName,
  pairingFileName,
  pairingScript,
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

describe("a computer that already has the worker", () => {
  const online = {
    ...BASE,
    hardware: normaliseHardware({ os: "Windows 11", ramGb: 30.7, cpuCores: 16 }),
  };

  it("names and reads back the pairing file", () => {
    const name = pairingFileName("abcd2345");
    expect(name).toBe("EarnRoom-Pair-This-Computer-ABCD2345.cmd");
    expect(pairingCodeFromPairFileName(name)).toBe("ABCD2345");
    expect(pairingCodeFromPairFileName("EarnRoom-Video-Worker-Setup-ABCD2345.exe")).toBeNull();
  });

  it("writes the session where the running worker already looks", () => {
    const script = pairingScript({
      code: "abcd2345",
      site: "https://earnroom.co.uk",
      label: "My computer",
    });
    expect(script).toContain(".earnroom-worker");
    expect(script).toContain('\\"code\\":\\"ABCD2345\\"');
    expect(script).toContain("/api/public/video-worker/pair");
  });

  it("says setup is required rather than not installed", () => {
    expect(computerSetupState({ ...BASE, alreadyInstalled: true })).toBe("INSTALLED_NEEDS_SETUP");
  });

  it("does not download anything again when a session is created for it", () => {
    expect(
      computerSetupState({ ...BASE, alreadyInstalled: true, sessionCreated: true }),
    ).toBe("SETUP_SESSION_CREATED");
  });

  it("downloads only when the worker is not installed", () => {
    expect(computerSetupState({ ...BASE, sessionCreated: true })).toBe("INSTALLER_DOWNLOADING");
    expect(computerSetupState({ ...BASE, sessionCreated: true, downloadStarted: true })).toBe(
      "INSTALLATION_PENDING",
    );
  });

  it("never says connected without a real heartbeat", () => {
    expect(
      computerSetupState({ ...BASE, sessionCreated: true, alreadyInstalled: true, claimed: true }),
    ).toBe("WORKER_CONNECTING");
    expect(
      computerSetupState({ ...online, sessionCreated: true, claimed: true, heartbeatAt: "now" }),
    ).toBe("CONNECTED");
    expect(
      computerSetupState({
        ...online,
        sessionCreated: true,
        claimed: true,
        heartbeatAt: "now",
        workerReady: true,
      }),
    ).toBe("READY");
  });

  it("reports a stale or expired computer as offline", () => {
    expect(computerSetupState({ ...online, heartbeatAt: "old", stale: true })).toBe("OFFLINE");
    expect(computerSetupState({ ...BASE, sessionCreated: true, expired: true })).toBe("OFFLINE");
  });

  it("starts from not installed", () => {
    expect(computerSetupState(BASE)).toBe("NOT_INSTALLED");
  });
});

describe("the pairing file a Windows computer downloads", () => {
  const code = "ABCD2345";

  it("has a deterministic filename that maps back to the session", () => {
    const name = pairingFileName(code);
    expect(name).toBe("EarnRoom-Pair-This-Computer-ABCD2345.cmd");
    expect(pairingCodeFromPairFileName(name)).toBe(code);
  });

  it("refuses a filename that is not a pairing file", () => {
    expect(pairingCodeFromPairFileName("something-else.cmd")).toBeNull();
    expect(pairingCodeFromPairFileName("EarnRoom-Pair-This-Computer-.cmd")).toBeNull();
  });

  it("is a small, complete file with a knowable byte length", () => {
    const script = pairingScript({ code, site: "https://earnroom.co.uk", label: "My computer" });
    const bytes = new TextEncoder().encode(script);
    expect(bytes.byteLength).toBe(script.length);
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(bytes.byteLength).toBeLessThan(4_000);
    expect(script.endsWith("\r\n")).toBe(true);
  });

  it("writes the session where the already-installed worker looks for it", () => {
    const script = pairingScript({ code, site: "https://earnroom.co.uk", label: "My computer" });
    expect(script).toContain(".earnroom-worker");
    expect(script).toContain("setup.json");
    expect(script).toContain(`\\"code\\":\\"${code}\\"`);
  });

  it("carries no credential of its own", () => {
    const script = pairingScript({ code, site: "https://earnroom.co.uk", label: "My computer" });
    // The machine's own key only ever exists after the exchange, on the machine.
    expect(script).toContain("$r.token");
    expect(/[0-9a-f]{32,}/.test(script)).toBe(false);
    expect(script.toLowerCase()).not.toContain("secret");
  });

  it("names free cloud capacity as its own thing", () => {
    const name = pairingFileName(code, "FREE_CLOUD");
    expect(name).toBe("EarnRoom-Free-Cloud-Worker-ABCD2345.cmd");
    expect(pairingCodeFromPairFileName(name)).toBe(code);
    const script = pairingScript({
      code,
      site: "https://earnroom.co.uk",
      label: "Free capacity",
      mode: "FREE_CLOUD",
    });
    expect(script).toContain("free cloud capacity");
  });

  it("keeps anything odd in the computer name out of the file", () => {
    const script = pairingScript({
      code,
      site: "https://earnroom.co.uk",
      label: 'evil" & del /q *',
    });
    expect(script).not.toContain("del /q");
    expect(script).not.toContain("&");
  });
});
