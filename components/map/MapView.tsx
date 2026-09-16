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
import { Plus, Minus, Navigation } from "lucide-react";
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
  /** Callback pentru butonul „Locația mea”. */
  onLocate?: () => void;
  /** Afișează controalele moderne de zoom/locate (implicit: true). */
  showControls?: boolean;
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
        { padding: [56, 56], maxZoom: 16 },
      );
    } else if (flyTo) {
      map.flyTo([flyTo.lat, flyTo.lng], Math.max(map.getZoom(), 15), { duration: 1.2 });
    }
  }, [map, flyTo, fitBounds]);
  return null;
}

function ModernMapControls({ onLocate }: { onLocate?: () => void }) {
  const map = useMap();
  return (
    <div className="absolute right-4 top-20 z-[400] flex flex-col gap-2.5 pointer-events-auto">
      <div className="flex flex-col overflow-hidden rounded-2xl bg-white/95 backdrop-blur-md shadow-xl border border-black/5 ring-1 ring-black/5">
        <button
          type="button"
          aria-label="Apropie harta"
          onClick={() => map.zoomIn()}
          className="flex h-11 w-11 items-center justify-center text-neutral-800 hover:bg-neutral-100 active:bg-neutral-200 border-b border-black/5 transition"
        >
          <Plus size={18} />
        </button>
        <button
          type="button"
          aria-label="Depărtează harta"
          onClick={() => map.zoomOut()}
          className="flex h-11 w-11 items-center justify-center text-neutral-800 hover:bg-neutral-100 active:bg-neutral-200 transition"
        >
          <Minus size={18} />
        </button>
      </div>

      {onLocate && (
        <button
          type="button"
          aria-label="Locația mea"
          onClick={onLocate}
          className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/95 backdrop-blur-md shadow-xl border border-black/5 ring-1 ring-black/5 text-neutral-800 hover:bg-neutral-100 active:scale-95 transition"
        >
          <Navigation size={18} className="text-amber-500 fill-amber-500" />
        </button>
      )}
    </div>
  );
}

export default function MapView({
  center,
  zoom = 14,
  className,
  children,
  flyTo,
  fitBounds,
  onMapClick,
  onLocate,
  showControls = true,
}: MapViewProps) {
  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={zoom}
      className={className ?? "h-full w-full"}
      zoomControl={false}
      attributionControl={false}
    >
      {/* CartoDB Voyager — design ultra-curat stil Apple Maps / Uber / Bolt, fără elemente redundante */}
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
        maxZoom={20}
      />
      <MapController flyTo={flyTo} fitBounds={fitBounds} />
      {onMapClick && <ClickCapture onMapClick={onMapClick} />}
      {showControls && <ModernMapControls onLocate={onLocate} />}
      {children}
    </MapContainer>
  );
}
