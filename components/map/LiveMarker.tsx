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
    const cleanLabel = label ? (label.length > 26 ? label.slice(0, 24) + "…" : label) : "Punct de preluare";
    return `
      <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);pointer-events:none;user-select:none;">
        <!-- Floating Pill Banner -->
        <div style="margin-bottom:6px;background:rgba(15,23,42,0.96);backdrop-filter:blur(12px);color:white;padding:5px 12px;border-radius:14px;font-size:11px;font-weight:900;letter-spacing:-0.2px;box-shadow:0 8px 24px rgba(0,0,0,0.35);display:flex;align-items:center;gap:6px;white-space:nowrap;border:1px solid rgba(255,255,255,0.18);">
          <span style="width:8px;height:8px;border-radius:50%;background:#10B981;box-shadow:0 0 10px #10B981;display:inline-block;"></span>
          <span style="color:#FFFFFF;font-weight:900;">Urcă aici</span>
          <span style="color:#94A3B8;font-weight:600;font-size:10px;">• ${cleanLabel}</span>
        </div>
        <!-- Pulsing Multi-Ring Radar Target -->
        <div style="position:relative;width:36px;height:36px;display:flex;align-items:center;justify-content:center;">
          <div style="position:absolute;width:48px;height:48px;border-radius:50%;background:rgba(16,185,129,0.25);border:1.5px solid rgba(16,185,129,0.7);animation:uber-radar-expand 2.2s infinite ease-out;"></div>
          <div style="position:absolute;width:32px;height:32px;border-radius:50%;background:rgba(16,185,129,0.15);"></div>
          <div style="width:20px;height:20px;border-radius:50%;background:#09090B;border:3px solid #10B981;box-shadow:0 4px 14px rgba(16,185,129,0.6);display:flex;align-items:center;justify-content:center;">
            <div style="width:6px;height:6px;border-radius:50%;background:#10B981;"></div>
          </div>
        </div>
        <div style="width:2px;height:6px;background:#10B981;box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>
      </div>
    `;
  }

  if (kind === "dropoff") {
    const cleanLabel = label ? (label.length > 26 ? label.slice(0, 24) + "…" : label) : "Destinație";
    return `
      <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);pointer-events:none;user-select:none;">
        <!-- Floating Dropoff Pill -->
        <div style="margin-bottom:6px;background:rgba(225,29,72,0.96);backdrop-filter:blur(12px);color:white;padding:5px 12px;border-radius:14px;font-size:11px;font-weight:900;letter-spacing:-0.2px;box-shadow:0 8px 24px rgba(225,29,72,0.4);display:flex;align-items:center;gap:6px;white-space:nowrap;border:1px solid rgba(255,255,255,0.25);">
          <span>🏁</span>
          <span style="font-weight:900;">Destinație</span>
          <span style="color:rgba(255,255,255,0.8);font-weight:600;font-size:10px;">• ${cleanLabel}</span>
        </div>
        <!-- Concentric Target Pin -->
        <div style="position:relative;width:36px;height:36px;display:flex;align-items:center;justify-content:center;">
          <div style="position:absolute;width:48px;height:48px;border-radius:50%;background:rgba(225,29,72,0.2);border:1.5px solid rgba(225,29,72,0.6);animation:uber-radar-expand 2.2s infinite ease-out;"></div>
          <div style="width:22px;height:22px;border-radius:50%;background:#09090B;border:3px solid #E11D48;box-shadow:0 4px 14px rgba(225,29,72,0.5);display:flex;align-items:center;justify-content:center;">
            <div style="width:7px;height:7px;border-radius:2px;background:#E11D48;"></div>
          </div>
        </div>
        <div style="width:2px;height:6px;background:#E11D48;box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>
      </div>
    `;
  }

  // Șofer live sau mașină din apropiere — Model 3D Top-Down stil Uber Black & Bolt Electric
  const isNearby = kind === "nearby";
  const carSize = isNearby ? 38 : 42;
  const etaBadge = eta
    ? `<div style="position:absolute;top:-22px;left:50%;transform:translateX(-50%);background:rgba(15,23,42,0.95);backdrop-filter:blur(8px);color:#F8FAFC;padding:2px 8px;border-radius:10px;font-size:9.5px;font-weight:900;letter-spacing:-0.2px;box-shadow:0 4px 12px rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.18);white-space:nowrap;display:flex;align-items:center;gap:4px;">
        <span style="color:#10B981;font-size:10px;">⚡</span><span>${eta}</span>
      </div>`
    : "";

  return `
    <div style="position:relative;width:${carSize}px;height:${carSize}px;display:flex;align-items:center;justify-content:center;user-select:none;">
      ${etaBadge}
      <div style="transform:rotate(${heading}deg);transition:transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);filter:drop-shadow(0 6px 10px rgba(0,0,0,0.4));">
        <svg width="${carSize}" height="${carSize}" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <!-- Con de lumină faruri (Headlight forward beam) -->
            <linearGradient id="headlightBeam-${heading}" x1="22" y1="6" x2="22" y2="-16" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#FEF08A" stop-opacity="0.45"/>
              <stop offset="100%" stop-color="#FEF08A" stop-opacity="0"/>
            </linearGradient>
            <!-- Corp metalic mașină -->
            <linearGradient id="carBody" x1="12" y1="4" x2="32" y2="38" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#27272A"/>
              <stop offset="50%" stop-color="#18181B"/>
              <stop offset="100%" stop-color="#09090B"/>
            </linearGradient>
            <!-- Reflexie parbriz sticlă -->
            <linearGradient id="windshieldGlass" x1="14" y1="10" x2="30" y2="16" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#38BDF8" stop-opacity="0.95"/>
              <stop offset="100%" stop-color="#0284C7" stop-opacity="0.8"/>
            </linearGradient>
          </defs>

          <!-- Conuri de lumină proiectate pe asfalt -->
          <polygon points="14,6 4,-14 20,-14 17,6" fill="url(#headlightBeam-${heading})" style="animation:car-light-glow 3s infinite ease-in-out;"/>
          <polygon points="27,6 24,-14 40,-14 30,6" fill="url(#headlightBeam-${heading})" style="animation:car-light-glow 3s infinite ease-in-out;"/>

          <!-- Umbră contur roți exterioare -->
          <rect x="9" y="8" width="3" height="6" rx="1.5" fill="#000000"/>
          <rect x="32" y="8" width="3" height="6" rx="1.5" fill="#000000"/>
          <rect x="9" y="28" width="3" height="6" rx="1.5" fill="#000000"/>
          <rect x="32" y="28" width="3" height="6" rx="1.5" fill="#000000"/>

          <!-- Șasiu mașină (Chassis aerodynamic) -->
          <rect x="11" y="4" width="22" height="34" rx="7.5" fill="url(#carBody)" stroke="#3F3F46" stroke-width="1.2"/>
          
          <!-- Capotă cu striații aerodinamice -->
          <path d="M15 5H29" stroke="#52525B" stroke-width="0.8" stroke-linecap="round"/>

          <!-- Parbriz față -->
          <path d="M14 12H30L28 7.5H16L14 12Z" fill="url(#windshieldGlass)"/>

          <!-- Plafon caroserie (Panoramic Roof) -->
          <rect x="13.5" y="13" width="17" height="11" rx="2.5" fill="#09090B" stroke="#27272A" stroke-width="0.6"/>

          <!-- Lunetă spate -->
          <path d="M14 25H30L28.5 29.5H15.5L14 25Z" fill="url(#windshieldGlass)"/>

          <!-- Oglinzi laterale -->
          <rect x="7.5" y="11.5" width="4" height="2" rx="1" fill="#3F3F46"/>
          <rect x="32.5" y="11.5" width="4" height="2" rx="1" fill="#3F3F46"/>

          <!-- Faruri LED Xenon -->
          <circle cx="14" cy="5" r="1.8" fill="#FEF08A"/>
          <circle cx="30" cy="5" r="1.8" fill="#FEF08A"/>

          <!-- Stopuri spate Neon Red -->
          <rect x="13" y="36.8" width="4.5" height="1.4" rx="0.7" fill="#EF4444"/>
          <rect x="26.5" y="36.8" width="4.5" height="1.4" rx="0.7" fill="#EF4444"/>

          <!-- Indicator Categorie (Bolt Green Neon Dot / Uber Gold) -->
          <circle cx="22" cy="18.5" r="2.8" fill="${isNearby ? "#10B981" : "#F59E0B"}" stroke="#FFFFFF" stroke-width="0.8"/>
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
