// Collect real places across 町田市 for hand-written lines (no AI API).
//   node scripts/data/collect-machida.mjs <out.json>
// Uses GOOGLE_PLACES_API_KEY from .env.local. ~2 Nearby Search calls per grid point.
import { readFileSync, writeFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const KEY = env.GOOGLE_PLACES_API_KEY;
const OUT = process.argv[2];

// 町田市 roughly; points outside the city are dropped by address afterwards.
const S = 35.505, N = 35.628, W = 139.335, E = 139.5;
const DLAT = 0.016, DLNG = 0.019, RADIUS = 1000;

const SPOTS = ["park", "garden", "plaza", "playground", "shinto_shrine", "buddhist_temple", "historical_landmark", "tourist_attraction", "museum", "art_gallery", "library", "observation_deck", "bridge"];
const TOWN = ["restaurant", "cafe", "coffee_shop", "bakery", "ice_cream_shop", "dessert_shop", "book_store", "gift_shop", "florist", "home_goods_store", "market", "public_bath"];
const SKIP = /atm|bank|parking|police|local_government_office|post_office|insurance|real_estate|doctor|dentist|hospital|pharmacy|gas_station|car_|lodging|hotel|school|university|funeral|cemetery|storage|moving|lawyer|accounting|finance/;
const CHAINS = /マクドナルド|スターバックス|ドトール|サイゼリヤ|ガスト|すき家|吉野家|松屋|セブン|ファミリーマート|ローソン|コメダ|モスバーガー|ケンタッキー|バーミヤン|はま寿司|くら寿司|スシロー|丸亀製麺|日高屋|ココス|ジョナサン|デニーズ|タリーズ|ミスタードーナツ|ロッテリア|てんや|なか卯|ほっともっと|オリジン|ドミノ|ピザーラ|大戸屋|やよい軒|リンガーハット|かつや|銀だこ/;

async function nearby(lat, lng, includedTypes, rank) {
  const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": KEY,
      "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.types,places.primaryTypeDisplayName,places.formattedAddress,places.photos.name,places.businessStatus",
    },
    body: JSON.stringify({ includedTypes, maxResultCount: 20, rankPreference: rank, languageCode: "ja", regionCode: "JP", locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: RADIUS } } }),
  });
  if (!res.ok) {
    console.warn("nearby", res.status, (await res.text()).slice(0, 120));
    return [];
  }
  return (await res.json()).places ?? [];
}

const seen = new Map();
let calls = 0;
for (let lat = S; lat <= N; lat += DLAT) {
  for (let lng = W; lng <= E; lng += DLNG) {
    const lists = await Promise.all([nearby(lat, lng, SPOTS, "DISTANCE"), nearby(lat, lng, TOWN, "POPULARITY")]);
    calls += 2;
    for (const p of lists.flat()) {
      const addr = p.formattedAddress ?? "";
      if (!addr.includes("町田市")) continue;
      if (p.businessStatus && p.businessStatus !== "OPERATIONAL") continue;
      if ((p.types ?? []).some((t) => SKIP.test(t))) continue;
      const name = p.displayName?.text ?? "";
      if (CHAINS.test(name)) continue;
      if (!seen.has(p.id))
        seen.set(p.id, {
          id: p.id,
          name,
          category: p.primaryTypeDisplayName?.text ?? null,
          types: (p.types ?? []).slice(0, 10),
          lat: p.location.latitude,
          lng: p.location.longitude,
          address: addr.replace(/^日本、〒\d{3}-\d{4}\s*/, ""),
          photo: p.photos?.[0]?.name ?? null,
        });
    }
    process.stdout.write(".");
  }
}
const all = [...seen.values()];
writeFileSync(OUT, JSON.stringify(all, null, 1));
console.log(`\n${calls} calls, ${all.length} places in 町田市 → ${OUT}`);
