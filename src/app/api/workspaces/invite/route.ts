import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { appUrl, sendMail } from "@/lib/mail";
import { getPrisma } from "@/lib/prisma";
import { clientIp, isRateLimited } from "@/lib/rateLimit";
import { userFromCookieValue } from "@/lib/session";
import { isValidEmail } from "@/lib/validation";
import { createInvite } from "@/lib/workspaces";

export async function POST(req: NextRequest) {
  if (isRateLimited(`invite:${clientIp(req)}`, 10, 60_000)) {
    return NextResponse.json(
      { errors: { form: "Too many attempts. Try again in a minute." } },
      { status: 429 },
    );
  }
  const db = getPrisma();
  const user = await userFromCookieValue(req.cookies.get(SESSION_COOKIE)?.value, db);
  if (!user) {
    return NextResponse.json({ errors: { form: "Sign in first." } }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    email?: unknown;
    workspaceId?: unknown;
  } | null;
  const email = typeof body?.email === "string" ? body.email : "";
  const workspaceId = typeof body?.workspaceId === "string" ? body.workspaceId : "";
  if (!isValidEmail(email)) {
    return NextResponse.json(
      { errors: { email: "Enter a valid email address." } },
      { status: 400 },
    );
  }
  if (!workspaceId) {
    return NextResponse.json(
      { errors: { form: "Missing workspace." } },
      { status: 400 },
    );
  }

  const result = await createInvite(user.id, workspaceId, email, db);
  if (!result.ok) {
    return NextResponse.json({ errors: { form: result.error } }, { status: 400 });
  }

  const link = appUrl(`/invite?token=${result.token}`);
  await sendMail({
    subject: "You are invited to a WhatsApp support workspace",
    text: `You have been invited to join a workspace. Accept within 7 days:\n\n${link}`,
    to: email,
  }).catch((err) => {
    console.error("invite email failed", err);
  });

  return NextResponse.json({ ok: true });
}
