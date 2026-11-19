import type { PrismaClient } from "@prisma/client";
import { getPrisma } from "./prisma";

/** One cheap round-trip that proves the database answers.
 * Used by /api/health so uptime checks see a real signal, not
 * just "the web server is up". */
export async function checkDatabase(db: PrismaClient = getPrisma()): Promise<boolean> {
  try {
    await db.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
