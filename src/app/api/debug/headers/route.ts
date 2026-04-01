import { headers } from "next/headers";

export async function GET() {
  const headersList = await headers();
  const entries = Array.from(headersList.entries());
  return Response.json({ headers: entries });
}
