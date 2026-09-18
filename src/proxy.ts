import { NextRequest, NextResponse } from "next/server";

import {
  DASHBOARD_SESSION_COOKIE,
  canBypassDashboardAuth,
  getDashboardSessionSecret,
  verifyDashboardSession
} from "@/lib/auth/dashboard-session";

export function proxy(request: NextRequest) {
  if (canBypassDashboardAuth()) return NextResponse.next();

  const secret = getDashboardSessionSecret();
  const session = secret
    ? verifyDashboardSession({ token: request.cookies.get(DASHBOARD_SESSION_COOKIE)?.value, secret })
    : null;
  if (session) return NextResponse.next();

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  if (!secret) loginUrl.searchParams.set("error", "configuration");
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!api|login|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map|woff2?|ttf)$).*)"]
};

