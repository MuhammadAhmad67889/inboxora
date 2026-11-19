import { NextRequest, NextResponse } from "next/server";
import { draftReply } from "@/lib/aiDraft";
import { errorResponse, readJsonBody, requireMember, stringField } from "@/lib/apiAuth";
import { getPrisma } from "@/lib/prisma";
import { clientIp, isRateLimited } from "@/lib/rateLimit";

/** Draft an AI reply for the latest customer message. A live-model
 * failure is returned as a visible 502 — never a silent demo swap. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isRateLimited(`draft:${clientIp(req)}`, 30, 60_000)) {
    return errorResponse("Too many draft requests. Try again in a minute.", 429);
  }
  const { id: conversationId } = await params;
  const body = await readJsonBody(req);
  const workspaceId = stringField(body, "workspaceId");

  const db = getPrisma();
  const gate = await requireMember(req, workspaceId, db);
  if (!gate.ok) return gate.response;

  try {
    const result = await draftReply(workspaceId, conversationId, db);
    if (!result.ok) return errorResponse(result.error);
    if (result.kind === "no-match") {
      return NextResponse.json({
        kind: "no-match",
        ok: true,
        question: result.question,
        ticketId: result.ticket.id,
      });
    }
    return NextResponse.json({
      draft: {
        aiMode: result.draft.aiMode,
        id: result.draft.id,
        sourceLabel: result.draft.sourceLabel,
        text: result.draft.text,
      },
      kind: "draft",
      ok: true,
    });
  } catch (error) {
    console.error("Draft request failed:", error);
    return errorResponse(
      "The live AI could not produce a draft. Nothing was sent — try again or reply by hand.",
      502,
    );
  }
}
