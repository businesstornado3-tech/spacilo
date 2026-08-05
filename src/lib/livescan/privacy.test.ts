/**
 * Live Scan boundary guarantees, asserted against the source itself.
 *
 * Two promises must hold no matter how the UI evolves:
 *  1. Live frames never leave the device — only a deliberate capture enters the
 *     existing server pipeline.
 *  2. The heavy vision model is never loaded passively.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const LIVESCAN_DIR = "src/lib/livescan";
const read = (path: string) => readFileSync(path, "utf8");
/** Comments explain the boundary; only executable code can breach it. */
const readCode = (path: string) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const livescanFiles = readdirSync(LIVESCAN_DIR)
  .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
  .map((file) => join(LIVESCAN_DIR, file));

describe("live frames stay on the device", () => {
  it("has live scan modules to check", () => {
    expect(livescanFiles.length).toBeGreaterThan(5);
  });

  it("never calls the vision provider from the live layer", () => {
    for (const file of livescanFiles) {
      expect(readCode(file)).not.toMatch(/gemini|ai\.gateway\.lovable\.dev|LOVABLE_API_KEY/i);
    }
  });

  it("never posts frames over the network from the live layer", () => {
    for (const file of livescanFiles) {
      expect(read(file)).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|navigator\.sendBeacon/);
    }
  });

  it("never talks to the backend from the live layer", () => {
    for (const file of livescanFiles) {
      expect(read(file)).not.toMatch(/integrations\/supabase|createServerFn|\.functions['"]/);
    }
  });

  it("never records the stream", () => {
    for (const file of livescanFiles) {
      expect(read(file)).not.toMatch(/MediaRecorder|captureStream\(/);
    }
  });

  it("never persists frames to storage", () => {
    for (const file of livescanFiles) {
      expect(read(file)).not.toMatch(/localStorage|sessionStorage|indexedDB/);
    }
  });

  it("keeps the live hook free of uploads", () => {
    const hook = read("src/hooks/useLiveScan.ts");
    expect(hook).not.toMatch(/\bfetch\(|integrations\/supabase|gemini/i);
  });

  it("hands a captured frame back to the caller instead of sending it", () => {
    expect(read("src/hooks/useLiveScan.ts")).toMatch(/onCapture|capture\w*\(/);
  });
});

describe("zero passive load", () => {
  it("loads the model through a dynamic import only", () => {
    const detector = read("src/lib/livescan/detector.ts");
    expect(detector).toMatch(/import\(\s*["']@tensorflow/);
    expect(detector).not.toMatch(/^import .*@tensorflow/m);
  });

  it("keeps tensorflow out of every other live scan module", () => {
    for (const file of livescanFiles) {
      if (file.endsWith("detector.ts")) continue;
      expect(read(file)).not.toMatch(/^import .*@tensorflow/m);
    }
  });

  it("keeps tensorflow out of the hook and UI", () => {
    for (const file of ["src/hooks/useLiveScan.ts", "src/components/spacefit/live/LiveScanner.tsx"]) {
      expect(read(file)).not.toMatch(/^import .*@tensorflow/m);
    }
  });

  it("does not put the live scanner on the homepage", () => {
    expect(read("src/routes/index.tsx")).not.toMatch(/LiveScanner|livescan/);
  });

  it("does not put the live scanner on the renter dashboard", () => {
    expect(read("src/routes/_authenticated.renter.index.tsx")).not.toMatch(/LiveScanner|livescan/);
  });

  it("does not put the live scanner on the host dashboard", () => {
    expect(read("src/routes/_authenticated.host.index.tsx")).not.toMatch(/LiveScanner|livescan/);
  });

  it("does not put the live scanner on the SpaceFit hub", () => {
    expect(read("src/routes/_authenticated.spacefit.tsx")).not.toMatch(/LiveScanner|livescan/);
  });
});

describe("camera lifecycle is released", () => {
  it("stops tracks in the camera controller", () => {
    expect(read("src/lib/livescan/camera.ts")).toMatch(/getTracks\(\)[\s\S]{0,80}stop\(\)/);
  });

  it("cleans up on unmount in the hook", () => {
    const hook = read("src/hooks/useLiveScan.ts");
    expect(hook).toMatch(/useEffect/);
    expect(hook).toMatch(/stop\(\)/);
  });
});
