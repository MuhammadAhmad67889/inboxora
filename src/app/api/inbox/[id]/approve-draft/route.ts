import { NextRequest, NextResponse } from "next/server";
import { approveDraft } from "@/lib/aiDraft";
import { errorResponse, readJsonBody, requireMember, stringField } from "@/lib/apiAuth";
import { getPrisma } from "@/lib/prisma";
import { clientIp, isRateLimited } from "@/lib/rateLimit";

/** Approve a draft (optionally edited) and send it. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isRateLimited(`approve-draft:${clientIp(req)}`, 60, 60_000)) {
    return errorResponse("Too many requests. Try again in a minute.", 429);
  }
  const { id: conversationId } = await params;
  const body = await readJsonBody(req);
  const workspaceId = stringField(body, "workspaceId");
  const draftId = stringField(body, "draftId");
  const text = stringField(body, "text");

  const db = getPrisma();
  const gate = await requireMember(req, workspaceId, db);
  if (!gate.ok) return gate.response;

  const result = await approveDraft(
    workspaceId,
    conversationId,
    draftId,
    gate.user.id,
    text || undefined,
    db,
  );
  if (!result.ok) return errorResponse(result.error);
  return NextResponse.json({ messageId: result.message.id, ok: true });
}
