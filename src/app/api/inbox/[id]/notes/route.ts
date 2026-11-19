import { NextRequest, NextResponse } from "next/server";
import { errorResponse, readJsonBody, requireMember, stringField } from "@/lib/apiAuth";
import { addNote } from "@/lib/messaging";
import { getPrisma } from "@/lib/prisma";
import { clientIp, isRateLimited } from "@/lib/rateLimit";

/** Add an internal note. Notes are stored separately and are never
 * sent to the customer. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isRateLimited(`note:${clientIp(req)}`, 60, 60_000)) {
    return errorResponse("Too many notes. Try again in a minute.", 429);
  }
  const { id: conversationId } = await params;
  const body = await readJsonBody(req);
  const workspaceId = stringField(body, "workspaceId");
  const text = stringField(body, "text");

  const db = getPrisma();
  const gate = await requireMember(req, workspaceId, db);
  if (!gate.ok) return gate.response;

  const result = await addNote(workspaceId, conversationId, gate.user.id, text, db);
  if (!result.ok) return errorResponse(result.error);
  return NextResponse.json({ noteId: result.note.id, ok: true });
}
