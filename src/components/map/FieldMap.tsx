"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { SEARCH_RADIUS_METERS } from "@/lib/config";
import type { LatLng } from "@/lib/types";
import { CurrentLocationMarker } from "./CurrentLocationMarker";
import { MapMarkerView, MichibiMapMarker } from "./MapMarkerView";
import type { MapViewProps } from "./types";

const M_PER_DEG_LAT = 111_320;

/**
 * Fallback "field-note" map used when no Maps browser key is configured
 * (and in mock mode). Projects points onto a dotted paper sheet.
 */
export default function FieldMap({
  origin,
  markers,
  selectedId,
  onSelect,
  bottomInset = 0,
  className = "",
  mascotAt = null,
  interactive = true,
  route = null,
  bubbles = true,
}: MapViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 360, h: 480 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const projection = useMemo(() => {
    const all: LatLng[] = [
      ...(origin ? [origin] : []),
      ...markers.map((m) => m.position),
      ...(route ?? []),
    ];
    // Only real points are used. With none there is nothing to project (see below).
    const center = origin ?? all[0];
    if (!center) return null;
    const mPerDegLng = M_PER_DEG_LAT * Math.cos((center.latitude * Math.PI) / 180);
    const toMeters = (p: LatLng) => ({
      x: (p.longitude - center.longitude) * mPerDegLng,
      y: (center.latitude - p.latitude) * M_PER_DEG_LAT,
    });
    const pts = all.map(toMeters);
    const extentX = Math.max(200, ...pts.map((p) => Math.abs(p.x)));
    const extentY = Math.max(200, ...pts.map((p) => Math.abs(p.y)));
    // Full maps leave room for the header overlay; the home preview is compact.
    const padTop = interactive ? 90 : 24;
    const padSide = interactive ? 104 : 40; // markers are ~170px wide, centred on the point
    const usableW = Math.max(100, size.w - padSide * 2);
    const usableH = Math.max(60, size.h - padTop - (interactive ? 50 : 24) - bottomInset);
    const scale = Math.min(usableW / (extentX * 2), usableH / (extentY * 2));
    const cx = size.w / 2;
    const cy = padTop + usableH / 2;
    return {
      scale,
      cx,
      cy,
      project: (p: LatLng) => {
        const m = toMeters(p);
        return { left: cx + m.x * scale, top: cy + m.y * scale };
      },
    };
  }, [origin, markers, size, bottomInset, interactive, route]);

  if (!projection) return <div ref={ref} className={`paper-grid ${className}`} />;
  const radiusPx = SEARCH_RADIUS_METERS * projection.scale;

  return (
    <div ref={ref} className={`paper-grid relative overflow-hidden ${className}`}>
      {/* A few hand-drawn "streets" so the sheet reads as a map. */}
      <svg className="absolute inset-0 h-full w-full" aria-hidden>
        <g stroke="rgb(71 85 105 / 0.1)" strokeWidth="10" strokeLinecap="round" fill="none">
          <path d={`M -20 ${projection.cy + 30} C ${size.w * 0.3} ${projection.cy - 10}, ${size.w * 0.6} ${projection.cy + 60}, ${size.w + 20} ${projection.cy + 20}`} />
          <path d={`M ${projection.cx - 40} -20 C ${projection.cx - 10} ${size.h * 0.3}, ${projection.cx - 70} ${size.h * 0.6}, ${projection.cx - 20} ${size.h + 20}`} />
        </g>
        <g stroke="rgb(71 85 105 / 0.06)" strokeWidth="5" strokeLinecap="round" fill="none">
          <path d={`M -20 ${projection.cy - 120} L ${size.w + 20} ${projection.cy - 160}`} />
          <path d={`M ${projection.cx + 110} -20 L ${projection.cx + 150} ${size.h + 20}`} />
          <path d={`M -20 ${projection.cy + 170} L ${size.w + 20} ${projection.cy + 200}`} />
        </g>
        {route && route.length > 1 && (
          <polyline
            points={route.map((p) => { const q = projection.project(p); return `${q.left},${q.top}`; }).join(" ")}
            fill="none"
            stroke="#22201c"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="6 7"
          />
        )}
        {origin && !route && (
          <circle
            cx={projection.cx}
            cy={projection.cy}
            r={radiusPx}
            fill="rgb(63 134 173 / 0.06)"
            stroke="rgb(34 32 28 / 0.3)"
            strokeWidth="1.5"
            strokeDasharray="6 7"
          />
        )}
      </svg>

      {origin && (
        <span
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={projection.project(origin)}
        >
          <CurrentLocationMarker />
        </span>
      )}

      {mascotAt && (
        <span
          className="absolute -translate-x-[140%] -translate-y-[70%]"
          style={{ ...projection.project(mascotAt), zIndex: 4 }}
        >
          <MichibiMapMarker />
        </span>
      )}

      {markers.map((m) => {
        const { left, top } = projection.project(m.position);
        return (
          <div
            key={m.id}
            className="absolute -translate-x-1/2 -translate-y-full"
            style={{ left, top, zIndex: m.id === selectedId ? 30 : 10 }}
          >
            <MapMarkerView marker={m} selected={m.id === selectedId} onClick={() => onSelect(m.id)} bubble={bubbles} />
          </div>
        );
      })}

    </div>
  );
}
