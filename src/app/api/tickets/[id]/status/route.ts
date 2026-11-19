import { NextRequest, NextResponse } from "next/server";
import { errorResponse, readJsonBody, requireMember, stringField } from "@/lib/apiAuth";
import { getPrisma } from "@/lib/prisma";
import { clientIp, isRateLimited } from "@/lib/rateLimit";
import { isTicketStatus, setTicketStatus } from "@/lib/tickets";

/** Change a ticket's status (open / waiting / resolved). */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isRateLimited(`ticket-status:${clientIp(req)}`, 60, 60_000)) {
    return errorResponse("Too many requests. Try again in a minute.", 429);
  }
  const { id: ticketId } = await params;
  const body = await readJsonBody(req);
  const workspaceId = stringField(body, "workspaceId");
  const status = stringField(body, "status");
  if (!isTicketStatus(status)) return errorResponse("Unknown ticket status.");

  const db = getPrisma();
  const gate = await requireMember(req, workspaceId, db);
  if (!gate.ok) return gate.response;

  const result = await setTicketStatus(workspaceId, ticketId, status, db);
  if (!result.ok) return errorResponse(result.error);
  return NextResponse.json({ ok: true });
}
