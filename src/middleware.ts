import { NextRequest, NextResponse } from "next/server";
import { isSameOriginRequest } from "@/lib/security";

/** Reject cross-site mutating API calls. Cookie auth plus SameSite=Lax
 * already blocks most CSRF; this Origin check is the second wall. */
export function middleware(req: NextRequest) {
  const method = req.method.toUpperCase();
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const ok = isSameOriginRequest(
      req.headers.get("origin"),
      req.headers.get("referer"),
      req.headers.get("host"),
    );
    if (!ok) {
      return NextResponse.json(
        { errors: { form: "Cross-site request rejected." } },
        { status: 403 },
      );
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
