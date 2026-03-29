import { NextResponse } from "next/server";

export function ok(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, { status: 200, ...init });
}

export function badRequest(message: string, details?: unknown) {
  return NextResponse.json(
    { ok: false, error: { code: "bad_request", message, details } },
    { status: 400 }
  );
}

export function validationError(message: string, issues?: unknown) {
  return NextResponse.json(
    { ok: false, error: { code: "validation_error", message, issues } },
    { status: 422 }
  );
}

export function unauthorized(message: string) {
  return NextResponse.json(
    { ok: false, error: { code: "unauthorized", message } },
    { status: 401 }
  );
}

export function notFound(message: string) {
  return NextResponse.json(
    { ok: false, error: { code: "not_found", message } },
    { status: 404 }
  );
}

export function serverError(message: string, details?: unknown) {
  return NextResponse.json(
    { ok: false, error: { code: "server_error", message, details } },
    { status: 500 }
  );
}
