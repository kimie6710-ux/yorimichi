"use client";

// A photo taken on one screen and handed to the next (the spot page opens the
// camera, the visit page cuts it). Lives in memory only: client-side navigation
// keeps it, a reload drops it.
let pending: File | null = null;

export function handPhoto(file: File) {
  pending = file;
}

export function takePhoto(): File | null {
  const f = pending;
  pending = null;
  return f;
}
