import { NextRequest, NextResponse } from "next/server";
import { errorResponse, readJsonBody, requireMember, stringField } from "@/lib/apiAuth";
import {
  deleteKnowledgeEntry,
  updateKnowledgeEntry,
  validateKnowledgeEntry,
} from "@/lib/inbox";
import { getPrisma } from "@/lib/prisma";
import { clientIp, isRateLimited } from "@/lib/rateLimit";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isRateLimited(`knowledge:${clientIp(req)}`, 60, 60_000)) {
    return errorResponse("Too many changes. Try again in a minute.", 429);
  }
  const { id: entryId } = await params;
  const body = await readJsonBody(req);
  const workspaceId = stringField(body, "workspaceId");
  const title = stringField(body, "title");
  const content = stringField(body, "content");

  const db = getPrisma();
  const gate = await requireMember(req, workspaceId, db);
  if (!gate.ok) return gate.response;

  const problem = validateKnowledgeEntry(title, content);
  if (problem) return errorResponse(problem);

  const changed = await updateKnowledgeEntry(
    workspaceId,
    entryId,
    { content: content.trim(), title: title.trim() },
    db,
  );
  if (!changed) return errorResponse("Entry not found.", 404);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isRateLimited(`knowledge:${clientIp(req)}`, 60, 60_000)) {
    return errorResponse("Too many changes. Try again in a minute.", 429);
  }
  const { id: entryId } = await params;
  const body = await readJsonBody(req);
  const workspaceId = stringField(body, "workspaceId");

  const db = getPrisma();
  const gate = await requireMember(req, workspaceId, db);
  if (!gate.ok) return gate.response;

  const changed = await deleteKnowledgeEntry(workspaceId, entryId, db);
  if (!changed) return errorResponse("Entry not found.", 404);
  return NextResponse.json({ ok: true });
}
