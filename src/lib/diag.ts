"use client";

// Phone-only problems are hard to see: a few breadcrumbs go to the server log.
const CAMERA_KEY = "yorimichi:camera";

export function diag(msg: string) {
  try {
    if (!navigator.sendBeacon?.("/api/diag", msg)) void fetch("/api/diag", { method: "POST", body: msg, keepalive: true });
  } catch {
    /* never mind */
  }
}

/** Call right before opening the camera / photo picker. */
export function cameraOpening(where: string) {
  try {
    sessionStorage.setItem(CAMERA_KEY, JSON.stringify({ at: Date.now(), where }));
  } catch {
    /* storage blocked */
  }
}

/** Call when a photo came back (or the picker was closed). */
export function cameraBack() {
  try {
    sessionStorage.removeItem(CAMERA_KEY);
  } catch {
    /* storage blocked */
  }
}

/** On page load: was the page thrown away while the camera was open? */
export function checkCameraReload(here: string) {
  try {
    const raw = sessionStorage.getItem(CAMERA_KEY);
    if (!raw) return;
    sessionStorage.removeItem(CAMERA_KEY);
    const { at, where } = JSON.parse(raw) as { at: number; where: string };
    if (Date.now() - at < 5 * 60 * 1000) diag(`page reloaded while camera was open (opened on ${where}, now ${here}, ${Math.round((Date.now() - at) / 1000)}s)`);
  } catch {
    /* ignore */
  }
}
