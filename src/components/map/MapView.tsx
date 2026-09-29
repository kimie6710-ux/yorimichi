"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { hasMapsKey } from "@/lib/config";
import type { MapViewProps } from "./types";

const GoogleSpotMap = dynamic(() => import("./GoogleSpotMap"), {
  ssr: false,
  loading: () => <div className="paper-grid h-full w-full" />,
});
const FieldMap = dynamic(() => import("./FieldMap"), {
  ssr: false,
  loading: () => <div className="paper-grid h-full w-full" />,
});

declare global {
  interface Window {
    /** Called by the Maps JS API when the key is invalid / not authorised. */
    gm_authFailure?: () => void;
  }
}

/**
 * Google Maps when a browser key is configured and loads correctly; otherwise
 * the field-note map. A failed Google load (network, bad key) switches over
 * automatically so the user still sees their spots.
 */
export function MapView(props: MapViewProps) {
  const [googleFailed, setGoogleFailed] = useState(false);

  useEffect(() => {
    if (!hasMapsKey()) return;
    const previous = window.gm_authFailure;
    window.gm_authFailure = () => {
      console.error("[maps] Google Maps authentication failed — check NEXT_PUBLIC_GOOGLE_MAPS_API_KEY");
      setGoogleFailed(true);
      previous?.();
    };
    return () => {
      window.gm_authFailure = previous;
    };
  }, []);

  if (hasMapsKey() && !googleFailed) {
    return <GoogleSpotMap {...props} onLoadError={() => setGoogleFailed(true)} />;
  }
  return <FieldMap {...props} />;
}

export type { MapMarker, MapViewProps } from "./types";
