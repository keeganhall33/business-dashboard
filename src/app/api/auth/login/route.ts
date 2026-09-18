import { NextResponse } from "next/server";

import {
  DASHBOARD_SESSION_COOKIE,
  DASHBOARD_SESSION_TTL_SECONDS,
  getDashboardSessionSecret,
  issueDashboardSession,
  verifyDashboardAccessAttempt
} from "@/lib/auth/dashboard-session";

export const runtime = "nodejs";

function safeDestination(value: FormDataEntryValue | null): string {
  const destination = typeof value === "string" ? value : "/dashboard";
  return destination.startsWith("/") && !destination.startsWith("//") ? destination : "/dashboard";
}

export async function POST(request: Request) {
  const form = await request.formData();
  const email = typeof form.get("email") === "string" ? String(form.get("email")) : "";
  const accessCode = typeof form.get("accessCode") === "string" ? String(form.get("accessCode")) : "";
  const destination = safeDestination(form.get("next"));

  if (!verifyDashboardAccessAttempt(email, accessCode)) {
    const invalidUrl = new URL("/login", request.url);
    invalidUrl.searchParams.set("error", "invalid");
    invalidUrl.searchParams.set("next", destination);
    return NextResponse.redirect(invalidUrl, 303);
  }

  const secret = getDashboardSessionSecret();
  if (!secret) {
    const configurationUrl = new URL("/login", request.url);
    configurationUrl.searchParams.set("error", "configuration");
    return NextResponse.redirect(configurationUrl, 303);
  }

  const response = NextResponse.redirect(new URL(destination, request.url), 303);
  response.cookies.set({
    name: DASHBOARD_SESSION_COOKIE,
    value: issueDashboardSession({ email, secret }),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: DASHBOARD_SESSION_TTL_SECONDS
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

