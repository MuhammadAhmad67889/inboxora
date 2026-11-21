import { NextRequest, NextResponse } from "next/server";
import { errorResponse, readJsonBody, requireMember, stringField } from "@/lib/apiAuth";
import { deleteNote } from "@/lib/messaging";
import { getPrisma } from "@/lib/prisma";
import { clientIp, isRateLimited } from "@/lib/rateLimit";

/** Delete one of your own internal notes. A note written by a
 * teammate (or in another workspace) cannot be deleted here —
 * it reports not-found and nothing changes. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> },
) {
  if (isRateLimited(`note:${clientIp(req)}`, 60, 60_000)) {
    return errorResponse("Too many changes. Try again in a minute.", 429);
  }
  const { noteId } = await params;
  const body = await readJsonBody(req);
  const workspaceId = stringField(body, "workspaceId");

  const db = getPrisma();
  const gate = await requireMember(req, workspaceId, db);
  if (!gate.ok) return gate.response;

  const changed = await deleteNote(workspaceId, noteId, gate.user.id, db);
  if (!changed) return errorResponse("Note not found.", 404);
  return NextResponse.json({ ok: true });
}
