import { NextRequest, NextResponse } from "next/server";
import { errorResponse, readJsonBody, requireMember, stringField } from "@/lib/apiAuth";
import { getPrisma } from "@/lib/prisma";
import { attachTag, attachTagByName, detachTag } from "@/lib/tags";
import { clientIp, isRateLimited } from "@/lib/rateLimit";

/** Attach a tag to this conversation. Send tagId to attach an
 * existing tag, or name (+ optional color) to create-and-attach
 * in one step. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isRateLimited(`tags:${clientIp(req)}`, 60, 60_000)) {
    return errorResponse("Too many changes. Try again in a minute.", 429);
  }
  const { id: conversationId } = await params;
  const body = await readJsonBody(req);
  const workspaceId = stringField(body, "workspaceId");
  const tagId = stringField(body, "tagId");
  const name = stringField(body, "name");
  const color = stringField(body, "color") || null;

  const db = getPrisma();
  const gate = await requireMember(req, workspaceId, db);
  if (!gate.ok) return gate.response;

  if (tagId) {
    const result = await attachTag(workspaceId, conversationId, tagId, db);
    if (!result.ok) return errorResponse(result.error, 404);
    return NextResponse.json({ ok: true });
  }
  if (name) {
    const result = await attachTagByName(
      workspaceId,
      conversationId,
      { color, name },
      db,
    );
    if (!result.ok) return errorResponse(result.error);
    return NextResponse.json({ ok: true, tagId: result.tag.id }, { status: 201 });
  }
  return errorResponse("Pick a tag or type a new tag name.");
}

/** Remove a tag from this conversation. The tag stays available
 * for other chats. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isRateLimited(`tags:${clientIp(req)}`, 60, 60_000)) {
    return errorResponse("Too many changes. Try again in a minute.", 429);
  }
  const { id: conversationId } = await params;
  const body = await readJsonBody(req);
  const workspaceId = stringField(body, "workspaceId");
  const tagId = stringField(body, "tagId");

  const db = getPrisma();
  const gate = await requireMember(req, workspaceId, db);
  if (!gate.ok) return gate.response;

  const changed = await detachTag(workspaceId, conversationId, tagId, db);
  if (!changed) return errorResponse("That tag is not on this conversation.", 404);
  return NextResponse.json({ ok: true });
}
