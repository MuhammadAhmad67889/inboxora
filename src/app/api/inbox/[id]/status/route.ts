import { NextRequest, NextResponse } from "next/server";
import { errorResponse, readJsonBody, requireMember, stringField } from "@/lib/apiAuth";
import { isConversationStatus, setConversationStatus } from "@/lib/messaging";
import { getPrisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: conversationId } = await params;
  const body = await readJsonBody(req);
  const workspaceId = stringField(body, "workspaceId");
  const status = body?.status;
  if (!isConversationStatus(status)) {
    return errorResponse("Status must be open or resolved.");
  }

  const db = getPrisma();
  const gate = await requireMember(req, workspaceId, db);
  if (!gate.ok) return gate.response;

  const result = await setConversationStatus(workspaceId, conversationId, status, db);
  if (!result.ok) return errorResponse(result.error);
  return NextResponse.json({ ok: true });
}
