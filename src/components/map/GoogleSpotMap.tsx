"use client";

import { APIProvider, Map, useMap } from "@vis.gl/react-google-maps";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { publicConfig } from "@/lib/config";
import type { LatLng } from "@/lib/types";
import { CurrentLocationMarker } from "./CurrentLocationMarker";
import { MapMarkerView, MichibiMapMarker } from "./MapMarkerView";
import type { MapViewProps } from "./types";

const toGoogle = (p: LatLng) => ({ lat: p.latitude, lng: p.longitude });

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

function RouteLine({ route }: { route: LatLng[] }) {
  const map = useMap();
  useEffect(() => {
    if (!map || typeof google === "undefined" || route.length < 2) return;
    const path = route.map(toGoogle);
    // Paper casing + ink dashes: a path drawn with a pen on the map.
    const casing = new google.maps.Polyline({ path, map, strokeColor: "#fffefb", strokeOpacity: 1, strokeWeight: 8, zIndex: 1 });
    const line = new google.maps.Polyline({
      path,
      map,
      strokeOpacity: 0,
      zIndex: 2,
      icons: [
        {
          icon: { path: "M 0,-1 0,1", strokeColor: "#22201c", strokeOpacity: 1, strokeWeight: 3.2, scale: 3 },
          offset: "0",
          repeat: "11px",
        },
      ],
    });
    return () => {
      casing.setMap(null);
      line.setMap(null);
    };
  }, [map, route]);
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
  { elementType: "geometry", stylers: [{ color: "#f6f1e4" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8a8272" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#fbf8f0" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ visibility: "on" }, { color: "#e4ecd6" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.land_parcel", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#fffdf7" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#e2d9c4" }] },
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
 * Google Maps as the quiet background layer with YORUMICHI's own markers on top.
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
      >
        {interactive && <FitBounds origin={origin} markers={markers} bottomInset={bottomInset} />}
        {interactive && <PanToSelected markers={markers} selectedId={selectedId} />}
        {route && <RouteLine route={route} />}

        {origin && (
          <HtmlMarker position={origin} zIndex={5} anchor="center">
            <CurrentLocationMarker />
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
