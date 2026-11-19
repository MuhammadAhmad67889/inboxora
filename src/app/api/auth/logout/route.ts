import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { clearSessionCookie, destroySession } from "@/lib/session";

export async function POST(req: NextRequest) {
  await destroySession(req.cookies.get(SESSION_COOKIE)?.value);
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
}
