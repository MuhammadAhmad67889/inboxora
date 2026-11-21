import { NextRequest, NextResponse } from "next/server";
import { errorResponse, readJsonBody, requireMember, stringField } from "@/lib/apiAuth";
import { getPrisma } from "@/lib/prisma";
import { deleteTag, updateTag, validateTagName } from "@/lib/tags";
import { clientIp, isRateLimited } from "@/lib/rateLimit";

/** Rename a tag and/or change its color. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isRateLimited(`tags:${clientIp(req)}`, 60, 60_000)) {
    return errorResponse("Too many changes. Try again in a minute.", 429);
  }
  const { id: tagId } = await params;
  const body = await readJsonBody(req);
  const workspaceId = stringField(body, "workspaceId");
  const name = stringField(body, "name");
  const color = stringField(body, "color") || null;

  const db = getPrisma();
  const gate = await requireMember(req, workspaceId, db);
  if (!gate.ok) return gate.response;

  const problem = validateTagName(name);
  if (problem) return errorResponse(problem);

  const result = await updateTag(workspaceId, tagId, { color, name }, db);
  if (!result.ok) return errorResponse(result.error, 404);
  return NextResponse.json({ ok: true });
}

/** Delete a tag. Conversations carrying it keep existing — only
 * the label goes away. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isRateLimited(`tags:${clientIp(req)}`, 60, 60_000)) {
    return errorResponse("Too many changes. Try again in a minute.", 429);
  }
  const { id: tagId } = await params;
  const body = await readJsonBody(req);
  const workspaceId = stringField(body, "workspaceId");

  const db = getPrisma();
  const gate = await requireMember(req, workspaceId, db);
  if (!gate.ok) return gate.response;

  const changed = await deleteTag(workspaceId, tagId, db);
  if (!changed) return errorResponse("Tag not found.", 404);
  return NextResponse.json({ ok: true });
}
