import { NextRequest, NextResponse } from "next/server";
import { errorResponse, readJsonBody, requireMember, stringField } from "@/lib/apiAuth";
import { getPrisma } from "@/lib/prisma";
import { createQuickReply, validateQuickReply } from "@/lib/quickReplies";
import { clientIp, isRateLimited } from "@/lib/rateLimit";

/** Create one quick reply (short title + reply text). */
export async function POST(req: NextRequest) {
  if (isRateLimited(`quick-replies:${clientIp(req)}`, 60, 60_000)) {
    return errorResponse("Too many changes. Try again in a minute.", 429);
  }
  const body = await readJsonBody(req);
  const workspaceId = stringField(body, "workspaceId");
  const title = stringField(body, "title");
  const replyBody = stringField(body, "body");

  const db = getPrisma();
  const gate = await requireMember(req, workspaceId, db);
  if (!gate.ok) return gate.response;

  const problem = validateQuickReply(title, replyBody);
  if (problem) return errorResponse(problem);

  const quickReply = await createQuickReply(
    workspaceId,
    { body: replyBody, title },
    gate.user.id,
    db,
  );
  return NextResponse.json({ ok: true, quickReplyId: quickReply.id }, { status: 201 });
}
