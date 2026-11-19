import { PrismaClient } from "@prisma/client";

// One client for the whole process. Next.js dev mode reloads modules
// on every change, so the client is cached on globalThis to avoid
// opening a new connection pool per reload.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient();
  }
  return globalForPrisma.prisma;
}
