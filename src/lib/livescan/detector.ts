/**
 * Local detector loading.
 *
 * The live model runs ENTIRELY in the browser. Preview frames are never sent to
 * Gemini, to Lovable AI Gateway, or to our own server — the only image that
 * ever leaves the device is the one the person deliberately captures, and that
 * goes through the existing secure post-capture pipeline.
 *
 * The model (COCO-SSD lite MobileNet v2, Apache-2.0) is dynamically imported so
 * nothing is downloaded until someone explicitly starts a live scan.
 */
import type { LiveDetector, RawDetection } from "@/lib/livescan/types";

export type DetectorLoader = () => Promise<LiveDetector>;

export class LiveModelLoadError extends Error {
  readonly code = "live_model_load_failed" as const;
}

let cached: Promise<LiveDetector> | null = null;

/** The real loader. Split into its own chunk by the dynamic imports below. */
export const cocoSsdLoader: DetectorLoader = async () => {
  const [tf, backend, cocoSsd] = await Promise.all([
    import("@tensorflow/tfjs-core"),
    import("@tensorflow/tfjs-backend-webgl"),
    import("@tensorflow-models/coco-ssd"),
  ]);
  void backend;
  await tf.ready();

  const model = await cocoSsd.load({ base: "lite_mobilenet_v2" });

  return {
    async detect(source, maxResults = 12): Promise<RawDetection[]> {
      const predictions = await model.detect(source as never, maxResults);
      return predictions.map((prediction) => ({
        class: prediction.class,
        score: prediction.score,
        bbox: [
          prediction.bbox[0],
          prediction.bbox[1],
          prediction.bbox[2],
          prediction.bbox[3],
        ] as RawDetection["bbox"],
      }));
    },
    dispose() {
      // Frees the model's GPU/WASM tensors so repeated scans don't accumulate.
      (model as unknown as { dispose?: () => void }).dispose?.();
    },
  } satisfies LiveDetector;
};

/**
 * Loads the detector once per page. A failure is never fatal: callers fall back
 * to the existing photo workflow.
 */
export async function loadLiveDetector(loader: DetectorLoader = cocoSsdLoader) {
  if (!cached) {
    cached = loader().catch((error) => {
      cached = null;
      throw new LiveModelLoadError(error instanceof Error ? error.message : "load failed");
    });
  }
  return cached;
}

/** Test/teardown hook — forgets the cached model. */
export function resetLiveDetectorCache(): void {
  cached = null;
}
