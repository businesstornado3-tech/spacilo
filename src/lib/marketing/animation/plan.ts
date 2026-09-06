/**
 * Turns an existing campaign story into a fully specified animated scene plan.
 *
 * The story, hook, captions and calls to action all come from the Marketing
 * Intelligence that already exists — nothing here decides what to say. This
 * module decides only what moves, where, and for how long, and it does so
 * deterministically: the same story always produces the same plan.
 *
 * Pure module: no canvas, no network, no clock.
 */
import { brand } from "@/config/brand";
import { siteOrigin } from "@/lib/seo/meta";

import type { CampaignStory, PlatformAsset, StoryScene } from "../types";
import { elementsForText } from "./library";
import { applyBranding, brandRules } from "./platform-branding";
import {
  FRAME_SIZES,
  type AnimatedPlan,
  type AnimatedScene,
  type Motion,
  type SceneItem,
} from "./types";

const ENTRANCES: Motion[] = ["rise", "slide-left", "pop", "zoom", "slide-right", "bounce"];

/** Small, stable digest so an identical plan is recognisable across renders. */
export function planDigest(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function layout(count: number, index: number): { x: number; y: number; size: number } {
  if (count <= 1) return { x: 0.5, y: 0.44, size: 0.56 };
  if (count === 2) return { x: index === 0 ? 0.31 : 0.69, y: 0.44, size: 0.38 };
  const positions = [
    { x: 0.28, y: 0.36 },
    { x: 0.72, y: 0.36 },
    { x: 0.5, y: 0.62 },
  ];
  const spot = positions[index] ?? positions[0]!;
  return { x: spot.x, y: spot.y, size: 0.32 };
}

function sceneItems(scene: StoryScene): SceneItem[] {
  const ids = elementsForText(`${scene.visual} ${scene.caption}`);
  return ids.map((id, index) => ({
    element: id,
    ...layout(ids.length, index),
    motion: ENTRANCES[(scene.index + index) % ENTRANCES.length]!,
    delay: Math.min(0.18 * index, Math.max(0, scene.seconds - 0.4)),
  }));
}

/**
 * Builds the animated plan for one platform version of a campaign.
 *
 * Runtime is trimmed to the platform's limit rather than exceeding it, and the
 * branding is whatever that platform actually permits.
 */
export function buildAnimatedPlan(input: {
  campaignId: string;
  asset: PlatformAsset;
  story: CampaignStory;
  fps?: number;
}): AnimatedPlan {
  const { campaignId, asset, story } = input;
  const rules = brandRules(asset.platform);
  const fps = input.fps ?? 30;
  const frame = FRAME_SIZES[asset.aspect];

  const branding = applyBranding({
    platform: asset.platform,
    tagline: brand.tagline,
    website: siteOrigin().replace(/^https?:\/\//, ""),
    cta: asset.cta,
  });

  const budget = Math.min(asset.seconds, rules.maxSeconds);
  const storySeconds = story.scenes.reduce((total, scene) => total + scene.seconds, 0) || 1;
  const endCardSeconds = branding.showEndCard ? Math.min(2.5, budget * 0.22) : 0;
  const scale = (budget - endCardSeconds) / storySeconds;

  const scenes: AnimatedScene[] = story.scenes.map((scene, position) => ({
    index: position,
    seconds: Math.max(1, Number((scene.seconds * scale).toFixed(2))),
    background: position % 2 === 0 ? "canvas" : "surface",
    items: sceneItems(scene),
    caption: {
      text: position === 0 ? story.hook || scene.caption : scene.caption,
      motion: position === 0 ? "reveal" : "slide-up",
      emphasis: position === 0 ? "hook" : "body",
    },
    subCaption:
      position === story.scenes.length - 1
        ? { text: asset.cta, motion: "fade", emphasis: "cta" }
        : null,
    transition: position === 0 ? "cut" : "fade",
  }));

  if (branding.showEndCard) {
    scenes.push({
      index: scenes.length,
      seconds: Number(endCardSeconds.toFixed(2)),
      background: "primary",
      items: [],
      caption: { text: brand.name, motion: "zoom", emphasis: "brand" },
      subCaption: {
        text:
          branding.showWebsite && branding.website
            ? branding.website
            : (branding.tagline ?? asset.cta),
        motion: "fade",
        emphasis: "cta",
      },
      transition: "fade",
    });
  }

  const seconds = Number(scenes.reduce((total, scene) => total + scene.seconds, 0).toFixed(2));

  const plan: Omit<AnimatedPlan, "digest"> = {
    campaignId,
    assetId: asset.id,
    platform: asset.platform,
    aspect: asset.aspect,
    width: frame.width,
    height: frame.height,
    fps,
    seconds,
    scenes,
    branding,
  };

  return { ...plan, digest: planDigest(plan) };
}
