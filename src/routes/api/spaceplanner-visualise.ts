/**
 * Spacilo AI SpacePlanner™ — visualisation endpoint.
 *
 * Takes the user's OWN space photograph, photographs of their belongings and
 * the canonical placement manifest, and asks an image model to edit the space
 * photo so those exact belongings appear realistically placed inside it. The
 * space photograph is always the visual foundation: the model is instructed to
 * preserve the room, never to invent a new one.
 *
 * The returned image is then checked against the manifest, so the UI can say
 * honestly how many of the required items are actually represented. If the
 * model returns no image the route fails loudly rather than letting a
 * geometric overlay be presented as an AI visualisation.
 */
import { createFileRoute } from "@tanstack/react-router";

const MODEL = "google/gemini-3-pro-image";
const CHECK_MODEL = "google/gemini-3.6-flash";
const MAX_ITEM_PHOTOS = 3;
const GATEWAY = "https://ai.gateway.lovable.dev/v1";

interface ManifestItem {
  label?: string;
  quantity?: number;
}

interface VisualiseBody {
  spaceImage?: { mimeType?: string; base64?: string };
  itemImages?: { mimeType?: string; base64?: string }[];
  instruction?: string;
  manifest?: ManifestItem[];
  emphasise?: string[];
}

function dataUrl(image: { mimeType?: string; base64?: string }): string | null {
  if (!image?.base64) return null;
  const mime = image.mimeType && image.mimeType.startsWith("image/") ? image.mimeType : "image/jpeg";
  return `data:${mime};base64,${image.base64}`;
}

/** Pulls the first image out of the gateway's OpenAI-compatible response. */
export function extractImage(payload: unknown): string | null {
  const seen = new Set<unknown>();
  const walk = (node: unknown): string | null => {
    if (typeof node === "string") {
      if (node.startsWith("data:image/")) return node;
      if (/^https?:\/\//.test(node) && /\.(png|jpe?g|webp)/i.test(node)) return node;
      return null;
    }
    if (!node || typeof node !== "object" || seen.has(node)) return null;
    seen.add(node);
    const record = node as Record<string, unknown>;
    if (typeof record["b64_json"] === "string") {
      return `data:image/png;base64,${record["b64_json"] as string}`;
    }
    for (const value of Object.values(record)) {
      const found = walk(value);
      if (found) return found;
    }
    return null;
  };
  return walk(payload);
}

export interface Coverage {
  expected: number;
  present: number;
  missing: string[];
  complete: boolean;
}

/** Compares the labels a checker reported against the labels required. */
export function coverageOf(required: string[], present: string[]): Coverage {
  const seen = new Set(present.map((label) => label.trim().toLowerCase()));
  const missing = required.filter((label) => !seen.has(label.trim().toLowerCase()));
  return {
    expected: required.length,
    present: required.length - missing.length,
    missing,
    complete: missing.length === 0 && required.length > 0,
  };
}

/** Reads the checker's JSON reply. Tolerates fenced or noisy output. */
export function parsePresentLabels(text: string): string[] | null {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    return null;
  }
}

/** Asks a vision model which of the required items it can see. Best effort. */
async function checkCoverage(
  key: string,
  image: string,
  required: string[],
): Promise<Coverage | null> {
  if (required.length === 0) return null;
  try {
    const response = await fetch(`${GATEWAY}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: CHECK_MODEL,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Look at this photograph of a storage space. Which of the following items are visibly present in it? Items: ${required.join("; ")}. Reply with a JSON array of the item names you can see, exactly as written, and nothing else.`,
              },
              { type: "image_url", image_url: { url: image } },
            ],
          },
        ],
      }),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      choices?: { message?: { content?: unknown } }[];
    };
    const content = payload.choices?.[0]?.message?.content;
    const text = typeof content === "string" ? content : "";
    const present = parsePresentLabels(text);
    if (!present) return null;
    return coverageOf(required, present);
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/api/spaceplanner-visualise")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env["LOVABLE_API_KEY"];
        if (!key) {
          return Response.json({ error: "not_configured" }, { status: 503 });
        }

        let body: VisualiseBody;
        try {
          body = (await request.json()) as VisualiseBody;
        } catch {
          return Response.json({ error: "bad_request" }, { status: 400 });
        }

        const space = body.spaceImage ? dataUrl(body.spaceImage) : null;
        if (!space) {
          return Response.json({ error: "missing_space_photo" }, { status: 400 });
        }
        const items = (body.itemImages ?? [])
          .slice(0, MAX_ITEM_PHOTOS)
          .map(dataUrl)
          .filter((url): url is string => Boolean(url));

        const required = (body.manifest ?? [])
          .map((entry) => (typeof entry?.label === "string" ? entry.label.trim() : ""))
          .filter(Boolean)
          .slice(0, 20);
        const emphasise = (body.emphasise ?? [])
          .filter((label): label is string => typeof label === "string")
          .slice(0, 20);

        const content: Record<string, unknown>[] = [
          {
            type: "text",
            text: [
              "Edit the FIRST image, which is a real photograph of a room or storage space.",
              "Keep that photograph as the foundation: same walls, floor, doorway, camera angle, lighting and colour.",
              "Do not generate a new room and do not change the existing contents.",
              items.length
                ? "The following images show the user's real belongings. Place those exact items into the photographed space, matching their appearance, materials and colours."
                : "Place the described belongings into the photographed space.",
              body.instruction?.slice(0, 3000) ?? "",
              required.length
                ? `Every one of these items must be clearly visible in the edited photograph: ${required.join("; ")}.`
                : "",
              emphasise.length
                ? `The previous attempt did not show these items. They must be clearly visible this time: ${emphasise.join("; ")}.`
                : "",
              "Respect perspective and scale, rest every item flat on the floor with contact shadows, keep a clear walkway to the doorway, and avoid floating or clipped objects.",
              "Return only the edited photograph. No labels, no boxes, no outlines, no text overlays.",
            ]
              .filter(Boolean)
              .join(" "),
          },
          { type: "image_url", image_url: { url: space } },
          ...items.map((url) => ({ type: "image_url", image_url: { url } })),
        ];

        let upstream: Response;
        try {
          upstream = await fetch(`${GATEWAY}/images/generations`, {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: MODEL,
              messages: [{ role: "user", content }],
              modalities: ["image", "text"],
              stream: false,
            }),
          });
        } catch {
          return Response.json({ error: "upstream_unreachable" }, { status: 502 });
        }

        if (!upstream.ok) {
          const status = upstream.status === 429 || upstream.status === 402 ? upstream.status : 502;
          return Response.json({ error: `upstream_${upstream.status}` }, { status });
        }

        let payload: unknown;
        try {
          payload = await upstream.json();
        } catch {
          return Response.json({ error: "bad_upstream_payload" }, { status: 502 });
        }

        const image = extractImage(payload);
        if (!image) {
          return Response.json({ error: "no_image_returned" }, { status: 502 });
        }

        const coverage = await checkCoverage(key, image, required);
        return Response.json({ image, model: MODEL, coverage });
      },
    },
  },
});
