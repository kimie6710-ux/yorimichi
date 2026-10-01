"use client";

/* eslint-disable @next/next/no-img-element -- dev tool */
// DEVELOPMENT-ONLY: turns ./.data/files/seed/manifest.json into real stickers
// (same cutter + renderer as the app), owned by ?owner=<device id> and placed
// at their spots. Not reachable in production.

import { useState } from "react";

import { prepareCutter } from "@/lib/sticker/cutter";
import { canvasToBlob, downscaleToJpeg, loadBitmap, stickerFromMask, toCanvas } from "@/lib/sticker/render";

interface Item {
  key: string;
  url: string;
  spotId: string;
  lat: number;
  lng: number;
  label: string;
  memo: string;
  date: string;
  point: [number, number];
  /** Cut an ellipse of this box instead (x, y, w, h in 0..1). */
  ellipse?: [number, number, number, number];
}

function ellipseMask(width: number, height: number, [bx, by, bw, bh]: [number, number, number, number]) {
  const w = 256;
  const h = Math.max(1, Math.round((256 * height) / width));
  const alpha = new Uint8ClampedArray(w * h);
  const cx = (bx + bw / 2) * w, cy = (by + bh / 2) * h, rx = (bw * w) / 2, ry = (bh * h) / 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) alpha[y * w + x] = 255;
  return { width: w, height: h, alpha };
}

export default function SeedPage() {
  const [log, setLog] = useState<{ key: string; url?: string; err?: string }[]>([]);
  const [running, setRunning] = useState(false);
  if (process.env.NODE_ENV === "production") return null;

  async function run() {
    const owner = new URLSearchParams(location.search).get("owner") ?? "";
    const only = new URLSearchParams(location.search).get("only")?.split(",");
    setRunning(true);
    const items: Item[] = await fetch(`/api/files/seed/manifest.json?t=${Date.now()}`, { cache: "no-store" }).then((r) => r.json());
    for (const it of items.filter((i) => !only || only.includes(i.key))) {
      try {
        const bmp = await loadBitmap(await fetch(it.url).then((r) => r.blob()));
        const work = toCanvas(bmp, 1024);
        const mask = it.ellipse
          ? ellipseMask(work.width, work.height, it.ellipse)
          : await (await prepareCutter(work)).maskAt({ x: it.point[0], y: it.point[1] });
        const canvas = mask && stickerFromMask(work, mask);
        if (!canvas) throw new Error("no cut");
        const png = await canvasToBlob(canvas);
        const photo = await downscaleToJpeg(bmp);
        const rotation = Math.round(((Math.random() * 7 + 2) * (Math.random() < 0.5 ? -1 : 1)) * 10) / 10;
        const form = new FormData();
        form.append("meta", JSON.stringify({ spotId: it.spotId, memo: it.memo, items: [{ label: it.label, rotation }] }));
        form.append("photo", photo, "photo.jpg");
        form.append("sticker_0", png, "sticker_0.png");
        const headers = { "x-yorumichi-device": owner };
        const made = await fetch("/api/stickers", { method: "POST", body: form, headers }).then((r) => r.json());
        const id = made.items?.[0]?.id;
        if (!id) throw new Error(JSON.stringify(made));
        await fetch(`/api/stickers/${id}/place`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ latitude: it.lat, longitude: it.lng }),
        });
        setLog((l) => [...l, { key: `${it.key}:${id}`, url: URL.createObjectURL(png) }]);
      } catch (err) {
        setLog((l) => [...l, { key: it.key, err: String(err) }]);
      }
    }
    setRunning(false);
  }

  return (
    <main className="p-4">
      <button type="button" onClick={() => void run()} disabled={running} className="btn-primary h-12 px-6" id="run">
        {running ? "running…" : "run"}
      </button>
      <p id="count">{log.length}</p>
      <ul className="mt-4 grid grid-cols-4 gap-3">
        {log.map((l) => (
          <li key={l.key} className="text-[14px]">
            {l.url ? <img src={l.url} alt="" className="w-full" /> : <span className="text-red-600">{l.err}</span>}
            {l.key.split(":")[0]}
          </li>
        ))}
      </ul>
    </main>
  );
}
