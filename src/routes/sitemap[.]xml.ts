/**
 * /sitemap.xml — dynamic sitemap of every indexable public page plus every
 * published listing that has a usable approximate location.
 *
 * Listings are read through the `get_published_spaces` security-definer RPC,
 * not through a direct table read: the `spaces` table is deliberately
 * fail-closed to anonymous callers, so a table read here silently returned an
 * empty listing set. The RPC is the same public projection the marketplace
 * itself uses, and it exposes only approximate location fields.
 *
 * A database failure degrades to the static routes rather than returning an
 * error to crawlers.
 */
import { createFileRoute } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { buildSitemapXml, type SitemapListing } from "@/lib/seo/sitemap";

/** Upper bound of the RPC itself; keeps the document a sane size. */
const MAX_LISTINGS = 200;

async function publishedListings(): Promise<SitemapListing[]> {
  try {
    const { data, error } = await supabase.rpc("get_published_spaces", {
      limit_count: MAX_LISTINGS,
    });
    if (error) return [];
    return (data ?? []).map((row) => ({
      id: row.id,
      // The public projection carries no row mtime, so no lastmod is claimed.
      updated_at: null,
      approximate_area: row.approximate_area,
      postcode_district: row.postcode_district,
    }));
  } catch {
    return [];
  }
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const xml = buildSitemapXml(await publishedListings());
        return new Response(xml, {
          status: 200,
          headers: {
            "content-type": "application/xml; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
