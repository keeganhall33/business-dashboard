import { EXECUTIVE_WORKSPACE_NAV_V1 } from "@/lib/executive-workspace/ia";

export type ExecutiveWorkspaceRouteResolutionV1 =
  | { state: "ROUTABLE"; href: string }
  | { state: "UNAVAILABLE"; reason: "MALFORMED" | "NOT_IMPLEMENTED" };

const IMPLEMENTED_STATIC_DESTINATIONS = new Set([
  ...EXECUTIVE_WORKSPACE_NAV_V1.map((item) => item.href),
  "/creative-direction",
  "/specialists/financial"
]);

function pathnameFromHref(href: string): string | null {
  if (
    href.length === 0 ||
    href !== href.trim() ||
    !href.startsWith("/") ||
    href.startsWith("//") ||
    href.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(href)
  ) {
    return null;
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(href);
  } catch {
    return null;
  }

  if (decoded.startsWith("//") || decoded.includes("\\")) return null;

  const pathname = decoded.split(/[?#]/, 1)[0] ?? "";
  if (!pathname.startsWith("/")) return null;

  const segments = pathname.split("/");
  if (segments.some((segment) => segment === "." || segment === "..")) return null;

  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

export function resolveExecutiveWorkspaceDetailHrefV1(
  value: unknown
): ExecutiveWorkspaceRouteResolutionV1 {
  if (typeof value !== "string") return { state: "UNAVAILABLE", reason: "MALFORMED" };

  const pathname = pathnameFromHref(value);
  if (pathname == null) return { state: "UNAVAILABLE", reason: "MALFORMED" };
  if (!IMPLEMENTED_STATIC_DESTINATIONS.has(pathname)) {
    return { state: "UNAVAILABLE", reason: "NOT_IMPLEMENTED" };
  }

  return { state: "ROUTABLE", href: value };
}
