/**
 * Browser Local worker capability.
 *
 * The £0 in-browser animation route stays exactly as it is; this module only
 * decides how honestly to describe the browser before a generation starts.
 *
 * A browser cannot reliably report graphics memory, so none is ever claimed.
 */
export type BrowserProbe = {
  browser: string;
  webgpu: boolean;
  /** Adapter name only where the browser chooses to expose it. */
  gpuAdapter: string | null;
  /** navigator.deviceMemory, in GB, when exposed. Approximate by design. */
  approximateMemoryGb: number | null;
  hardwareConcurrency: number | null;
  /** Codecs the page can actually encode with. */
  codecs: readonly string[];
  webCodecs: boolean;
  offscreenCanvas: boolean;
  workers: boolean;
};

export type BrowserCapability = {
  status: "SUPPORTED" | "LIMITED" | "UNSUPPORTED";
  summary: string;
  reasons: readonly string[];
  probe: BrowserProbe;
  /** Never asserted: a browser cannot report dedicated graphics memory. */
  vramClaim: null;
};

/** Deterministic classification of a probe. */
export function browserCapability(probe: BrowserProbe): BrowserCapability {
  const reasons: string[] = [];
  if (!probe.webCodecs) reasons.push("This browser cannot encode video in the page.");
  if (!probe.offscreenCanvas) reasons.push("This browser cannot draw frames in the background.");
  if (probe.codecs.length === 0) reasons.push("No supported video format was found.");
  if (!probe.workers) reasons.push("Background processing is unavailable.");

  if (reasons.length > 0) {
    return {
      status: "UNSUPPORTED",
      summary: "Video cannot be made in this browser.",
      reasons,
      probe,
      vramClaim: null,
    };
  }

  const soft: string[] = [];
  if (!probe.webgpu) soft.push("Graphics acceleration is unavailable, so only animated video can be made here.");
  if (probe.approximateMemoryGb !== null && probe.approximateMemoryGb < 4) {
    soft.push("This device reports little memory, so keep videos short.");
  }
  if (probe.hardwareConcurrency !== null && probe.hardwareConcurrency < 4) {
    soft.push("Few processor cores are available, so rendering will be slow.");
  }

  return soft.length > 0
    ? {
        status: "LIMITED",
        summary: "Animated video can be made here; film generation cannot.",
        reasons: soft,
        probe,
        vramClaim: null,
      }
    : {
        status: "SUPPORTED",
        summary: "Animated video can be made in this browser at no cost.",
        reasons: [],
        probe,
        vramClaim: null,
      };
}

const CANDIDATE_CODECS = [
  "video/mp4; codecs=avc1.42001f",
  "video/mp4; codecs=avc1.4d002a",
  "video/webm; codecs=vp9",
];

function browserName(userAgent: string): string {
  if (/Edg\//.test(userAgent)) return "Edge";
  if (/OPR\//.test(userAgent)) return "Opera";
  if (/Chrome\//.test(userAgent)) return "Chrome";
  if (/Firefox\//.test(userAgent)) return "Firefox";
  if (/Safari\//.test(userAgent)) return "Safari";
  return "This browser";
}

/**
 * Reads the live browser. Call from an effect only — it touches `navigator`.
 */
export async function probeBrowser(): Promise<BrowserProbe> {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    gpu?: { requestAdapter: () => Promise<{ info?: { description?: string } } | null> };
  };
  let gpuAdapter: string | null = null;
  let webgpu = false;
  try {
    const adapter = nav.gpu ? await nav.gpu.requestAdapter() : null;
    webgpu = Boolean(adapter);
    gpuAdapter = adapter?.info?.description ?? null;
  } catch {
    webgpu = false;
  }

  const supportsCodec = (codec: string): boolean => {
    const media = window as unknown as { MediaRecorder?: { isTypeSupported?: (type: string) => boolean } };
    try {
      return media.MediaRecorder?.isTypeSupported?.(codec) ?? false;
    } catch {
      return false;
    }
  };

  return {
    browser: browserName(nav.userAgent),
    webgpu,
    gpuAdapter,
    approximateMemoryGb: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
    hardwareConcurrency:
      typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : null,
    codecs: CANDIDATE_CODECS.filter(supportsCodec),
    webCodecs: typeof (window as { VideoEncoder?: unknown }).VideoEncoder !== "undefined",
    offscreenCanvas: typeof (window as { OffscreenCanvas?: unknown }).OffscreenCanvas !== "undefined",
    workers: typeof Worker !== "undefined",
  };
}
