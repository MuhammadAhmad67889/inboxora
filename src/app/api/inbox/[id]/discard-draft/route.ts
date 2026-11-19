import { NextRequest, NextResponse } from "next/server";
import { discardDraft } from "@/lib/aiDraft";
import { errorResponse, readJsonBody, requireMember, stringField } from "@/lib/apiAuth";
import { getPrisma } from "@/lib/prisma";
import { clientIp, isRateLimited } from "@/lib/rateLimit";

/** Discard a draft without sending anything. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isRateLimited(`discard-draft:${clientIp(req)}`, 60, 60_000)) {
    return errorResponse("Too many requests. Try again in a minute.", 429);
  }
  const { id: conversationId } = await params;
  const body = await readJsonBody(req);
  const workspaceId = stringField(body, "workspaceId");
  const draftId = stringField(body, "draftId");

  const db = getPrisma();
  const gate = await requireMember(req, workspaceId, db);
  if (!gate.ok) return gate.response;

  const result = await discardDraft(workspaceId, conversationId, draftId, db);
  if (!result.ok) return errorResponse(result.error);
  return NextResponse.json({ ok: true });
}
