/**
 * Spacilo AI SpacePlanner™ — visualisation endpoint.
 *
 * Takes the user's OWN space photograph plus photographs of their belongings
 * and asks an image model to edit the space photo so the belongings appear
 * realistically placed inside it. The space photograph is always the visual
 * foundation: the model is instructed to preserve the room, never to invent a
 * new one.
 *
 * This is genuine image-to-image editing. If the model returns no image the
 * route fails loudly so the UI can say visualisation is unavailable rather
 * than presenting a geometric overlay as an AI visualisation.
 */
import { createFileRoute } from "@tanstack/react-router";

const MODEL = "google/gemini-3-pro-image";
const MAX_ITEM_PHOTOS = 3;

interface VisualiseBody {
  spaceImage?: { mimeType?: string; base64?: string };
  itemImages?: { mimeType?: string; base64?: string }[];
  instruction?: string;
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
              body.instruction?.slice(0, 1200) ?? "",
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
          upstream = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
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

        return Response.json({ image, model: MODEL });
      },
    },
  },
});
