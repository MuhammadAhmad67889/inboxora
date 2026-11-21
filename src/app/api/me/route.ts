import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";

// Session state must never be cached or prerendered.
export const dynamic = "force-dynamic";

/**
 * Tiny session check for client components.
 *
 * The landing page is static HTML, so it cannot know server-side
 * whether the visitor is signed in. This endpoint answers just
 * that one question: { email } when signed in, { email: null }
 * when not. Nothing else about the user is exposed.
 */
export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json(
    { email: user?.email ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
