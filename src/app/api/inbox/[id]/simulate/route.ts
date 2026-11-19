import { NextRequest, NextResponse } from "next/server";
import { errorResponse, readJsonBody, requireMember, stringField } from "@/lib/apiAuth";
import { simulateCustomerMessage } from "@/lib/messaging";
import { getPrisma } from "@/lib/prisma";
import { clientIp, isRateLimited } from "@/lib/rateLimit";

/** Demo only: simulate an incoming customer message. The data layer
 * refuses this for non-demo conversations. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isRateLimited(`simulate:${clientIp(req)}`, 60, 60_000)) {
    return errorResponse("Too many attempts. Try again in a minute.", 429);
  }
  const { id: conversationId } = await params;
  const body = await readJsonBody(req);
  const workspaceId = stringField(body, "workspaceId");
  const text = stringField(body, "text");

  const db = getPrisma();
  const gate = await requireMember(req, workspaceId, db);
  if (!gate.ok) return gate.response;

  const result = await simulateCustomerMessage(
    workspaceId,
    conversationId,
    text || undefined,
    db,
  );
  if (!result.ok) return errorResponse(result.error);
  return NextResponse.json({ messageId: result.message.id, ok: true });
}
