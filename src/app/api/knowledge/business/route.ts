import { NextRequest, NextResponse } from "next/server";
import { errorResponse, readJsonBody, requireMember, stringField } from "@/lib/apiAuth";
import { upsertBusinessProfile } from "@/lib/inbox";
import { getPrisma } from "@/lib/prisma";
import { clientIp, isRateLimited } from "@/lib/rateLimit";

/** Save the business facts form (name, hours, address, policies). */
export async function POST(req: NextRequest) {
  if (isRateLimited(`business:${clientIp(req)}`, 30, 60_000)) {
    return errorResponse("Too many changes. Try again in a minute.", 429);
  }
  const body = await readJsonBody(req);
  const workspaceId = stringField(body, "workspaceId");

  const db = getPrisma();
  const gate = await requireMember(req, workspaceId, db);
  if (!gate.ok) return gate.response;

  await upsertBusinessProfile(
    workspaceId,
    {
      address: stringField(body, "address"),
      businessName: stringField(body, "businessName"),
      hours: stringField(body, "hours"),
      policies: stringField(body, "policies"),
    },
    db,
  );
  return NextResponse.json({ ok: true });
}
