import { NextRequest, NextResponse } from "next/server";
import { errorResponse, readJsonBody, requireMember, stringField } from "@/lib/apiAuth";
import { saveWhatsAppConnection } from "@/lib/connection";
import { getPrisma } from "@/lib/prisma";
import { clientIp, isRateLimited } from "@/lib/rateLimit";
import { ROLES } from "@/lib/workspaces";

/** Save the workspace's WhatsApp Cloud API credentials.
 * Owner-only: these values control the business's phone number.
 * Saving stores them (token encrypted) but sends nothing — live
 * messaging starts after Meta business verification. */
export async function POST(req: NextRequest) {
  if (isRateLimited(`connection:${clientIp(req)}`, 10, 60_000)) {
    return errorResponse("Too many changes. Try again in a minute.", 429);
  }
  const body = await readJsonBody(req);
  const workspaceId = stringField(body, "workspaceId");

  const db = getPrisma();
  const gate = await requireMember(req, workspaceId, db);
  if (!gate.ok) return gate.response;
  if (gate.membership.role !== ROLES.owner) {
    return errorResponse("Only the workspace owner can change WhatsApp settings.", 403);
  }

  const result = await saveWhatsAppConnection(
    workspaceId,
    {
      accessToken: stringField(body, "accessToken"),
      phoneNumberId: stringField(body, "phoneNumberId"),
      webhookVerifyKey: stringField(body, "webhookVerifyKey"),
    },
    db,
  );
  if (!result.ok) return errorResponse(result.error);
  return NextResponse.json({ ok: true });
}
