import { redirect } from "next/navigation";

export default async function PlaceRedirect({ params }: PageProps<"/place/[placeId]">) {
  const { placeId } = await params;
  redirect(`/spot/${encodeURIComponent(placeId)}`);
}
