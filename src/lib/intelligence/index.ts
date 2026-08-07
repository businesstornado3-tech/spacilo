/**
 * Spacilo Intelligence Platform — public entry point.
 *
 * Everything above this layer imports from here and nowhere deeper. That is
 * what makes the vendor swap a registration change rather than a refactor.
 *
 * Heavy engines stay behind the pipeline functions, which import their
 * providers directly; nothing here pulls a model or a large module into the
 * initial bundle.
 */
export * from "./contracts";
export * from "./confidence";
export * from "./errors";
export * from "./events";
export * from "./logging";
export * from "./health";
export * from "./providers";
export * from "./registry";
export * from "./pipeline";
export { explainRecommendation } from "./mock/recommendations";
export { resetLearning } from "./mock/learning";
