"use client";

/**
 * LiveMarker — marker pe hartă (pickup, dropoff, șofer live).
 * Emoji ca DivIcon: fără asset-uri externe, distinct vizual per rol.
 */
import { Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { useMemo } from "react";

export type LiveMarkerProps = {
  position: { lat: number; lng: number };
  kind?: "pickup" | "dropoff" | "driver";
  label?: string;
};

const EMOJI: Record<string, string> = {
  pickup: "🟢",
  dropoff: "🔴",
  driver: "🚕",
};

export default function LiveMarker({ position, kind = "pickup", label }: LiveMarkerProps) {
  const icon = useMemo(
    () =>
      L.divIcon({
        html: `<div style="font-size:26px;line-height:1;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))">${EMOJI[kind]}</div>`,
        className: "",
        iconSize: [26, 26],
        iconAnchor: [13, 24],
      }),
    [kind],
  );
  return (
    <Marker position={[position.lat, position.lng]} icon={icon}>
      {label ? <Popup>{label}</Popup> : null}
    </Marker>
  );
}
