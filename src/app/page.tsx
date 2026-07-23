import { redirect } from "next/navigation";

export default function Home() {
  const pinnedSlug = process.env.PINNED_ARTIST_SLUG;
  redirect(pinnedSlug ? `/s/${pinnedSlug}` : "/builder");
}
