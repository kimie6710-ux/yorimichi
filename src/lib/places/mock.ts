import "server-only";

// ⚠️ DEVELOPMENT-ONLY MOCK DATA ⚠️
// These objects exist so the UI can be exercised / demoed without Google / AI keys.
// They are NOT real places (names are fictional, positions are generated around
// the user). The UI deliberately shows them like normal data for demos, so they
// must never be served in production.
// isMockModeServer() refuses to enable mock mode when VERCEL_ENV=production.

import { distanceMeters, walkMinutes } from "@/lib/geo";
import type { LatLng, Place } from "@/lib/types";

interface MockSeed {
  key: string;
  name: string;
  primaryType: string;
  primaryTypeLabel: string;
  /** Offset from the user's position in meters (north, east). */
  offset: [number, number];
  rating: number | null;
  userRatingCount: number | null;
  openNow: boolean | null;
  editorialSummary: string | null;
  attributes: string[];
  reviews: string[];
}

const MOCK_SEEDS: MockSeed[] = [
  {
    key: "chuka",
    name: "福来軒",
    primaryType: "chinese_restaurant",
    primaryTypeLabel: "中華料理店",
    offset: [320, -180],
    rating: 3.8,
    userRatingCount: 212,
    openNow: true,
    editorialSummary: null,
    attributes: ["イートイン", "グループ向きではない"],
    reviews: [
      "店の奥に漫画の棚がずらっと並んでいて、ラーメンができるまでつい読みふけってしまう。",
      "一人客が多くて静か。昔ながらの町中華という感じで落ち着く。",
      "チャーハンが素朴でおいしい。長居しても何も言われない。",
    ],
  },
  {
    key: "bookstore",
    name: "三日月書房",
    primaryType: "book_store",
    primaryTypeLabel: "書店",
    offset: [-150, 260],
    rating: 4.1,
    userRatingCount: 98,
    openNow: true,
    editorialSummary: "駅前の小さな新刊書店。",
    attributes: [],
    reviews: ["品揃えは多くないけど、店主の選書が面白い。", "雑誌コーナーが充実している。"],
  },
  {
    key: "shrine",
    name: "路地裏稲荷神社",
    primaryType: "shinto_shrine",
    primaryTypeLabel: "神社",
    offset: [480, 390],
    rating: 4.3,
    userRatingCount: 57,
    openNow: null,
    editorialSummary: null,
    attributes: [],
    reviews: [
      "住宅街の奥にある小さな神社。ベンチがあって、ぼーっとするのにちょうどいい。",
      "木陰が涼しくて、昼間でも人がほとんどいない。",
    ],
  },
  {
    key: "kissa",
    name: "喫茶ミモザ",
    primaryType: "coffee_shop",
    primaryTypeLabel: "喫茶店",
    offset: [90, 120],
    rating: 4.0,
    userRatingCount: 143,
    openNow: true,
    editorialSummary: "創業40年の純喫茶。",
    attributes: ["コーヒーあり", "デザートあり"],
    reviews: [
      "文庫本を読んでいる常連さんが多い。BGMが小さくて集中できる。",
      "固めのプリンが名物。レトロな内装がかわいい。",
      "マスターが静かで、一人でも入りやすい。",
    ],
  },
  {
    key: "laundry",
    name: "コインランドリー朝顔",
    primaryType: "laundry",
    primaryTypeLabel: "コインランドリー",
    offset: [-280, -90],
    rating: 3.6,
    userRatingCount: 12,
    openNow: true,
    editorialSummary: null,
    attributes: [],
    reviews: [
      "夜は誰もいなくて、乾燥機の音だけが響く。なぜか落ち着く。",
      "ベンチと古い雑誌が置いてある。",
    ],
  },
  {
    key: "park",
    name: "ひだまり児童遊園",
    primaryType: "park",
    primaryTypeLabel: "公園",
    offset: [-420, 310],
    rating: 3.9,
    userRatingCount: 34,
    openNow: null,
    editorialSummary: null,
    attributes: [],
    reviews: ["夕方になると静か。大きな桜の木がある。", "ベンチが多いので休憩にいい。"],
  },
  {
    key: "bakery",
    name: "ベーカリー小麦堂",
    primaryType: "bakery",
    primaryTypeLabel: "パン屋",
    offset: [210, -360],
    rating: 4.4,
    userRatingCount: 301,
    openNow: true,
    editorialSummary: null,
    attributes: ["テイクアウト可", "デザートあり"],
    reviews: [
      "クリームパンが絶品。甘すぎないのがいい。",
      "朝の焼きたての匂いで通りがわかる。",
    ],
  },
  {
    key: "usedbooks",
    name: "古書 灯台舎",
    primaryType: "book_store",
    primaryTypeLabel: "古書店",
    offset: [-60, -470],
    rating: 4.5,
    userRatingCount: 45,
    openNow: false,
    editorialSummary: null,
    attributes: [],
    reviews: [
      "天井まで本が積まれていて、宝探しみたい。",
      "昔の地図や絵はがきも売っている。店主が詳しい。",
    ],
  },
  {
    key: "sento",
    name: "松の湯",
    primaryType: "public_bath",
    primaryTypeLabel: "銭湯",
    offset: [560, -40],
    rating: 4.2,
    userRatingCount: 88,
    openNow: true,
    editorialSummary: null,
    attributes: [],
    reviews: [
      "富士山のペンキ絵がある昔ながらの銭湯。",
      "脱衣所に漫画と古いマッサージチェアがある。",
    ],
  },
  {
    key: "zakka",
    name: "紙もの雑貨 ポスト",
    primaryType: "gift_shop",
    primaryTypeLabel: "雑貨店",
    offset: [30, 520],
    rating: 4.0,
    userRatingCount: 26,
    openNow: true,
    editorialSummary: null,
    attributes: [],
    reviews: ["古い紙もの、ポストカード、切手が並んでいる。見ているだけで時間が溶ける。"],
  },
];

const M_PER_DEG_LAT = 111_320;
const RELATIVE_TIMES = ["2週間前", "1か月前", "3か月前"];

function offsetLocation(origin: LatLng, [north, east]: [number, number]): LatLng {
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((origin.latitude * Math.PI) / 180);
  return {
    latitude: origin.latitude + north / M_PER_DEG_LAT,
    longitude: origin.longitude + east / mPerDegLng,
  };
}

/** development-only: build mock places around whatever location the user is at. */
export function buildMockPlaces(origin: LatLng): Place[] {
  return MOCK_SEEDS.map((seed) => {
    const location = offsetLocation(origin, seed.offset);
    const dist = distanceMeters(origin, location);
    return {
      placeId: `mock_${seed.key}`,
      name: seed.name,
      primaryType: seed.primaryType,
      primaryTypeLabel: seed.primaryTypeLabel,
      types: [seed.primaryType],
      location,
      address: null,
      rating: seed.rating,
      userRatingCount: seed.userRatingCount,
      priceLevel: null,
      openNow: seed.openNow,
      businessStatus: "OPERATIONAL",
      editorialSummary: seed.editorialSummary,
      attributes: seed.attributes,
      photos: [],
      googleMapsUri: null,
      reviews: seed.reviews.map((text, i) => ({
        text,
        rating: null,
        relativeTime: RELATIVE_TIMES[i % RELATIVE_TIMES.length],
        authorName: null,
      })),
      weekdayHours: [],
      websiteUri: null,
      distanceMeters: Math.round(dist),
      walkMinutes: walkMinutes(dist),
      isMock: true,
    };
  }).sort((a, b) => a.distanceMeters - b.distanceMeters);
}
