/**
 * /sitemap.xml — dynamic sitemap of every indexable public page plus every
 * published listing that has a usable approximate location.
 *
 * Only already-public data is read, and a database failure degrades to the
 * static routes rather than returning an error to crawlers.
 */
import { createFileRoute } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { buildSitemapXml, type SitemapListing } from "@/lib/seo/sitemap";

async function publishedListings(): Promise<SitemapListing[]> {
  try {
    const { data, error } = await supabase
      .from("spaces")
      .select("id, updated_at, approximate_area, postcode_district")
      .eq("listing_status", "published")
      .order("updated_at", { ascending: false })
      .limit(5000);
    if (error) return [];
    return (data ?? []) as SitemapListing[];
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
