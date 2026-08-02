/**
 * GeminiVisionProvider — the first SpaceFit Vision provider.
 *
 * Gemini is reached through the Lovable AI Gateway, so the API credential
 * lives only in server-side environment configuration and is never sent to,
 * or readable by, the browser.
 *
 * All Gemini-specific concerns (endpoint, message shape, structured-output
 * request, error mapping) are confined to this file.
 */
import {
  VisionProviderError,
  type AnalyseRequest,
  type AnalyseResponse,
  type SpaceFitVisionProvider,
} from "@/lib/spacefit-vision/provider.server";
import {
  SPACEFIT_VISION_PROMPT_VERSION,
  SPACEFIT_VISION_SCHEMA_VERSION,
  VISION_JSON_SCHEMA,
  visionResultSchema,
} from "@/lib/spacefit-vision/schema";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.5-flash";
const TIMEOUT_MS = 90_000;

function systemPrompt(catalogueKeys: string[], categories: readonly string[]) {
  return [
    "You are analysing photographs uploaded by a person who wants to estimate the storage space required for their belongings, for a UK self-storage marketplace.",
    "",
    "IDENTIFY movable belongings that appear to be intended for storage: furniture, boxes, bags, appliances, electronics, bicycles, sports equipment, business stock, documents.",
    "",
    "ENVIRONMENT: do not treat the room, garage, fixed or wall-mounted shelving, racking already in use as a fixture, doors, garage doors, windows, walls, flooring, lighting, radiators, fitted furniture or workbenches forming part of the room as belongings, unless there is evidence they themselves are intended to be stored. Set inventory_intent to likely_environment for such objects, uncertain_inventory when a movable item (a freestanding bookshelf, cabinet or table) might be either, and likely_inventory for clear belongings. Still return environment objects — never silently omit them — just classify them.",
    "",
    "MULTIPLE VIEWS: when the same belongings appear in more than one photograph, treat the photographs as multiple views of the same scene and reconcile them into DISTINCT physical objects. Do NOT add object counts from each photograph together. If a bicycle appears in three photographs, that is one bicycle. Give detections you believe are the same belongings the same possible_duplicate_group and set duplicate_certainty to likely_same or possibly_same; use likely_different only when you are confident they are separate objects.",
    "",
    "REPEATED OBJECTS: for repeated similar objects such as cardboard boxes, crates, bags, chairs, tyres or stock cartons, return ONE consolidated detection estimating the number of distinct objects visible across the complete photo set, with minimum_plausible_quantity and maximum_plausible_quantity bounding your estimate.",
    "",
    "CONFIDENCE: object_confidence (what it is) and quantity_confidence (how many there are) are SEPARATE concepts. You may be highly confident that a group is cardboard boxes while being unsure of the count. Use high, medium or low. If overlapping, occlusion or repeated viewpoints make the exact quantity uncertain, use low or medium quantity_confidence. Set repeated_item_group true for homogeneous grouped objects.",
    "",
    "LABELS: use short, storage-relevant descriptions such as \"Adult bicycle\", \"Cardboard boxes — mixed sizes\", \"Large suitcase\", \"Armchair\", \"Plastic storage box\". Avoid colour, branding or decorative detail unless it is genuinely needed to tell two similar objects apart (for example \"Blue suitcase\" and \"Grey suitcase\").",
    "",
    "DO NOT infer precise dimensions from photographs. Never return exact length, width, height, weight, brand, model or material. The marketplace supplies typical sizes from its own catalogue.",
    "",
    "DO NOT identify people, faces, addresses, vehicle registrations, document contents or personal characteristics. Ignore them entirely, even if visible.",
    "",
    `CATEGORIES: use exactly one of ${categories.join(", ")}.`,
    `CATALOGUE: when a detection clearly matches one of these keys, return it as suggested_catalogue_key, otherwise return null: ${catalogueKeys.join(", ")}.`,
    "",
    "source_photo_indexes must list the zero-based indexes of the photos where you saw the object (photos are supplied in order).",
    "Set possible_restricted_item true only for clearly visible fuel containers, gas cylinders, chemical containers, weapon-like items or perishable food, with a matching restricted_reason.",
    "If you cannot confidently identify anything storage-relevant, return an empty detections array. Never invent objects.",
  ].join("\n");
}

export function createGeminiVisionProvider(): SpaceFitVisionProvider {
  const model = process.env["SPACEFIT_VISION_MODEL"]?.trim() || DEFAULT_MODEL;

  return {
    id: "gemini",
    model,
    async analyseInventoryPhotos(request: AnalyseRequest): Promise<AnalyseResponse> {
      const apiKey = process.env["LOVABLE_API_KEY"];
      if (!apiKey) throw new VisionProviderError("not_configured", "Vision credentials missing.");

      const content = [
        {
          type: "text",
          text: `Analyse these ${request.images.length} photograph(s) of belongings to be put into storage. They may show the same belongings more than once. Return structured detections only.`,
        },
        ...request.images.map((image) => ({
          type: "image_url",
          image_url: { url: `data:${image.mimeType};base64,${image.base64}` },
        })),
      ];

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      let response: Response;
      try {
        response = await fetch(GATEWAY_URL, {
          method: "POST",
          signal: controller.signal,
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: systemPrompt(request.catalogueKeys, request.categories) },
              { role: "user", content },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "spacefit_vision_detections",
                strict: true,
                schema: VISION_JSON_SCHEMA,
              },
            },
          }),
        });
      } catch (error) {
        throw new VisionProviderError(
          error instanceof Error && error.name === "AbortError"
            ? "provider_timeout"
            : "provider_unavailable",
          "Vision request failed.",
        );
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        if (response.status === 429) throw new VisionProviderError("rate_limited", "Rate limited.");
        if (response.status === 402) {
          throw new VisionProviderError("payment_required", "Quota exhausted.");
        }
        throw new VisionProviderError(
          "provider_unavailable",
          `Vision provider returned ${response.status}.`,
        );
      }

      let raw: unknown;
      try {
        const payload = (await response.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        raw = JSON.parse(stripFences(payload.choices?.[0]?.message?.content ?? ""));
      } catch {
        throw new VisionProviderError("malformed_response", "Vision response was not valid JSON.");
      }

      const parsed = visionResultSchema.safeParse(raw);
      if (!parsed.success) {
        throw new VisionProviderError("malformed_response", "Vision response failed validation.");
      }

      return {
        result: parsed.data,
        model,
        provider: "gemini",
        promptVersion: SPACEFIT_VISION_PROMPT_VERSION,
        schemaVersion: SPACEFIT_VISION_SCHEMA_VERSION,
      };
    },
  };
}

function stripFences(text: string) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
}
