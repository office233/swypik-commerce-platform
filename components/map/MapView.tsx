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
import { useEffect, useState } from "react";
import { MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { Plus, Minus, Navigation, Moon, Sun, Compass } from "lucide-react";
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
  /** Mod de afișare hartă: light (curat stil Uber/Bolt) sau dark (Uber Black nocturn) */
  initialTheme?: "light" | "dark";
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
        { padding: [60, 60], maxZoom: 16 },
      );
    } else if (flyTo) {
      map.flyTo([flyTo.lat, flyTo.lng], Math.max(map.getZoom(), 15), { duration: 1.2 });
    }
  }, [map, flyTo, fitBounds]);
  return null;
}

function ModernMapControls({
  onLocate,
  isDark,
  onToggleTheme,
}: {
  onLocate?: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
}) {
  const map = useMap();
  return (
    <div className="absolute right-4 top-20 z-[400] flex flex-col gap-2.5 pointer-events-auto select-none">
      {/* Zoom in/out */}
      <div className="flex flex-col overflow-hidden rounded-2xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md shadow-xl border border-black/10 dark:border-white/10">
        <button
          type="button"
          aria-label="Apropie harta"
          onClick={() => map.zoomIn()}
          className="flex h-11 w-11 items-center justify-center text-neutral-800 dark:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-zinc-800 active:bg-neutral-200 border-b border-black/5 dark:border-white/5 transition"
        >
          <Plus size={18} />
        </button>
        <button
          type="button"
          aria-label="Depărtează harta"
          onClick={() => map.zoomOut()}
          className="flex h-11 w-11 items-center justify-center text-neutral-800 dark:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-zinc-800 active:bg-neutral-200 transition"
        >
          <Minus size={18} />
        </button>
      </div>

      {/* Comutare mod Noapte / Zi (Uber Black Night Map) */}
      <button
        type="button"
        aria-label={isDark ? "Comută la modul Zi" : "Comută la modul Noapte"}
        onClick={onToggleTheme}
        className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md shadow-xl border border-black/10 dark:border-white/10 text-neutral-800 dark:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-zinc-800 active:scale-95 transition"
      >
        {isDark ? <Sun size={17} className="text-amber-400" /> : <Moon size={17} className="text-indigo-600" />}
      </button>

      {/* Resetare orientare Nord */}
      <button
        type="button"
        aria-label="Resetează orientarea spre Nord"
        onClick={() => map.setView(map.getCenter(), map.getZoom())}
        className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md shadow-xl border border-black/10 dark:border-white/10 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-zinc-800 active:scale-95 transition"
      >
        <Compass size={18} className="text-rose-500" />
      </button>

      {/* Re-centrare pe locația curentă */}
      {onLocate && (
        <button
          type="button"
          aria-label="Locația mea"
          onClick={onLocate}
          className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md shadow-xl border border-black/10 dark:border-white/10 text-neutral-800 hover:bg-neutral-100 dark:hover:bg-zinc-800 active:scale-95 transition"
        >
          <Navigation size={18} className="text-emerald-500 fill-emerald-500" />
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
  initialTheme = "light",
}: MapViewProps) {
  const [isDark, setIsDark] = useState(initialTheme === "dark");

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Stiluri CSS avansate pentru randarea stil Uber / Bolt Luxury */}
      <style jsx global>{`
        /* Calibrare cromatică stil Uber/Bolt: drumuri curate, clădiri estompate, spații verzi calme */
        .uber-tiles-light .leaflet-tile-pane {
          filter: contrast(104%) brightness(101%) saturate(70%) sepia(3%);
        }
        /* Uber Black Luxury Night Mode: drumuri iluminate, fond obsidian */
        .uber-tiles-dark .leaflet-tile-pane {
          filter: invert(100%) hue-rotate(180deg) brightness(90%) contrast(115%) saturate(55%);
        }
        .leaflet-container {
          background-color: ${isDark ? "#121214" : "#F4F4F5"} !important;
          font-family: inherit;
        }
        @keyframes uber-radar-expand {
          0% {
            transform: scale(0.6);
            opacity: 0.85;
          }
          50% {
            opacity: 0.45;
          }
          100% {
            transform: scale(2.4);
            opacity: 0;
          }
        }
        @keyframes car-light-glow {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 0.95; }
        }
      `}</style>

      <MapContainer
        center={[center.lat, center.lng]}
        zoom={zoom}
        className={`${className ?? "h-full w-full"} ${isDark ? "uber-tiles-dark" : "uber-tiles-light"}`}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png"
          subdomains="abc"
          maxZoom={19}
        />
        <MapController flyTo={flyTo} fitBounds={fitBounds} />
        {onMapClick && <ClickCapture onMapClick={onMapClick} />}
        {showControls && (
          <ModernMapControls
            onLocate={onLocate}
            isDark={isDark}
            onToggleTheme={() => setIsDark((d) => !d)}
          />
        )}
        {children}
      </MapContainer>
    </div>
  );
}
