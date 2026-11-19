import { NextResponse } from "next/server";
import { checkDatabase } from "@/lib/health";

export const dynamic = "force-dynamic";

/** Liveness + database check for uptime monitors. No auth: it
 * reveals nothing beyond "up" or "down". */
export async function GET() {
  const databaseUp = await checkDatabase();
  return NextResponse.json(
    { database: databaseUp ? "up" : "down", status: databaseUp ? "ok" : "error" },
    { status: databaseUp ? 200 : 503 },
  );
}
