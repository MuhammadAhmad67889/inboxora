import { NextRequest, NextResponse } from "next/server";
import { errorResponse, readJsonBody, requireMember, stringField } from "@/lib/apiAuth";
import { assignConversation } from "@/lib/messaging";
import { getPrisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: conversationId } = await params;
  const body = await readJsonBody(req);
  const workspaceId = stringField(body, "workspaceId");
  // assigneeId: a member's user id, or null/empty to unassign.
  const rawAssignee = body?.assigneeId;
  const assigneeId =
    typeof rawAssignee === "string" && rawAssignee ? rawAssignee : null;

  const db = getPrisma();
  const gate = await requireMember(req, workspaceId, db);
  if (!gate.ok) return gate.response;

  const result = await assignConversation(workspaceId, conversationId, assigneeId, db);
  if (!result.ok) return errorResponse(result.error);
  return NextResponse.json({ ok: true });
}
