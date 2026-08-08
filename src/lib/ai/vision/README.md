# Spacilo Vision AI — production platform (Phase 6C)

Computer vision for storage: what someone owns, how big it is, how it must be
handled, and what a host's space can actually take.

Two rules hold everywhere, unchanged from earlier phases:

1. **Vision observes and proposes. People confirm.** Nothing here is a
   measurement, and nothing is presented as one.
2. **Every proposal carries a confidence and a reason.** A number with no
   explanation never reaches a screen.

## Pipeline

```text
validate → preprocess → detect → segment → OCR → fuse → attributes → score → scene
```

| Stage | File | What it does |
| --- | --- | --- |
| Validate | `analyse.ts` | File type, count and payload guards before anything is sent |
| Pre-process | `preprocess.ts` | Orientation, resize, lighting, contrast, noise, blur, border crop, compression, metadata stripping, duplicate detection |
| Detect | `backends.ts` + a backend | Objects with boxes, counts and optional masks |
| Segment | `segmentation.ts` | Group detections split into individual instances (Box 1, Box 2, …) |
| OCR | backend `readText` | Box labels, packaging text, room labels, codes |
| Fuse | `fusion.ts` | One inventory from many photos; repeat sightings merged |
| Attributes | `attributes.ts` | Dimensions, weight, material, fragility, stacking, climate, damage |
| Score | `attributes.ts` | Per-stage confidence, band, review flag, uncertainty statement |
| Scene | `scene.ts` | Walls, doors and swing, windows, shelving, walkways, lighting, spatial zones |

## Backends

A backend is the only component that talks to a model. `VisionBackend` is the
whole contract: `detect`, optional `readText`, optional `readScene`.

- `backend-local.ts` — deterministic, offline, always available. The final
  fallback so analysis always completes.
- `backend-remote.ts` — `createRemoteVisionBackend({ id, vendor, model, transport })`
  adapts any hosted model (OpenAI Vision, Gemini Vision, Azure AI Vision,
  Rekognition, self-hosted). The transport is injected by the AI layer that
  owns credentials; no key, endpoint or SDK appears in this folder.

Registration order is preference order. `analyseVision` tries the preferred
backend, then walks the fallback chain, and holds overall confidence lower when
a fallback was used.

Adding a vendor:

```ts
installVisionBackends([
  createRemoteVisionBackend({
    id: "vendor-vision",
    vendor: "vendor",
    model: "vision-1",
    available: () => Boolean(hasCredentials),
    transport: async (request) => callVendor(request),
  }),
]);
```

## Using it

```ts
import { aiServices } from "@/lib/ai";

const analysis = await aiServices.vision.analyseDetailed({
  images: photos.map((photo) => ({ photo, viewpoint: "front" })),
  scene: true,
});
```

Existing screens are unchanged: `spacilo-vision-pro` and `spacilo-scene-pro`
are registered ahead of the legacy engine for the `vision` and `space-analysis`
capabilities and return the same `DetectedInventory` / `DetectedSpace` shapes
via `adapters.ts`.

## Safety boundaries

- Damage is an **observation**, never a finding. Below `DAMAGE_ASSERT_THRESHOLD`
  it is phrased as a possibility and marked for review.
- Vision never decides legality, criminality or eligibility. Hazard prompts ask
  a human to check; policy rules decide and the server enforces.
- Counting is conservative: the number of real objects for a class is the most
  seen in any single frame, so extra angles never inflate an inventory.
- Poor frames cannot produce confident answers — detection confidence is scaled
  by frame quality before anything else runs.

## Privacy

Pre-processing strips image metadata before analysis. Corrections are stored as
anonymised class-level signals (`feedback.ts`): class, field, bucketed change,
prior confidence. No user id, listing id, photo URL or free text is retained.
Metrics (`metrics.ts`) count backends, latency, confidence, fallbacks and
corrections — never who uploaded what.

## Tests

`src/lib/ai/tests/phase6c.test.ts` covers validation, pre-processing
determinism, duplicate handling, instance segmentation, cross-angle fusion,
damage phrasing, scene zones, backend fallback, vendor payload normalisation
and correction anonymity.
