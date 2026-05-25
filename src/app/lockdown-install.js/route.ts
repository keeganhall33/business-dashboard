import { NextResponse } from "next/server";

export const runtime = "edge";

const BODY = `// SES lockdown shim disabled by dashboard runtime
if (typeof self !== "undefined") {
  // Flag that we intentionally short-circuited the legacy lockdown script.
  self.SES_DISABLED = true;
}
`;

export function GET() {
  return new NextResponse(BODY, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable"
    }
  });
}
