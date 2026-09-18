import { NextResponse } from "next/server";

import { DASHBOARD_SESSION_COOKIE } from "@/lib/auth/dashboard-session";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  response.cookies.set({
    name: DASHBOARD_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

