/**
 * Open-weight video model selection and licence record.
 *
 * EarnRoom's default video generation runs on self-hosted open-weight models,
 * so the licence is a production governance matter, not a footnote. Every model
 * considered is recorded here with its verified licence position; only a model
 * whose commercial terms are unambiguous may be the production default.
 *
 * Pure module: no network, no clock, no vendor SDK.
 */

export type ModelLicence = {
  /** Licence name exactly as published. */
  name: string;
  url: string;
  /** ISO date on which the licence text was last read and recorded. */
  verifiedOn: string;
  commercialUse: "PERMITTED" | "RESTRICTED" | "UNCLEAR";
  /** Who owns the generated footage. */
  outputRights: string;
  redistribution: string;
  attribution: string;
  /** Revenue ceilings above which the licence changes, if any. */
  revenueThreshold: string | null;
  geographicRestrictions: string | null;
  acceptableUse: string;
  /** Set only when the terms are unambiguous for a UK commercial startup. */
  productionDefaultEligible: boolean;
  note: string;
};

export type VideoModelRecord = {
  id: string;
  name: string;
  family: string;
  version: string;
  parameters: string;
  licence: ModelLicence;
  capabilities: {
    textToVideo: boolean;
    imageToVideo: boolean;
    aspects: readonly ("9:16" | "16:9" | "1:1")[];
    maxSeconds: number;
    audio: boolean;
  };
  hardware: {
    /** Practical minimum for the quantised/offloaded configuration. */
    minVramGb: number;
    recommendedVramGb: number;
    headless: boolean;
    /** Rough wall-clock seconds to render one second of 720p on the recommended card. */
    secondsPerOutputSecond720p: number;
  };
  quality: "HIGH" | "GOOD" | "MODERATE";
  note: string;
};

const APACHE_2 = (url: string, verifiedOn: string): ModelLicence => ({
  name: "Apache License 2.0",
  url,
  verifiedOn,
  commercialUse: "PERMITTED",
  outputRights: "No claim is made over generated output; EarnRoom owns the footage it produces.",
  redistribution: "Permitted with the licence text and the NOTICE file retained.",
  attribution: "Retain copyright and licence notices in the worker image. No on-screen credit.",
  revenueThreshold: null,
  geographicRestrictions: null,
  acceptableUse: "No use-restriction clause beyond the standard Apache terms.",
  productionDefaultEligible: true,
  note: "Unambiguous for commercial use by a UK company, including marketing output.",
});

/**
 * Every model evaluated, with the reason it was or was not chosen. Kept in the
 * codebase so the decision can be audited later.
 */
export const EVALUATED_VIDEO_MODELS: readonly VideoModelRecord[] = [
  {
    id: "wan2.2-t2v-a14b",
    name: "Wan 2.2 (T2V-A14B / TI2V-5B)",
    family: "Wan",
    version: "2.2",
    parameters: "14B mixture-of-experts (A14B) or 5B hybrid (TI2V-5B)",
    licence: APACHE_2("https://github.com/Wan-Video/Wan2.2/blob/main/LICENSE.txt", "2026-09-06"),
    capabilities: {
      textToVideo: true,
      imageToVideo: true,
      aspects: ["9:16", "16:9", "1:1"],
      maxSeconds: 10,
      audio: false,
    },
    hardware: {
      minVramGb: 16,
      recommendedVramGb: 24,
      headless: true,
      secondsPerOutputSecond720p: 30,
    },
    quality: "HIGH",
    note: "Chosen: Apache-2.0 weights and code, strong motion quality, 5B variant runs on a single 24GB card, both aspect ratios, text-to-video and image-to-video, fully headless.",
  },
  {
    id: "ltx-video-13b",
    name: "LTX-Video 13B",
    family: "LTXV",
    version: "0.9.x / 2.x",
    parameters: "2B distilled and 13B",
    licence: {
      name: "LTXV Open Weights License",
      url: "https://huggingface.co/Lightricks/LTX-Video/blob/main/LTX-Video-Open-Weights-License-0.X.txt",
      verifiedOn: "2026-09-06",
      commercialUse: "RESTRICTED",
      outputRights: "Granted, subject to the licence's acceptable-use schedule.",
      redistribution: "Permitted with licence propagation and notice requirements.",
      attribution: "Required in distributed materials.",
      revenueThreshold:
        "Separate commercial terms apply above the publisher's stated revenue/user thresholds.",
      geographicRestrictions: null,
      acceptableUse: "Source-available licence with a binding use-restriction schedule.",
      productionDefaultEligible: false,
      note: "Very fast, but source-available rather than a standard open-source licence; thresholds and use restrictions make it unsuitable as EarnRoom's default. The inference code is Apache-2.0 — the weights are not.",
    },
    capabilities: {
      textToVideo: true,
      imageToVideo: true,
      aspects: ["9:16", "16:9", "1:1"],
      maxSeconds: 10,
      audio: false,
    },
    hardware: {
      minVramGb: 12,
      recommendedVramGb: 24,
      headless: true,
      secondsPerOutputSecond720p: 6,
    },
    quality: "GOOD",
    note: "Kept as an optional worker model a founder may select deliberately, never as the default.",
  },
  {
    id: "hunyuan-video",
    name: "HunyuanVideo",
    family: "Hunyuan",
    version: "1.x",
    parameters: "13B",
    licence: {
      name: "Tencent Hunyuan Community License",
      url: "https://github.com/Tencent-Hunyuan/HunyuanVideo/blob/main/LICENSE.txt",
      verifiedOn: "2026-09-06",
      commercialUse: "RESTRICTED",
      outputRights: "Granted subject to the community licence.",
      redistribution: "Permitted with notices.",
      attribution: "Required.",
      revenueThreshold: "Separate licence required above the stated monthly-user threshold.",
      geographicRestrictions:
        "Territory carve-outs that have historically excluded the EU, the UK and South Korea.",
      acceptableUse: "Binding use-restriction schedule.",
      productionDefaultEligible: false,
      note: "Excluded outright: territory restrictions make it inappropriate for a UK company.",
    },
    capabilities: {
      textToVideo: true,
      imageToVideo: true,
      aspects: ["9:16", "16:9"],
      maxSeconds: 5,
      audio: false,
    },
    hardware: {
      minVramGb: 45,
      recommendedVramGb: 80,
      headless: true,
      secondsPerOutputSecond720p: 60,
    },
    quality: "HIGH",
    note: "Rejected on licence and hardware grounds.",
  },
  {
    id: "cogvideox-5b",
    name: "CogVideoX-5B",
    family: "CogVideoX",
    version: "1.5",
    parameters: "5B",
    licence: {
      name: "CogVideoX License (5B)",
      url: "https://huggingface.co/THUDM/CogVideoX-5b/blob/main/LICENSE",
      verifiedOn: "2026-09-06",
      commercialUse: "RESTRICTED",
      outputRights: "Granted with conditions.",
      redistribution: "Conditional.",
      attribution: "Required.",
      revenueThreshold: null,
      geographicRestrictions: null,
      acceptableUse: "Use-restriction schedule attached.",
      productionDefaultEligible: false,
      note: "Modest quality at EarnRoom's target length; licence is not a standard open-source licence.",
    },
    capabilities: {
      textToVideo: true,
      imageToVideo: true,
      aspects: ["16:9"],
      maxSeconds: 6,
      audio: false,
    },
    hardware: {
      minVramGb: 12,
      recommendedVramGb: 24,
      headless: true,
      secondsPerOutputSecond720p: 25,
    },
    quality: "MODERATE",
    note: "Not selected.",
  },
];

/** The production default. Apache-2.0, so commercially unambiguous in the UK. */
export const SELECTED_VIDEO_MODEL_ID = "wan2.2-t2v-a14b";

export function videoModel(id: string): VideoModelRecord | null {
  return EVALUATED_VIDEO_MODELS.find((model) => model.id === id) ?? null;
}

export function selectedVideoModel(): VideoModelRecord {
  return videoModel(SELECTED_VIDEO_MODEL_ID)!;
}

/** A model may only be the production default when its licence is unambiguous. */
export function mayBeProductionDefault(id: string): boolean {
  return videoModel(id)?.licence.productionDefaultEligible === true;
}

export function licenceRecord(id: string): {
  model: string;
  version: string;
  licence: string;
  licenceUrl: string;
  verifiedOn: string;
  commercialUse: string;
} | null {
  const model = videoModel(id);
  if (!model) return null;
  return {
    model: model.name,
    version: model.version,
    licence: model.licence.name,
    licenceUrl: model.licence.url,
    verifiedOn: model.licence.verifiedOn,
    commercialUse: model.licence.commercialUse,
  };
}
