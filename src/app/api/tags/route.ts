import { NextRequest, NextResponse } from "next/server";
import { errorResponse, readJsonBody, requireMember, stringField } from "@/lib/apiAuth";
import { getPrisma } from "@/lib/prisma";
import { createTag, validateTagName } from "@/lib/tags";
import { clientIp, isRateLimited } from "@/lib/rateLimit";

/** Create one conversation tag (short name + optional color). */
export async function POST(req: NextRequest) {
  if (isRateLimited(`tags:${clientIp(req)}`, 60, 60_000)) {
    return errorResponse("Too many changes. Try again in a minute.", 429);
  }
  const body = await readJsonBody(req);
  const workspaceId = stringField(body, "workspaceId");
  const name = stringField(body, "name");
  const color = stringField(body, "color") || null;

  const db = getPrisma();
  const gate = await requireMember(req, workspaceId, db);
  if (!gate.ok) return gate.response;

  const problem = validateTagName(name);
  if (problem) return errorResponse(problem);

  const result = await createTag(workspaceId, { color, name }, db);
  if (!result.ok) return errorResponse(result.error);
  return NextResponse.json({ ok: true, tagId: result.tag.id }, { status: 201 });
}
