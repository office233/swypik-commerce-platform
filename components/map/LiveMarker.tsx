"use client";

/**
 * LiveMarker — marker pe hartă (pickup, dropoff, șofer live, mașini din apropiere).
 * HTML/SVG modern stil Uber / Bolt cu animație de puls și badge-uri lizibile.
 */
import { Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { useMemo } from "react";

export type LiveMarkerProps = {
  position: { lat: number; lng: number };
  kind?: "pickup" | "dropoff" | "driver" | "nearby";
  label?: string;
  heading?: number;
  eta?: string;
};

function renderMarkerHtml(kind: "pickup" | "dropoff" | "driver" | "nearby", label?: string, heading = 0, eta?: string): string {
  if (kind === "pickup") {
    const cleanLabel = label ? (label.length > 28 ? label.slice(0, 26) + "…" : label) : "Punct de preluare";
    return `
      <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);pointer-events:none;">
        <div style="margin-bottom:5px;background:rgba(13,13,13,0.92);backdrop-filter:blur(8px);color:white;padding:3px 10px;border-radius:9999px;font-size:11px;font-weight:800;letter-spacing:-0.2px;box-shadow:0 4px 14px rgba(0,0,0,0.25);display:flex;align-items:center;gap:5px;white-space:nowrap;border:1px solid rgba(255,255,255,0.15);">
          <span style="width:7px;height:7px;border-radius:50%;background:#10B981;box-shadow:0 0 8px #10B981;"></span>
          <span>${cleanLabel}</span>
        </div>
        <div style="position:relative;width:24px;height:24px;display:flex;align-items:center;justify-content:center;">
          <div style="position:absolute;width:34px;height:34px;border-radius:50%;background:rgba(16,185,129,0.3);animation:pulse 1.8s infinite;"></div>
          <div style="width:18px;height:18px;border-radius:50%;background:#10B981;border:3px solid #ffffff;box-shadow:0 3px 8px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;">
            <div style="width:4px;height:4px;border-radius:50%;background:#ffffff;"></div>
          </div>
        </div>
        <div style="width:2px;height:4px;background:#10B981;"></div>
      </div>
    `;
  }

  if (kind === "dropoff") {
    const cleanLabel = label ? (label.length > 28 ? label.slice(0, 26) + "…" : label) : "Destinație";
    return `
      <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);pointer-events:none;">
        <div style="margin-bottom:5px;background:#E11D48;color:white;padding:3px 10px;border-radius:9999px;font-size:11px;font-weight:800;letter-spacing:-0.2px;box-shadow:0 4px 14px rgba(225,29,72,0.35);display:flex;align-items:center;gap:4px;white-space:nowrap;border:1px solid rgba(255,255,255,0.25);">
          <span>🏁</span>
          <span>${cleanLabel}</span>
        </div>
        <div style="position:relative;width:24px;height:24px;display:flex;align-items:center;justify-content:center;">
          <div style="position:absolute;width:34px;height:34px;border-radius:50%;background:rgba(225,29,72,0.25);"></div>
          <div style="width:20px;height:20px;border-radius:50%;background:#0F172A;border:3px solid #ffffff;box-shadow:0 3px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;">
            <div style="width:6px;height:6px;border-radius:2px;background:#E11D48;"></div>
          </div>
        </div>
        <div style="width:2px;height:4px;background:#0F172A;"></div>
      </div>
    `;
  }

  // Șofer live sau mașină din apropiere (top-down 3D vehicle)
  const isNearby = kind === "nearby";
  const carSize = isNearby ? 32 : 36;
  const etaBadge = eta
    ? `<div style="position:absolute;top:-18px;left:50%;transform:translateX(-50%);background:white;color:#0D0D0D;padding:1px 6px;border-radius:8px;font-size:9px;font-weight:900;box-shadow:0 2px 6px rgba(0,0,0,0.25);border:1px solid #E5E5E5;white-space:nowrap;">${eta}</div>`
    : "";

  return `
    <div style="position:relative;width:${carSize}px;height:${carSize}px;display:flex;align-items:center;justify-content:center;">
      ${etaBadge}
      <div style="transform:rotate(${heading}deg);transition:transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);filter:drop-shadow(0 4px 6px rgba(0,0,0,0.35));">
        <svg width="${carSize}" height="${carSize}" viewBox="0 0 36 36" fill="none">
          <!-- Car chassis shadow & body -->
          <rect x="10" y="4" width="16" height="28" rx="6" fill="#18181B" stroke="#3F3F46" stroke-width="1.2"/>
          <!-- Windshields -->
          <path d="M12 11H24L22 7H14L12 11Z" fill="#38BDF8" fill-opacity="0.9"/>
          <path d="M12 21H24L23 25H13L12 21Z" fill="#38BDF8" fill-opacity="0.9"/>
          <!-- Roof / Sunroof -->
          <rect x="12" y="12" width="12" height="8" rx="2" fill="#09090B"/>
          <!-- Side mirrors -->
          <rect x="7.5" y="10" width="3" height="2" rx="1" fill="#27272A"/>
          <rect x="25.5" y="10" width="3" height="2" rx="1" fill="#27272A"/>
          <!-- Headlights -->
          <circle cx="12" cy="5" r="1.5" fill="#FDE047"/>
          <circle cx="24" cy="5" r="1.5" fill="#FDE047"/>
          <!-- Taillights -->
          <rect x="12" y="30.5" width="3.5" height="1.2" rx="0.5" fill="#EF4444"/>
          <rect x="20.5" y="30.5" width="3.5" height="1.2" rx="0.5" fill="#EF4444"/>
          ${!isNearby ? '<circle cx="18" cy="16" r="2.5" fill="#F59E0B"/>' : ""}
        </svg>
      </div>
    </div>
  `;
}

export default function LiveMarker({
  position,
  kind = "pickup",
  label,
  heading = 0,
  eta,
}: LiveMarkerProps) {
  const icon = useMemo(
    () =>
      L.divIcon({
        html: renderMarkerHtml(kind, label, heading, eta),
        className: "custom-leaflet-marker",
        iconSize: [36, 36],
        iconAnchor: kind === "pickup" || kind === "dropoff" ? [18, 36] : [18, 18],
      }),
    [kind, label, heading, eta],
  );

  return (
    <Marker position={[position.lat, position.lng]} icon={icon}>
      {label ? <Popup className="custom-popup">{label}</Popup> : null}
    </Marker>
  );
}
