import { NextRequest, NextResponse } from "next/server";
import { errorResponse, readJsonBody, requireMember, stringField } from "@/lib/apiAuth";
import { getPrisma } from "@/lib/prisma";
import {
  deleteQuickReply,
  updateQuickReply,
  validateQuickReply,
} from "@/lib/quickReplies";
import { clientIp, isRateLimited } from "@/lib/rateLimit";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isRateLimited(`quick-replies:${clientIp(req)}`, 60, 60_000)) {
    return errorResponse("Too many changes. Try again in a minute.", 429);
  }
  const { id: quickReplyId } = await params;
  const body = await readJsonBody(req);
  const workspaceId = stringField(body, "workspaceId");
  const title = stringField(body, "title");
  const replyBody = stringField(body, "body");

  const db = getPrisma();
  const gate = await requireMember(req, workspaceId, db);
  if (!gate.ok) return gate.response;

  const problem = validateQuickReply(title, replyBody);
  if (problem) return errorResponse(problem);

  const changed = await updateQuickReply(
    workspaceId,
    quickReplyId,
    { body: replyBody, title },
    db,
  );
  if (!changed) return errorResponse("Quick reply not found.", 404);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isRateLimited(`quick-replies:${clientIp(req)}`, 60, 60_000)) {
    return errorResponse("Too many changes. Try again in a minute.", 429);
  }
  const { id: quickReplyId } = await params;
  const body = await readJsonBody(req);
  const workspaceId = stringField(body, "workspaceId");

  const db = getPrisma();
  const gate = await requireMember(req, workspaceId, db);
  if (!gate.ok) return gate.response;

  const changed = await deleteQuickReply(workspaceId, quickReplyId, db);
  if (!changed) return errorResponse("Quick reply not found.", 404);
  return NextResponse.json({ ok: true });
}
