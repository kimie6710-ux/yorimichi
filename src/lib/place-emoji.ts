// Category → emoji, used for photo placeholders and for die-cut stickers when
// no photo was taken.
const TYPE_EMOJI: Record<string, string> = {
  chinese_restaurant: "🍜",
  ramen_restaurant: "🍜",
  restaurant: "🍽️",
  japanese_restaurant: "🍱",
  cafe: "☕️",
  coffee_shop: "☕️",
  bakery: "🥐",
  dessert_shop: "🍮",
  ice_cream_shop: "🍦",
  bar: "🍸",
  book_store: "📚",
  library: "📖",
  shinto_shrine: "⛩️",
  buddhist_temple: "🛕",
  park: "🌳",
  garden: "🌿",
  laundry: "🫧",
  public_bath: "♨️",
  gift_shop: "✉️",
  florist: "💐",
  museum: "🖼️",
  art_gallery: "🖼️",
  movie_theater: "🎞️",
  convenience_store: "🏪",
  clothing_store: "👕",
};

export function emojiForType(type: string | null | undefined): string {
  return (type && TYPE_EMOJI[type]) || "📍";
}
