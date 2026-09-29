import { redirect } from "next/navigation";

/** Spot details are revealed only after arriving, so this goes to the guide. */
export default async function PlacePage({ params }: PageProps<"/place/[placeId]">) {
  const { placeId } = await params;
  redirect(`/visit/${encodeURIComponent(decodeURIComponent(placeId))}`);
}
