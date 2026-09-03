/**
 * Founder console — real UK map of DECLARED LOCATION INTENT (internal only).
 *
 * Provider: Leaflet + OpenStreetMap tiles (already used by the marketplace
 * map, no API key, no client-side secret).
 *
 * PRIVACY: the only coordinates used here are the published approximate
 * centres of towns and cities that somebody explicitly named. No visitor
 * position, IP geolocation or GPS is used, stored or displayed, and nothing
 * individual-level is plotted — every bubble is an aggregate count.
 */
import * as React from "react";
import "leaflet/dist/leaflet.css";

import { cn } from "@/lib/utils";
import { SUPPLY_STATE_LABEL, type GeographyPlace } from "@/lib/admin/geography";

export interface DemandMapProps {
  places: GeographyPlace[];
  selectedSlug?: string | null;
  onSelectPlace?: (slug: string) => void;
  className?: string;
}

/** Marker band derived from real location-intent volume only. */
export function demandBand(events: number, maxEvents: number): "LOW" | "MEDIUM" | "HIGH" {
  if (maxEvents <= 0) return "LOW";
  const share = events / maxEvents;
  if (share >= 0.66) return "HIGH";
  if (share >= 0.33) return "MEDIUM";
  return "LOW";
}

/** Marker radius in pixels, proportional to real intent volume. */
export function markerRadius(events: number, maxEvents: number): number {
  if (maxEvents <= 0) return 8;
  return 8 + Math.sqrt(Math.max(0, events) / maxEvents) * 16;
}

const SCARCE_COLOUR = "#b45309";
const SUPPLIED_COLOUR = "#0f766e";

export default function DemandMap({
  places,
  selectedSlug = null,
  onSelectPlace,
  className,
}: DemandMapProps) {
  const holder = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<any>(null);
  const layerRef = React.useRef<any>(null);
  const markersRef = React.useRef<Record<string, any>>({});
  const leafletRef = React.useRef<any>(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !holder.current || mapRef.current) return;
      leafletRef.current = L;
      const map = L.map(holder.current, {
        center: [54.6, -3.2],
        zoom: 5,
        scrollWheelZoom: false,
        attributionControl: true,
      });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 16,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  React.useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!ready || !L || !map || !layer) return;

    layer.clearLayers();
    markersRef.current = {};

    const plotted = places.filter((place) => place.point !== null);
    const maxEvents = Math.max(1, ...plotted.map((place) => place.demandEvents));

    plotted.forEach((place) => {
      const scarce = place.supplyState === "NO_SUPPLY" || place.supplyState === "THIN_SUPPLY";
      const colour = scarce ? SCARCE_COLOUR : SUPPLIED_COLOUR;
      const marker = L.circleMarker([place.point!.lat, place.point!.lng], {
        radius: markerRadius(place.demandEvents, maxEvents),
        weight: 2,
        color: colour,
        fillColor: colour,
        fillOpacity: 0.45,
      })
        .bindTooltip(
          `${place.name} · ${place.demandEvents} location-intent signal${place.demandEvents === 1 ? "" : "s"}`,
        )
        .bindPopup(
          [
            `<strong>${place.name}</strong>`,
            `Location-intent signals: ${place.demandEvents}`,
            `Distinct visitor references: ${place.demandVisitors}`,
            `Published spaces: ${place.publishedSpaces}`,
            `Storage requests: ${place.storageRequests}`,
            `Bookings: ${place.bookings}`,
            `Supply state: ${SUPPLY_STATE_LABEL[place.supplyState]}`,
            `Opportunity score: ${Math.round(place.opportunityScore)}/100`,
            `Trend: ${place.trend}`,
            `Data status: DERIVED_FROM_PRODUCTION`,
          ].join("<br/>"),
        )
        .on("click", () => onSelectPlace?.(place.slug))
        .addTo(layer);
      markersRef.current[place.slug] = marker;
    });

    const points: [number, number][] = plotted.map((p) => [p.point!.lat, p.point!.lng]);
    if (points.length > 1) {
      map.fitBounds(L.latLngBounds(points).pad(0.35), { maxZoom: 9 });
    } else if (points.length === 1 && points[0]) {
      map.setView(points[0], 9);
    } else {
      map.setView([54.6, -3.2], 5);
    }
  }, [ready, places, onSelectPlace]);

  React.useEffect(() => {
    if (!ready) return;
    Object.entries(markersRef.current).forEach(([slug, marker]) => {
      const active = slug === selectedSlug;
      marker.setStyle({ fillOpacity: active ? 0.85 : 0.45, weight: active ? 3 : 2 });
      if (active) marker.bringToFront();
    });
  }, [ready, selectedSlug]);

  return (
    <div
      ref={holder}
      role="application"
      aria-label="Map of UK places people explicitly named in searches, discovery and location pages. Every place is also listed in the table below."
      className={cn("size-full min-h-[360px] rounded-2xl bg-muted", className)}
    />
  );
}
