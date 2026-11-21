import { NextRequest, NextResponse } from "next/server";
import { errorResponse, readJsonBody, requireMember, stringField } from "@/lib/apiAuth";
import { isConversationPriority } from "@/lib/inbox";
import { setConversationPriority } from "@/lib/messaging";
import { getPrisma } from "@/lib/prisma";

/** Set this conversation's priority (low/normal/high/urgent). */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: conversationId } = await params;
  const body = await readJsonBody(req);
  const workspaceId = stringField(body, "workspaceId");
  const priority = body?.priority;
  if (!isConversationPriority(priority)) {
    return errorResponse("Priority must be low, normal, high or urgent.");
  }

  const db = getPrisma();
  const gate = await requireMember(req, workspaceId, db);
  if (!gate.ok) return gate.response;

  const result = await setConversationPriority(workspaceId, conversationId, priority, db);
  if (!result.ok) return errorResponse(result.error);
  return NextResponse.json({ ok: true });
}
