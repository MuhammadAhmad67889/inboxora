import { NextRequest, NextResponse } from "next/server";
import { errorResponse, readJsonBody, requireMember, stringField } from "@/lib/apiAuth";
import { getPrisma } from "@/lib/prisma";
import { clientIp, isRateLimited } from "@/lib/rateLimit";
import { createTicket, isTicketPriority } from "@/lib/tickets";

/** Create a ticket by hand for a conversation ("needs a human"). */
export async function POST(req: NextRequest) {
  if (isRateLimited(`tickets:${clientIp(req)}`, 60, 60_000)) {
    return errorResponse("Too many requests. Try again in a minute.", 429);
  }
  const body = await readJsonBody(req);
  const workspaceId = stringField(body, "workspaceId");
  const conversationId = stringField(body, "conversationId");
  const notes = stringField(body, "notes");
  const priorityRaw = stringField(body, "priority");

  const db = getPrisma();
  const gate = await requireMember(req, workspaceId, db);
  if (!gate.ok) return gate.response;

  const result = await createTicket(
    workspaceId,
    {
      conversationId,
      notes: notes || undefined,
      priority: isTicketPriority(priorityRaw) ? priorityRaw : undefined,
      source: "manual",
    },
    db,
  );
  if (!result.ok) return errorResponse(result.error);
  return NextResponse.json({ ok: true, ticketId: result.ticket.id });
}
