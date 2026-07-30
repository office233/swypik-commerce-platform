"use client";

/**
 * MapView — hartă Leaflet + OpenStreetMap.
 *
 * ALEGERE LIBRĂRIE: react-leaflet + OSM, NU Google Maps, pentru că:
 *  1. în package.json nu exista nicio librărie de hartă;
 *  2. nu există NEXT_PUBLIC_GOOGLE_MAPS_API_KEY nicăieri în cod/env —
 *     serverul folosește GOOGLE_MAPS_API_KEY doar OPȚIONAL pentru Directions,
 *     cu fallback haversine; deci UI-ul nu poate presupune o cheie de client;
 *  3. OSM = zero cost, zero cheie, funcționează imediat în PWA.
 *
 * IMPORTANT: importă componenta DOAR prin `next/dynamic` cu `ssr: false`
 * (Leaflet atinge `window` la import).
 */
import { useEffect } from "react";
import { MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix icon-uri default Leaflet în bundler (altfel marker-ele apar sparte).
// @ts-expect-error _getIconUrl e privat
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export type MapViewProps = {
  center: { lat: number; lng: number };
  zoom?: number;
  className?: string;
  children?: React.ReactNode;
  /** Când se schimbă, harta face flyTo. */
  flyTo?: { lat: number; lng: number } | null;
  /** Când e setat, harta încadrează toate punctele. */
  fitBounds?: { lat: number; lng: number }[] | null;
  /** Click pe hartă — folosit pentru ajustarea pinului de livrare. */
  onMapClick?: (p: { lat: number; lng: number }) => void;
};

function ClickCapture({ onMapClick }: { onMapClick: (p: { lat: number; lng: number }) => void }) {
  useMapEvents({
    click(e) {
      onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

function MapController({ flyTo, fitBounds }: Pick<MapViewProps, "flyTo" | "fitBounds">) {
  const map = useMap();
  useEffect(() => {
    if (fitBounds && fitBounds.length >= 2) {
      map.fitBounds(
        L.latLngBounds(fitBounds.map((p) => [p.lat, p.lng] as [number, number])),
        { padding: [48, 48] },
      );
    } else if (flyTo) {
      map.flyTo([flyTo.lat, flyTo.lng], Math.max(map.getZoom(), 14));
    }
  }, [map, flyTo, fitBounds]);
  return null;
}

export default function MapView({
  center,
  zoom = 13,
  className,
  children,
  flyTo,
  fitBounds,
  onMapClick,
}: MapViewProps) {
  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={zoom}
      className={className ?? "h-full w-full"}
      zoomControl={false}
      attributionControl={false}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <MapController flyTo={flyTo} fitBounds={fitBounds} />
      {onMapClick && <ClickCapture onMapClick={onMapClick} />}
      {children}
    </MapContainer>
  );
}
