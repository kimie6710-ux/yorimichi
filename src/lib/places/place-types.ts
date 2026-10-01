// Google place type groups used for the broad "whole town" nearby fetch.
// We intentionally do NOT narrow by the user's query: the AI filter is applied
// to the whole neighbourhood afterwards.

/** Types that have been in Places API (New) Table A for a long time. */
export const FOOD_TYPES = [
  "restaurant",
  "cafe",
  "coffee_shop",
  "bakery",
  "bar",
  "ice_cream_shop",
  "meal_takeaway",
  "dessert_shop",
];

export const TOWN_TYPES = [
  "book_store",
  "library",
  "park",
  "museum",
  "art_gallery",
  "tourist_attraction",
  "historical_landmark",
  "clothing_store",
  "convenience_store",
  "gift_shop",
  "florist",
  "home_goods_store",
  "movie_theater",
  "laundry",
  "church",
  "hindu_temple",
  "shopping_mall",
  "train_station",
  "subway_station",
  "playground",
];

/**
 * Newer types (shrines, temples, baths …). If Google rejects any of them with
 * 400, the request is retried without this list, so the app keeps working.
 */
export const EXTENDED_TOWN_TYPES = [
  "shinto_shrine",
  "buddhist_temple",
  "public_bath",
  "garden",
  "plaza",
  "bridge",
  "observation_deck",
  "market",
];

/** Not shops: places you go to look around (parks, shrines, plazas, landmarks…). */
export const SPOT_TYPES = [
  "park",
  "garden",
  "plaza",
  "playground",
  "shinto_shrine",
  "buddhist_temple",
  "historical_landmark",
  "tourist_attraction",
  "bridge",
  "observation_deck",
  "art_gallery",
  "museum",
  "library",
];

/** Short Japanese fallback labels when primaryTypeDisplayName is missing. */
const TYPE_LABELS: Record<string, string> = {
  restaurant: "飲食店",
  chinese_restaurant: "中華料理店",
  ramen_restaurant: "ラーメン店",
  japanese_restaurant: "和食店",
  cafe: "カフェ",
  coffee_shop: "喫茶店",
  bakery: "パン屋",
  bar: "バー",
  ice_cream_shop: "アイスクリーム店",
  dessert_shop: "甘味・デザート",
  meal_takeaway: "テイクアウト",
  book_store: "書店",
  library: "図書館",
  park: "公園",
  museum: "博物館・美術館",
  art_gallery: "ギャラリー",
  tourist_attraction: "観光スポット",
  historical_landmark: "史跡",
  clothing_store: "衣料品店",
  convenience_store: "コンビニ",
  gift_shop: "雑貨・ギフト",
  florist: "花屋",
  home_goods_store: "生活雑貨",
  movie_theater: "映画館",
  laundry: "コインランドリー",
  church: "教会",
  hindu_temple: "寺院",
  shinto_shrine: "神社",
  buddhist_temple: "寺",
  public_bath: "銭湯",
  garden: "庭園",
  plaza: "広場",
  shopping_mall: "商業施設",
  place_of_worship: "祈りの場所",
};

export function labelForType(type: string | null): string | null {
  if (!type) return null;
  return TYPE_LABELS[type] ?? null;
}
