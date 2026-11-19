import type { PrismaClient, User } from "@prisma/client";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  hashEquals,
  hashToken,
  newSessionToken,
  SESSION_COOKIE,
  SESSION_DAYS,
  sessionExpiry,
  signSessionCookie,
  verifySessionCookie,
} from "./auth";
import { getPrisma } from "./prisma";

/** Create a session row and return the signed cookie value for it. */
export async function createSession(
  userId: string,
  db: PrismaClient = getPrisma(),
): Promise<{ cookieValue: string; sessionId: string }> {
  const token = newSessionToken();
  const session = await db.session.create({
    data: { expiresAt: sessionExpiry(), tokenHash: hashToken(token), userId },
  });
  return { cookieValue: signSessionCookie(session.id, token), sessionId: session.id };
}

export function setSessionCookie(res: NextResponse, cookieValue: string): void {
  res.cookies.set(SESSION_COOKIE, cookieValue, {
    httpOnly: true,
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

/**
 * Resolve the signed-in user from a raw cookie value.
 *
 * The cookie HMAC is checked first (cheap, no database), then the
 * session row must exist, be unexpired, and its stored token hash
 * must match the token inside the cookie. Returns null for any
 * failure — callers treat null as "not signed in".
 */
export async function userFromCookieValue(
  value: string | undefined | null,
  db: PrismaClient = getPrisma(),
): Promise<User | null> {
  const parsed = verifySessionCookie(value);
  if (!parsed) return null;
  const session = await db.session.findUnique({
    include: { user: true },
    where: { id: parsed.sessionId },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;
  if (!hashEquals(session.tokenHash, hashToken(parsed.token))) return null;
  return session.user;
}

/** Server-component helper: the signed-in user for this request. */
export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  return userFromCookieValue(store.get(SESSION_COOKIE)?.value);
}

/** Delete the session behind a cookie value (sign out). */
export async function destroySession(
  value: string | undefined | null,
  db: PrismaClient = getPrisma(),
): Promise<void> {
  const parsed = verifySessionCookie(value);
  if (!parsed) return;
  await db.session.delete({ where: { id: parsed.sessionId } }).catch(() => undefined);
}
