import { NextRequest, NextResponse } from "next/server";
import { errorResponse, readJsonBody, requireMember, stringField } from "@/lib/apiAuth";
import { createKnowledgeEntry, validateKnowledgeEntry } from "@/lib/inbox";
import { getPrisma } from "@/lib/prisma";
import { clientIp, isRateLimited } from "@/lib/rateLimit";

/** Create one FAQ entry (question in title, answer in content). */
export async function POST(req: NextRequest) {
  if (isRateLimited(`knowledge:${clientIp(req)}`, 60, 60_000)) {
    return errorResponse("Too many changes. Try again in a minute.", 429);
  }
  const body = await readJsonBody(req);
  const workspaceId = stringField(body, "workspaceId");
  const title = stringField(body, "title");
  const content = stringField(body, "content");

  const db = getPrisma();
  const gate = await requireMember(req, workspaceId, db);
  if (!gate.ok) return gate.response;

  const problem = validateKnowledgeEntry(title, content);
  if (problem) return errorResponse(problem);

  const entry = await createKnowledgeEntry(
    workspaceId,
    { content, title },
    gate.user.id,
    db,
  );
  return NextResponse.json({ entryId: entry.id, ok: true }, { status: 201 });
}
