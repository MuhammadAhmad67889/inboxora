import { NextRequest, NextResponse } from "next/server";
import { normalizeEmail } from "@/lib/auth";
import { appUrl, sendMail } from "@/lib/mail";
import { buildResetToken } from "@/lib/passwordReset";
import { getPrisma } from "@/lib/prisma";
import { clientIp, isRateLimited } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  if (isRateLimited(`forgot:${clientIp(req)}`, 5, 60_000)) {
    return NextResponse.json(
      { errors: { form: "Too many attempts. Try again in a minute." } },
      { status: 429 },
    );
  }
  const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email : "";

  const db = getPrisma();
  const user = await db.user.findUnique({ where: { email: normalizeEmail(email) } });

  // Always answer the same way, whether or not the email exists, so
  // this endpoint cannot be used to check who has an account.
  if (user) {
    const { expiresAt, token, tokenHash } = buildResetToken();
    await db.passwordResetToken.create({
      data: { expiresAt, tokenHash, userId: user.id },
    });
    const link = appUrl(`/reset-password?token=${token}`);
    await sendMail({
      subject: "Reset your password",
      text: `Use this link within one hour to reset your password:\n\n${link}\n\nIf you did not ask for this, ignore this email.`,
      to: user.email,
    }).catch((err) => {
      console.error("password reset email failed", err);
    });
  }

  return NextResponse.json({ ok: true });
}
