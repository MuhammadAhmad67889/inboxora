import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { getMembership } from "@/lib/workspaces";
import { markConversationRead } from "@/lib/inbox";
import { getPrisma } from "@/lib/prisma";
import { userFromCookieValue } from "@/lib/session";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: conversationId } = await params;
  const db = getPrisma();
  const user = await userFromCookieValue(req.cookies.get(SESSION_COOKIE)?.value, db);
  if (!user) {
    return NextResponse.json({ errors: { form: "Sign in first." } }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    workspaceId?: unknown;
  } | null;
  const workspaceId = typeof body?.workspaceId === "string" ? body.workspaceId : "";
  if (!workspaceId) {
    return NextResponse.json({ errors: { form: "Missing workspace." } }, { status: 400 });
  }

  // The caller must belong to the workspace, and the conversation
  // must belong to it too — markConversationRead is workspace-scoped,
  // so another workspace's conversation id simply changes nothing.
  const membership = await getMembership(user.id, workspaceId, db);
  if (!membership) {
    return NextResponse.json(
      { errors: { form: "You do not belong to this workspace." } },
      { status: 403 },
    );
  }

  const changed = await markConversationRead(workspaceId, conversationId, db);
  if (!changed) {
    return NextResponse.json(
      { errors: { form: "Conversation not found." } },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true });
}
