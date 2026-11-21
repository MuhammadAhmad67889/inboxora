import type { PrismaClient } from "@prisma/client";
import { getPrisma } from "./prisma";

/**
 * Quick replies: saved reply templates a workspace's team can
 * insert into the reply box. Workspace-scoped like everything
 * else — every function takes workspaceId and puts it in the
 * WHERE clause, so one workspace can never read or change
 * another's templates.
 *
 * Inserting a quick reply never sends anything; it only fills
 * the draft for a person to review (see quickReplyText.ts).
 */

export const MAX_QUICK_REPLY_TITLE_LENGTH = 100;
// Matches the reply box limit, so an inserted reply always fits.
export const MAX_QUICK_REPLY_BODY_LENGTH = 2000;

/** Validate one quick reply's fields. Returns an error message,
 * or null when the reply is fine to save. */
export function validateQuickReply(title: string, body: string): string | null {
  if (!title.trim()) return "Give the quick reply a short title.";
  if (title.trim().length > MAX_QUICK_REPLY_TITLE_LENGTH) {
    return `Title is too long (max ${MAX_QUICK_REPLY_TITLE_LENGTH} characters).`;
  }
  if (!body.trim()) return "Write the reply text.";
  if (body.trim().length > MAX_QUICK_REPLY_BODY_LENGTH) {
    return `Reply is too long (max ${MAX_QUICK_REPLY_BODY_LENGTH} characters).`;
  }
  return null;
}

export async function listQuickReplies(
  workspaceId: string,
  db: PrismaClient = getPrisma(),
) {
  return db.quickReply.findMany({
    orderBy: { createdAt: "asc" },
    where: { workspaceId },
  });
}

export async function createQuickReply(
  workspaceId: string,
  data: { body: string; title: string },
  createdById: string | null,
  db: PrismaClient = getPrisma(),
) {
  return db.quickReply.create({
    data: {
      body: data.body.trim(),
      createdById,
      title: data.title.trim(),
      workspaceId,
    },
  });
}

/** Update one quick reply. Returns false when it is not in this
 * workspace (nothing was changed). */
export async function updateQuickReply(
  workspaceId: string,
  quickReplyId: string,
  data: { body: string; title: string },
  db: PrismaClient = getPrisma(),
): Promise<boolean> {
  const result = await db.quickReply.updateMany({
    data: { body: data.body.trim(), title: data.title.trim() },
    where: { id: quickReplyId, workspaceId },
  });
  return result.count > 0;
}

/** Delete one quick reply. Returns false when it is not in this
 * workspace (nothing was changed). */
export async function deleteQuickReply(
  workspaceId: string,
  quickReplyId: string,
  db: PrismaClient = getPrisma(),
): Promise<boolean> {
  const result = await db.quickReply.deleteMany({
    where: { id: quickReplyId, workspaceId },
  });
  return result.count > 0;
}
