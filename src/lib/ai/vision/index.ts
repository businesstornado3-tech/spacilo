/**
 * Spacilo Vision AI — Phase 6C public surface.
 *
 * Import from here, never from the individual stage files: the stages are
 * implementation detail and are expected to be replaced model by model.
 */
export * from "./types";
export * from "./backends";
export { localVisionBackend } from "./backend-local";
export {
  createRemoteVisionBackend,
  matchClassKey,
  normaliseRemoteDetections,
  normaliseRemoteScene,
  normaliseRemoteText,
  type RemoteVisionOptions,
  type RemoteVisionPayload,
  type RemoteVisionTransport,
} from "./backend-remote";
export { averageQuality, frameSignature, preprocessImage, preprocessImages } from "./preprocess";
export { segmentDetection, segmentDetections, type InstanceSighting } from "./segmentation";
export { fuseSightings, type FusedInstance, type FusionResult } from "./fusion";
export {
  buildInstance,
  estimateDimensions,
  estimateWeight,
  readClimate,
  readDamage,
  readFragility,
  readMaterial,
  readStacking,
  scoreInstance,
} from "./attributes";
export { buildSceneUnderstanding } from "./scene";
export { analyseVision, validateImages, VisionInputError, type VisionAnalysisRequest } from "./analyse";
export {
  toDetectedInventory,
  toDetectedObjects,
  toDetectedSpace,
  toSpaceScanResult,
} from "./adapters";
export { installVisionBackends, markVisionBackendsUninstalled } from "./install";
export {
  recordVisionRun,
  resetVisionMetrics,
  visionMetrics,
  type VisionMetricsSnapshot,
  type VisionRunMetric,
} from "./metrics";
export {
  clearVisionCorrections,
  correctionHotspots,
  listVisionCorrections,
  recordVisionCorrection,
} from "./feedback";
