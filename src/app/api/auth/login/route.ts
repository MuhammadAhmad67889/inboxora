import { NextRequest, NextResponse } from "next/server";
import { hashPassword, normalizeEmail, verifyPassword } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { clientIp, isRateLimited } from "@/lib/rateLimit";
import { createSession, setSessionCookie } from "@/lib/session";

// A real scrypt hash of a throwaway password, computed once. Verifying
// against it when the email does not exist keeps the response time
// similar, so login cannot be used to probe which emails are registered.
const DUMMY_HASH = hashPassword("not-a-real-password");

export async function POST(req: NextRequest) {
  if (isRateLimited(`login:${clientIp(req)}`, 20, 60_000)) {
    return NextResponse.json(
      { errors: { form: "Too many attempts. Try again in a minute." } },
      { status: 429 },
    );
  }
  const body = (await req.json().catch(() => null)) as {
    email?: unknown;
    password?: unknown;
  } | null;
  const email = typeof body?.email === "string" ? body.email : "";
  const password = typeof body?.password === "string" ? body.password : "";

  const db = getPrisma();
  const user = await db.user.findUnique({ where: { email: normalizeEmail(email) } });
  const passwordOk = verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !passwordOk) {
    return NextResponse.json(
      { errors: { form: "Email or password is incorrect." } },
      { status: 401 },
    );
  }

  const { cookieValue } = await createSession(user.id, db);
  const res = NextResponse.json({ email: user.email, ok: true });
  setSessionCookie(res, cookieValue);
  return res;
}
