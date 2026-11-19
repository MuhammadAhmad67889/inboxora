import type { Membership, PrismaClient, User } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "./auth";
import { getPrisma } from "./prisma";
import { userFromCookieValue } from "./session";
import { getMembership } from "./workspaces";

/** Read a JSON body, returning null instead of throwing on bad input. */
export async function readJsonBody(
  req: NextRequest,
): Promise<Record<string, unknown> | null> {
  const body = (await req.json().catch(() => null)) as unknown;
  if (!body || typeof body !== "object") return null;
  return body as Record<string, unknown>;
}

export function stringField(body: Record<string, unknown> | null, key: string): string {
  const value = body?.[key];
  return typeof value === "string" ? value : "";
}

export type MemberGate =
  | { membership: Membership; ok: true; user: User }
  | { ok: false; response: NextResponse };

/**
 * The gate every workspace-scoped API route starts with: the caller
 * must be signed in and must belong to the workspace named in the
 * body. Returns a ready-to-send error response otherwise.
 */
export async function requireMember(
  req: NextRequest,
  workspaceId: string,
  db: PrismaClient = getPrisma(),
): Promise<MemberGate> {
  const user = await userFromCookieValue(req.cookies.get(SESSION_COOKIE)?.value, db);
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { errors: { form: "Sign in first." } },
        { status: 401 },
      ),
    };
  }
  if (!workspaceId) {
    return {
      ok: false,
      response: NextResponse.json(
        { errors: { form: "Missing workspace." } },
        { status: 400 },
      ),
    };
  }
  const membership = await getMembership(user.id, workspaceId, db);
  if (!membership) {
    return {
      ok: false,
      response: NextResponse.json(
        { errors: { form: "You do not belong to this workspace." } },
        { status: 403 },
      ),
    };
  }
  return { membership, ok: true, user };
}

export function errorResponse(message: string, status = 400): NextResponse {
  return NextResponse.json({ errors: { form: message } }, { status });
}
