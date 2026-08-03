/**
 * Provider-neutral map boundary.
 *
 * Everything map-specific lives in this file. The rest of the app only uses
 * the normalised props below, so swapping Leaflet/OSM for another provider is
 * a single-file change.
 *
 * Current provider: Leaflet + OpenStreetMap tiles (no API key, no secrets).
 *
 * PRIVACY: this component is only ever given APPROXIMATE coordinates produced
 * server-side by the database trigger. Exact host coordinates never reach it.
 */
import * as React from "react";
import "leaflet/dist/leaflet.css";

import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/format";

export interface MapSpace {
  id: string;
  title: string;
  /** Approximate latitude — never the host's exact position. */
  lat: number;
  lng: number;
  pricePence: number | null;
}

export interface StorageMapProps {
  spaces: MapSpace[];
  selectedSpaceId?: string | null;
  onSelectSpace?: (spaceId: string) => void;
  searchCentre?: { lat: number; lng: number } | null;
  radiusMiles?: number;
  className?: string;
}

const MILES_TO_METRES = 1609.344;

export default function StorageMap({
  spaces,
  selectedSpaceId = null,
  onSelectSpace,
  searchCentre = null,
  radiusMiles = 5,
  className,
}: StorageMapProps) {
  const holder = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<any>(null);
  const layerRef = React.useRef<any>(null);
  const markersRef = React.useRef<Record<string, any>>({});
  const [ready, setReady] = React.useState(false);
  const leafletRef = React.useRef<any>(null);

  // Create the map once, after hydration.
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !holder.current || mapRef.current) return;
      leafletRef.current = L;
      const map = L.map(holder.current, {
        center: [searchCentre?.lat ?? 50.7989, searchCentre?.lng ?? -1.0912],
        zoom: 12,
        scrollWheelZoom: false,
        attributionControl: true,
      });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Draw markers whenever the result set or centre changes.
  React.useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!ready || !L || !map || !layer) return;

    layer.clearLayers();
    markersRef.current = {};

    if (searchCentre) {
      L.circle([searchCentre.lat, searchCentre.lng], {
        radius: radiusMiles * MILES_TO_METRES,
        color: "#0f766e",
        weight: 1,
        fillColor: "#0f766e",
        fillOpacity: 0.05,
      }).addTo(layer);
      L.circleMarker([searchCentre.lat, searchCentre.lng], {
        radius: 6,
        color: "#0f766e",
        weight: 2,
        fillColor: "#ffffff",
        fillOpacity: 1,
      })
        .bindTooltip("Your search location")
        .addTo(layer);
    }

    spaces.forEach((space) => {
      const marker = L.circleMarker([space.lat, space.lng], {
        radius: 11,
        weight: 2,
        color: "#0f766e",
        fillColor: "#0f766e",
        fillOpacity: 0.55,
      })
        .bindTooltip(
          `${space.title}${space.pricePence ? ` · ${formatPrice(space.pricePence)}/month` : ""} (approximate area)`,
        )
        .on("click", () => onSelectSpace?.(space.id))
        .addTo(layer);
      markersRef.current[space.id] = marker;
    });

    const points: [number, number][] = spaces.map((s) => [s.lat, s.lng]);
    if (searchCentre) points.push([searchCentre.lat, searchCentre.lng]);
    if (points.length > 1) {
      map.fitBounds(L.latLngBounds(points).pad(0.25), { maxZoom: 15 });
    } else if (points.length === 1 && points[0]) {
      map.setView(points[0], 13);
    }
  }, [ready, spaces, searchCentre, radiusMiles, onSelectSpace]);

  // Highlight the selected marker.
  React.useEffect(() => {
    if (!ready) return;
    Object.entries(markersRef.current).forEach(([id, marker]) => {
      const active = id === selectedSpaceId;
      marker.setStyle({
        radius: active ? 15 : 11,
        fillOpacity: active ? 0.9 : 0.55,
        color: active ? "#0b3b38" : "#0f766e",
      });
      if (active) marker.bringToFront();
    });
  }, [ready, selectedSpaceId]);

  return (
    <div
      ref={holder}
      role="application"
      aria-label="Map of approximate storage locations. All results are also listed as text."
      className={cn("size-full min-h-[320px] rounded-2xl bg-muted", className)}
    />
  );
}
