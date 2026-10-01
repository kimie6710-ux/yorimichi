"use client";

import { APIProvider, Map, useMap } from "@vis.gl/react-google-maps";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { publicConfig, MAP_LIMIT, MAP_MIN_ZOOM } from "@/lib/config";
import type { LatLng } from "@/lib/types";
import { CurrentLocationMarker } from "./CurrentLocationMarker";
import { MapMarkerView, MichibiMapMarker } from "./MapMarkerView";
import type { MapViewProps } from "./types";

const toGoogle = (p: LatLng) => ({ lat: p.latitude, lng: p.longitude });

/** Report where the person dragged the map to. */
function ReportMoves({ onMoved }: { onMoved: (c: LatLng) => void }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const l = map.addListener("dragend", () => {
      const c = map.getCenter();
      if (c) onMoved({ latitude: c.lat(), longitude: c.lng() });
    });
    return () => l.remove();
  }, [map, onMoved]);
  return null;
}

/** Fly back to the person when asked. */
function GoHome({ origin, home }: { origin: LatLng | null; home: number }) {
  const map = useMap();
  useEffect(() => {
    if (map && origin && home > 0) {
      map.panTo(toGoogle(origin));
      map.setZoom(16);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when asked
  }, [map, home]);
  return null;
}

function FitBounds({ origin, markers, bottomInset = 0 }: Pick<MapViewProps, "origin" | "markers" | "bottomInset">) {
  const map = useMap();
  const key = useMemo(
    // Origin rounded to ~100m so live GPS updates don't keep re-fitting the map.
    () => markers.map((m) => m.id).join("|") + (origin ? `${origin.latitude.toFixed(3)},${origin.longitude.toFixed(3)}` : ""),
    [markers, origin],
  );
  useEffect(() => {
    if (!map || typeof google === "undefined") return;
    const points = [...markers.map((m) => m.position), ...(origin ? [origin] : [])];
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setCenter(toGoogle(points[0]));
      map.setZoom(16);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    points.forEach((p) => bounds.extend(toGoogle(p)));
    map.fitBounds(bounds, { top: 96, left: 48, right: 48, bottom: 48 + bottomInset });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refit only when the set of points changes
  }, [map, key, bottomInset]);
  return null;
}

/** Round off sharp little zigzags (Chaikin), keeping the ends where they are. */
function smooth(pts: google.maps.Point[], rounds = 2): google.maps.Point[] {
  let out = pts;
  for (let r = 0; r < rounds; r++) {
    if (out.length < 3) break;
    const next = [out[0]];
    for (let i = 0; i < out.length - 1; i++) {
      const a = out[i];
      const b = out[i + 1];
      next.push(new google.maps.Point(a.x * 0.75 + b.x * 0.25, a.y * 0.75 + b.y * 0.25));
      next.push(new google.maps.Point(a.x * 0.25 + b.x * 0.75, a.y * 0.25 + b.y * 0.75));
    }
    next.push(out[out.length - 1]);
    out = next;
  }
  return out;
}

/**
 * The walking route, drawn as SVG on its own layer (map tiles are toned down
 * with a CSS filter; a route on the map canvas would be greyed out too).
 * A walking route like map apps draw it: a soft band with a row of dots,
 * in よりみち's sky blue on paper white.
 */
function RouteLine({ route }: { route: LatLng[] }) {
  const map = useMap();
  useEffect(() => {
    if (!map || typeof google === "undefined" || route.length < 2) return;
    const NS = "http://www.w3.org/2000/svg";
    const PAD = 16;

    class RouteOverlay extends google.maps.OverlayView {
      private svg = document.createElementNS(NS, "svg");
      private band = document.createElementNS(NS, "path");
      private dots = document.createElementNS(NS, "path");

      constructor() {
        super();
        this.svg.style.position = "absolute";
        this.svg.style.overflow = "visible";
        this.svg.style.pointerEvents = "none";
        const style = (p: SVGPathElement, attrs: Record<string, string>) => {
          for (const [k, v] of Object.entries({ fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round", ...attrs })) p.setAttribute(k, v);
          this.svg.appendChild(p);
        };
        style(this.band, { stroke: "#fffefb", "stroke-width": "14", "stroke-opacity": "0.95" });
        style(this.dots, { stroke: "#3f86ad", "stroke-width": "8", "stroke-dasharray": "0 13" });
      }

      onAdd() {
        this.getPanes()?.overlayLayer.appendChild(this.svg);
      }

      draw() {
        const proj = this.getProjection();
        if (!proj) return;
        const raw = route.map((p) => proj.fromLatLngToDivPixel(toGoogle(p))).filter((p): p is google.maps.Point => !!p);
        if (raw.length < 2) return;
        const pts = smooth(raw);
        const minX = Math.min(...pts.map((p) => p.x)) - PAD;
        const minY = Math.min(...pts.map((p) => p.y)) - PAD;
        const maxX = Math.max(...pts.map((p) => p.x)) + PAD;
        const maxY = Math.max(...pts.map((p) => p.y)) + PAD;
        this.svg.style.left = `${minX}px`;
        this.svg.style.top = `${minY}px`;
        this.svg.setAttribute("width", String(maxX - minX));
        this.svg.setAttribute("height", String(maxY - minY));
        const d = pts.map((p, i) => `${i ? "L" : "M"}${(p.x - minX).toFixed(1)} ${(p.y - minY).toFixed(1)}`).join(" ");
        this.band.setAttribute("d", d);
        this.dots.setAttribute("d", d);
      }

      onRemove() {
        this.svg.remove();
      }
    }

    const overlay = new RouteOverlay();
    overlay.setMap(map);
    return () => overlay.setMap(null);
  }, [map, route]);
  return null;
}

/** Keep the person in view while they walk (navigation); pause when they pan, resume on recenter. */
function FollowOrigin({ origin, recenter = 0, onPanAway }: { origin: LatLng | null; recenter?: number; onPanAway?: () => void }) {
  const map = useMap();
  const zoomed = useRef(false);
  const paused = useRef(false);
  useEffect(() => {
    if (!map) return;
    const l = map.addListener("dragstart", () => {
      paused.current = true;
      onPanAway?.();
    });
    return () => l.remove();
  }, [map, onPanAway]);
  useEffect(() => {
    paused.current = false;
  }, [recenter]);
  useEffect(() => {
    if (!map || !origin || paused.current) return;
    if (!zoomed.current) {
      map.setZoom(18); // walking scale: street corners and shop fronts
      zoomed.current = true;
    }
    map.panTo(toGoogle(origin));
    // Like a map app: you sit low on the screen, with more of the way ahead in view.
    const h = map.getDiv().clientHeight;
    map.panBy(0, -Math.round(h * 0.15));
  }, [map, origin, recenter]);
  return null;
}

function PanToSelected({ markers, selectedId }: Pick<MapViewProps, "markers" | "selectedId">) {
  const map = useMap();
  useEffect(() => {
    const m = markers.find((x) => x.id === selectedId);
    if (map && m) map.panTo(toGoogle(m.position));
  }, [map, markers, selectedId]);
  return null;
}

/**
 * Base-map style: no shop / facility / station names (they would spoil the
 * surprise), muted pastel colours, roads kept for orientation.
 */
const MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#f1ead9" }] },
  // Buildings a shade darker than the ground, so streets read as streets.
  { featureType: "landscape.man_made", elementType: "geometry", stylers: [{ color: "#e8dfc9" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8a8272" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#fbf8f0" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ visibility: "on" }, { color: "#e4ecd6" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  // Railway lines (no names) help you place yourself around a station.
  { featureType: "transit.line", elementType: "geometry", stylers: [{ visibility: "on" }, { color: "#d6ccb6" }] },
  { featureType: "administrative.land_parcel", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#fffdf8" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#d4c8ad" }] },
  { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#efe7d4" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#d3e8f2" }] },
];

/**
 * Our own DOM marker on the map (OverlayView). Used instead of AdvancedMarker
 * so the base map can be styled without a cloud Map ID.
 */
function HtmlMarker({
  position,
  zIndex = 1,
  anchor = "bottom",
  offset = [0, 0],
  children,
}: {
  position: LatLng;
  zIndex?: number;
  anchor?: "bottom" | "center";
  offset?: [number, number];
  children: ReactNode;
}) {
  const map = useMap();
  const [container] = useState(() => (typeof document === "undefined" ? null : document.createElement("div")));
  // Kept in refs so a moving marker (the walking bird) only redraws, never re-creates the overlay.
  const pos = useRef(position);
  const overlayRef = useRef<google.maps.OverlayView | null>(null);
  useEffect(() => {
    if (!map || !container || typeof google === "undefined") return;
    class Overlay extends google.maps.OverlayView {
      onAdd() {
        google.maps.OverlayView.preventMapHitsAndGesturesFrom(container!);
        this.getPanes()?.overlayMouseTarget.appendChild(container!);
      }
      draw() {
        const p = this.getProjection()?.fromLatLngToDivPixel(new google.maps.LatLng(pos.current.latitude, pos.current.longitude));
        if (!p) return;
        container!.style.position = "absolute";
        container!.style.left = `${p.x + offset[0]}px`;
        container!.style.top = `${p.y + offset[1]}px`;
        container!.style.transform = anchor === "bottom" ? "translate(-50%, -100%)" : "translate(-50%, -50%)";
        container!.style.zIndex = String(zIndex);
      }
      onRemove() {
        container!.remove();
      }
    }
    const overlay = new Overlay();
    overlayRef.current = overlay;
    overlay.setMap(map);
    return () => {
      overlay.setMap(null);
      overlayRef.current = null;
    };
  }, [map, container, zIndex, anchor, offset]);
  useEffect(() => {
    pos.current = position;
    overlayRef.current?.draw();
  }, [position]);
  return container ? createPortal(children, container) : null;
}

/** Stand a little away (right, below) from the spot marker so it stays easy to tap. */
const MASCOT_OFFSET: [number, number] = [66, 34];

/**
 * Google Maps as the quiet background layer with YORIMICHI's own markers on top.
 * Initialised only with a real center (the user's location or real markers).
 */
export default function GoogleSpotMap({
  origin,
  markers,
  selectedId,
  onSelect,
  bottomInset,
  className = "",
  interactive = true,
  mascotAt = null,
  mascot,
  route = null,
  bubbles = true,
  follow = false,
  recenter,
  onPanAway,
  originMarker,
  onMoved,
  fitMarkersOnly = false,
  home,
  onLoadError,
}: MapViewProps & { onLoadError: () => void }) {
  const center = origin ?? markers[0]?.position;
  if (!center) return <div className={`paper-grid ${className}`} />;

  return (
    <APIProvider apiKey={publicConfig.mapsApiKey} language="ja" region="JP" onError={onLoadError}>
      <Map
        className={className}
        styles={MAP_STYLES}
        defaultCenter={toGoogle(center)}
        defaultZoom={16}
        gestureHandling={interactive ? "greedy" : "none"}
        keyboardShortcuts={interactive}
        disableDefaultUI
        clickableIcons={false}
        restriction={{ latLngBounds: MAP_LIMIT, strictBounds: true }}
        minZoom={MAP_MIN_ZOOM}
      >
        {interactive && !follow && <FitBounds origin={fitMarkersOnly ? null : origin} markers={markers} bottomInset={bottomInset} />}
        {onMoved && <ReportMoves onMoved={onMoved} />}
        {home !== undefined && <GoHome origin={origin} home={home} />}
        {follow && <FollowOrigin origin={origin} recenter={recenter} onPanAway={onPanAway} />}
        {interactive && !follow && <PanToSelected markers={markers} selectedId={selectedId} />}
        {route && <RouteLine route={route} />}

        {origin && (
          <HtmlMarker position={origin} zIndex={5} anchor="center">
            {originMarker ?? <CurrentLocationMarker />}
          </HtmlMarker>
        )}

        {mascotAt && (
          <HtmlMarker position={mascotAt} zIndex={40} offset={MASCOT_OFFSET}>
            {mascot ?? <MichibiMapMarker />}
          </HtmlMarker>
        )}

        {markers.map((m) => (
          <HtmlMarker key={m.id} position={m.position} zIndex={m.id === selectedId ? 30 : 10}>
            <MapMarkerView marker={m} selected={m.id === selectedId} onClick={() => onSelect(m.id)} bubble={bubbles} />
          </HtmlMarker>
        ))}
      </Map>
    </APIProvider>
  );
}
