/**
 * SpaceFit Live Scan — HOST product-flow integration.
 *
 * The acceptance question is not "does BoundaryEditor.tsx exist?" but "can a
 * real host starting from Scan my space actually reach and use it?". These
 * tests assert the reachable wiring on every host surface: guest, dashboard
 * entry, listing wizard — one shared flow, no second scanner.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const FILES = {
  flow: "src/components/spacefit/live/HostSpaceCapture.tsx",
  scanner: "src/components/spacefit/live/LiveScanner.tsx",
  editor: "src/components/spacefit/live/BoundaryEditor.tsx",
  hook: "src/hooks/useLiveScan.ts",
  guidance: "src/lib/livescan/guidance.ts",
  scale: "src/lib/livescan/boundary-scale.ts",
  hostScanner: "src/components/host/spacefit/SpaceScanner.tsx",
  guestShell: "src/components/spacefit/GuestScanShell.tsx",
  guestSpace: "src/routes/spacefit.space.tsx",
  wizardSteps: "src/components/host/listing/steps.tsx",
  entry: "src/lib/spacefit-entry.ts",
};

describe("the host route reaches the shared live scanner", () => {
  it("routes Scan my space to the guest preview or the listing wizard", () => {
    const source = read(FILES.entry);
    expect(source).toMatch(/\/spacefit\/space/);
    expect(source).toMatch(/\/host\/spaces\/new/);
  });

  it("uses one shared host flow, not a second scanner implementation", () => {
    expect(read(FILES.hostScanner)).toMatch(/<HostSpaceCapture/);
    expect(read(FILES.guestShell)).toMatch(/<HostSpaceCapture/);
    expect(read(FILES.flow)).toMatch(/<LiveScanner[\s\S]{0,80}mode="host"/);
  });

  it("exposes the host flow on the listing wizard size step", () => {
    expect(read(FILES.wizardSteps)).toMatch(/<SpaceScanner/);
  });

  it("exposes the host flow on the guest space route", () => {
    expect(read(FILES.guestSpace)).toMatch(/mode="host"/);
  });
});

describe("live host guidance is visible over the camera", () => {
  it("renders the guidance sentence inside the viewport", () => {
    const source = read(FILES.scanner);
    expect(source).toMatch(/absolute inset-x-3 bottom-3[\s\S]{0,300}scan\.guidance\.message/);
  });

  it("shows capture readiness only once the camera is ready", () => {
    const source = read(FILES.scanner);
    expect(source).toMatch(/cameraReady \?[\s\S]{0,600}CAPTURE_READINESS_LABEL/);
  });

  it("labels a black viewport with camera state, never Not ready", () => {
    const source = read(FILES.scanner);
    expect(source).toMatch(/!cameraReady[\s\S]{0,400}CAMERA_STATE_COPY/);
  });

  it("derives guidance from local signals that genuinely change", () => {
    const source = read(FILES.guidance);
    expect(source).toMatch(/Lighting is too low/);
    expect(source).toMatch(/show more floor/);
    expect(source).toMatch(/Good angle/);
    expect(source).not.toMatch(/gemini|fetch\(/i);
  });

  it("names the host capture action clearly", () => {
    expect(read(FILES.scanner)).toMatch(/Capture space/);
  });
});

describe("capture freezes the frame and releases the camera", () => {
  it("releases the camera when the flow leaves the scanning stage", () => {
    // The scanner is unmounted on capture, and the hook stops tracks on unmount.
    const flow = read(FILES.flow);
    expect(flow).toMatch(/stage === "choose"/);
    expect(flow).toMatch(/stage === "draw"/);
    expect(flow).toMatch(/<LiveScanner/);
    expect(read(FILES.hook)).toMatch(/React\.useEffect\(\(\) => stop, \[stop\]\)/);
  });

  it("freezes the captured frame in the host flow", () => {
    const source = read(FILES.flow);
    expect(source).toMatch(/URL\.createObjectURL\(file\)/);
    expect(source).toMatch(/setStage\("choose"\)/);
  });

  it("revokes the frozen frame so no blob leaks", () => {
    expect(read(FILES.flow)).toMatch(/revokeObjectURL/);
  });

  it("offers the post-capture choice before drawing", () => {
    const source = read(FILES.flow);
    expect(source).toMatch(/Which part of this space are you offering\?/);
    expect(source).toMatch(/Draw available area/);
    expect(source).toMatch(/Use full visible space/);
  });

  it("opens the boundary editor from Draw available area", () => {
    const source = read(FILES.flow);
    expect(source).toMatch(/Draw available area[\s\S]{0,200}setStage\("draw"\)|setStage\("draw"\)[\s\S]{0,200}Draw available area/);
    expect(source).toMatch(/stage === "draw"[\s\S]{0,200}<BoundaryEditor/);
  });
});

describe("the boundary toolbar is visible and usable on mobile", () => {
  const source = read(FILES.editor);

  it("offers rectangle, square, circle and flexible", () => {
    expect(source).toMatch(/shape: "rectangle", label: "Rectangle"/);
    expect(source).toMatch(/shape: "square", label: "Square"/);
    expect(source).toMatch(/shape: "circle", label: "Circle"/);
    expect(source).toMatch(/shape: "polygon", label: "Flexible"/);
  });

  it("defaults to rectangle", () => {
    expect(source).toMatch(/useState<BoundaryShape>\("rectangle"\)/);
    expect(source).toMatch(/defaultBoundary\("rectangle"\)/);
  });

  it("gives every handle a large touch target", () => {
    expect(source).toMatch(/size-12/);
    expect(source).toMatch(/onPointerDown/);
  });

  it("keeps flexible actions in plain language", () => {
    expect(source).toMatch(/Add a point/);
    expect(source).toMatch(/Remove last point/);
    expect(source).toMatch(/Undo/);
    expect(source).toMatch(/Start again/);
  });

  it("offers the measurement target choice", () => {
    expect(source).toMatch(/What have you outlined\?/);
    expect(source).toMatch(/BOUNDARY_TARGET_LABEL/);
  });

  it("offers excluded areas", () => {
    expect(source).toMatch(/Mark a fixed obstruction/);
  });

  it("offers the reference measurement", () => {
    expect(source).toMatch(/One real measurement \(m\)/);
    expect(source).toMatch(/Which edge did you measure\?/);
  });
});

describe("metric scale stays earned", () => {
  it("refuses metres without a safe reference", () => {
    const source = read(FILES.scale);
    expect(source).toMatch(/perspectiveSafe/);
    expect(source).toMatch(/SCALE_REFUSAL_COPY/);
  });

  it("never converts pixels to metres without a host reference", () => {
    expect(read(FILES.editor)).toMatch(/deriveScale\(/);
    expect(read(FILES.editor)).toMatch(/scale\.ok/);
  });

  it("labels boundary output as an estimate the host confirms", () => {
    const source = read(FILES.editor);
    expect(source).toMatch(/Estimate — you confirm/);
    expect(source).not.toMatch(/host_verified/);
  });

  it("never auto-verifies from a drawn boundary", () => {
    expect(read(FILES.hostScanner)).not.toMatch(/verification_state:\s*"host_verified"/);
  });
});

describe("the host is never trapped", () => {
  it("offers retake from the post-capture flow", () => {
    expect(read(FILES.flow)).toMatch(/Retake photo/);
    expect(read(FILES.flow)).toMatch(/setStage\("camera"\)/);
  });

  it("offers manual measurement entry on the authenticated host surface", () => {
    const source = read(FILES.hostScanner);
    expect(source).toMatch(/Enter measurements manually/);
    expect(source).toMatch(/function ManualMeasurements/);
  });

  it("offers manual measurement entry on the guest host surface", () => {
    expect(read(FILES.guestSpace)).toMatch(/Enter measurements m/i);
  });

  it("keeps the upload fallback on both host surfaces", () => {
    expect(read(FILES.hostScanner)).toMatch(/type="file"/);
    expect(read(FILES.guestShell)).toMatch(/type="file"/);
  });
});
