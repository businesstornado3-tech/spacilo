/**
 * Host space-suitability questions.
 *
 * These describe a domestic space honestly — they are not a safety
 * certification and they never claim a space is risk free. "Not sure" is
 * always an allowed answer, and it stays visible to renters.
 */
import type { SuitabilityAttributes } from "@/lib/policy/types";

export interface SuitabilityOption {
  value: string;
  label: string;
}

export interface SuitabilityQuestion {
  key: string;
  label: string;
  help: string;
  options: SuitabilityOption[];
}

const YES_NO_UNSURE: SuitabilityOption[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unknown", label: "Not sure" },
];

export const SUITABILITY_QUESTIONS: SuitabilityQuestion[] = [
  {
    key: "damp_risk",
    label: "How dry is the space?",
    help: "Damp affects paperwork, fabrics and electronics more than anything else.",
    options: [
      { value: "low", label: "Dry all year" },
      { value: "seasonal", label: "Occasionally damp" },
      { value: "high", label: "Often damp" },
      { value: "unknown", label: "Not sure" },
    ],
  },
  {
    key: "ventilation",
    label: "Is the space ventilated?",
    help: "Air flow through a vent, airbrick or window.",
    options: YES_NO_UNSURE,
  },
  {
    key: "temperature_stable",
    label: "Is the temperature fairly stable?",
    help: "Heated or insulated spaces stay steadier through winter.",
    options: YES_NO_UNSURE,
  },
  {
    key: "weatherproof",
    label: "Is it fully weatherproof?",
    help: "No leaks, and nothing gets wet in heavy rain.",
    options: YES_NO_UNSURE,
  },
  {
    key: "lockable",
    label: "Can the space be locked?",
    help: "A lock the renter's belongings sit behind.",
    options: YES_NO_UNSURE,
  },
  {
    key: "pest_risk",
    label: "Any known pest issues?",
    help: "Mice, insects or birds getting in.",
    options: [
      { value: "low", label: "None known" },
      { value: "high", label: "Yes, sometimes" },
      { value: "unknown", label: "Not sure" },
    ],
  },
  {
    key: "shared_access",
    label: "Do other people use this space?",
    help: "Household members, lodgers or neighbours.",
    options: YES_NO_UNSURE,
  },
  {
    key: "ground_floor_access",
    label: "Is it reachable without stairs?",
    help: "Matters for heavy or bulky items.",
    options: YES_NO_UNSURE,
  },
  {
    key: "smoking",
    label: "Is there smoking in or near the space?",
    help: "Smoke lingers in fabrics and soft furnishings.",
    options: YES_NO_UNSURE,
  },
  {
    key: "pets",
    label: "Do pets have access?",
    help: "Useful for renters with allergies or fabric items.",
    options: YES_NO_UNSURE,
  },
];

export const SUITABILITY_KEYS = SUITABILITY_QUESTIONS.map((q) => q.key);

export function emptySuitability(): SuitabilityAttributes {
  return Object.fromEntries(SUITABILITY_QUESTIONS.map((q) => [q.key, "unknown"]));
}

/** Only known keys survive, so a stale client can't widen the profile. */
export function sanitiseSuitability(input: SuitabilityAttributes): SuitabilityAttributes {
  const out: SuitabilityAttributes = {};
  for (const question of SUITABILITY_QUESTIONS) {
    const value = input[question.key];
    out[question.key] = question.options.some((o) => o.value === value) ? value! : "unknown";
  }
  return out;
}

export function suitabilityAnswerLabel(key: string, value: string | undefined): string {
  const question = SUITABILITY_QUESTIONS.find((q) => q.key === key);
  const option = question?.options.find((o) => o.value === value);
  return option?.label ?? "Not sure";
}

export function suitabilityQuestionLabel(key: string): string {
  return SUITABILITY_QUESTIONS.find((q) => q.key === key)?.label ?? key;
}

export function answeredCount(attributes: SuitabilityAttributes): number {
  return SUITABILITY_KEYS.filter((key) => (attributes[key] ?? "unknown") !== "unknown").length;
}
