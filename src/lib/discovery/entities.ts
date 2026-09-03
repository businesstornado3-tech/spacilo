/**
 * Entity and answer surfaces.
 *
 * AI search systems quote short, self-contained, factual statements. These
 * builders produce exactly that — every sentence traceable to something the
 * product genuinely does. No superlatives, no guarantees, no invented data.
 */
import { brand } from "@/config/brand";
import { capability, type CapabilityId } from "./capabilities";
import type { IntentCluster } from "./clusters";

export type AnswerBlock = {
  /** The question, in the words a person would use. */
  question: string;
  /** A complete, quotable answer in one or two sentences. */
  answer: string;
};

/** A capability's definitional answer — what it is, for whom, and its limits. */
export function capabilityAnswer(id: CapabilityId): AnswerBlock {
  const cap = capability(id);
  return {
    question: `What is ${cap.name}?`,
    answer: `${cap.name} is a ${brand.name} tool that ${cap.purpose.charAt(0).toLowerCase()}${cap.purpose.slice(1)} ${cap.limits}`,
  };
}

/** Definitional answers for every capability behind a cluster. */
export function clusterAnswers(cluster: IntentCluster): AnswerBlock[] {
  const blocks: AnswerBlock[] = [
    { question: cluster.question, answer: cluster.description },
    capabilityAnswer(cluster.primary),
  ];
  for (const entry of cluster.faq ?? []) {
    blocks.push({ question: entry.question, answer: entry.answer });
  }
  return blocks;
}

/**
 * Plain-language definition of the marketplace itself. Stated as fact, with
 * the boundaries of what EarnRoom does and does not promise.
 */
export function marketplaceDefinition(): AnswerBlock {
  return {
    question: `What is ${brand.name}?`,
    answer: `${brand.name} is a UK peer-to-peer storage marketplace where people rent unused garages, lofts, sheds and spare rooms to others who need storage. Space is provided by individual hosts, prices are set by those hosts, and availability depends on what has been published nearby.`,
  };
}

/** SoftwareApplication-style description of a capability, for structured data. */
export function capabilityEntity(id: CapabilityId) {
  const cap = capability(id);
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: cap.name,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Web",
    description: cap.purpose,
    provider: { "@type": "Organization", name: brand.name },
  };
}

/** HowTo-style structured data built only from a cluster's real sections. */
export function clusterHowTo(cluster: IntentCluster) {
  if (!cluster.sections?.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: cluster.title,
    description: cluster.description,
    step: cluster.sections.map((section, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: section.heading,
      text: section.body,
    })),
  };
}
