import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/**
 * `/dashboard` is the only authoritative Executive Home surface.
 *
 * Keep `/executive-os` only as a compatibility alias. The previous route
 * rendered design-fixture data directly and must never be presented as live
 * business intelligence in production.
 */
export default function ExecutiveOsPage() {
  redirect("/dashboard");
}
