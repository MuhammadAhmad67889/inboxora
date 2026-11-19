import type { Conversation, Message, PrismaClient } from "@prisma/client";
import { getPrisma } from "./prisma";

/**
 * The inbox data layer. Every function takes workspaceId and puts
 * it in the WHERE clause — there is no way to ask for a conversation
 * "by id only". The isolation tests prove that a workspace cannot
 * read or write another workspace's rows through these functions.
 */

export type ConversationWithContact = Conversation & {
  assignee: { email: string; id: string; name: string | null } | null;
  contact: { id: string; name: string | null; phone: string };
};

const conversationInclude = {
  assignee: { select: { email: true, id: true, name: true } },
  contact: { select: { id: true, name: true, phone: true } },
} as const;

export type ConversationFilterKind = "all" | "mine" | "resolved" | "unread";

export function isConversationFilterKind(
  value: unknown,
): value is ConversationFilterKind {
  return (
    value === "all" || value === "mine" || value === "resolved" || value === "unread"
  );
}

export interface ConversationFilter {
  kind?: ConversationFilterKind;
  /** Needed for the "mine" filter: only chats assigned to this user. */
  userId?: string;
}

export async function listConversations(
  workspaceId: string,
  db: PrismaClient = getPrisma(),
  filter: ConversationFilter = {},
): Promise<ConversationWithContact[]> {
  const kind = filter.kind ?? "all";
  return db.conversation.findMany({
    include: conversationInclude,
    orderBy: { lastMessageAt: "desc" },
    where: {
      workspaceId,
      ...(kind === "unread" ? { unreadCount: { gt: 0 } } : {}),
      ...(kind === "resolved" ? { status: "resolved" } : {}),
      ...(kind === "mine" && filter.userId ? { assigneeId: filter.userId } : {}),
    },
  });
}

export async function getConversation(
  workspaceId: string,
  conversationId: string,
  db: PrismaClient = getPrisma(),
): Promise<ConversationWithContact | null> {
  return db.conversation.findFirst({
    include: conversationInclude,
    where: { id: conversationId, workspaceId },
  });
}

export async function listMessages(
  workspaceId: string,
  conversationId: string,
  db: PrismaClient = getPrisma(),
): Promise<Message[]> {
  return db.message.findMany({
    orderBy: { createdAt: "asc" },
    where: { conversationId, workspaceId },
  });
}

/** Mark a conversation read. Returns false when the conversation is
 * not in this workspace (nothing was changed). */
export async function markConversationRead(
  workspaceId: string,
  conversationId: string,
  db: PrismaClient = getPrisma(),
): Promise<boolean> {
  const result = await db.conversation.updateMany({
    data: { unreadCount: 0 },
    where: { id: conversationId, workspaceId },
  });
  return result.count > 0;
}

export async function listContacts(
  workspaceId: string,
  db: PrismaClient = getPrisma(),
) {
  return db.contact.findMany({
    orderBy: { createdAt: "asc" },
    where: { workspaceId },
  });
}

export async function listKnowledgeEntries(
  workspaceId: string,
  db: PrismaClient = getPrisma(),
) {
  return db.knowledgeEntry.findMany({
    orderBy: { createdAt: "asc" },
    where: { workspaceId },
  });
}

export async function getKnowledgeEntry(
  workspaceId: string,
  entryId: string,
  db: PrismaClient = getPrisma(),
) {
  return db.knowledgeEntry.findFirst({
    where: { id: entryId, workspaceId },
  });
}

export async function updateKnowledgeEntry(
  workspaceId: string,
  entryId: string,
  data: { content?: string; title?: string },
  db: PrismaClient = getPrisma(),
): Promise<boolean> {
  const result = await db.knowledgeEntry.updateMany({
    data,
    where: { id: entryId, workspaceId },
  });
  return result.count > 0;
}

export async function deleteKnowledgeEntry(
  workspaceId: string,
  entryId: string,
  db: PrismaClient = getPrisma(),
): Promise<boolean> {
  const result = await db.knowledgeEntry.deleteMany({
    where: { id: entryId, workspaceId },
  });
  return result.count > 0;
}

export const MAX_KNOWLEDGE_TITLE_LENGTH = 200;
export const MAX_KNOWLEDGE_CONTENT_LENGTH = 5000;

/** Validate one FAQ entry's fields. Returns an error message, or
 * null when the entry is fine to save. */
export function validateKnowledgeEntry(title: string, content: string): string | null {
  if (!title.trim()) return "Give the entry a title (the question).";
  if (title.trim().length > MAX_KNOWLEDGE_TITLE_LENGTH) {
    return `Title is too long (max ${MAX_KNOWLEDGE_TITLE_LENGTH} characters).`;
  }
  if (!content.trim()) return "Write the answer for this entry.";
  if (content.trim().length > MAX_KNOWLEDGE_CONTENT_LENGTH) {
    return `Answer is too long (max ${MAX_KNOWLEDGE_CONTENT_LENGTH} characters).`;
  }
  return null;
}

export async function createKnowledgeEntry(
  workspaceId: string,
  data: { content: string; title: string },
  updatedById: string | null,
  db: PrismaClient = getPrisma(),
) {
  return db.knowledgeEntry.create({
    data: {
      content: data.content.trim(),
      title: data.title.trim(),
      updatedById,
      workspaceId,
    },
  });
}

export interface BusinessProfileFields {
  address: string;
  businessName: string;
  hours: string;
  policies: string;
}

export async function getBusinessProfile(
  workspaceId: string,
  db: PrismaClient = getPrisma(),
) {
  return db.businessProfile.findUnique({ where: { workspaceId } });
}

/** Save the business facts form. One profile per workspace, created
 * on first save and updated after that. */
export async function upsertBusinessProfile(
  workspaceId: string,
  fields: BusinessProfileFields,
  db: PrismaClient = getPrisma(),
) {
  const data = {
    address: fields.address.trim().slice(0, 1000),
    businessName: fields.businessName.trim().slice(0, 200),
    hours: fields.hours.trim().slice(0, 1000),
    policies: fields.policies.trim().slice(0, 5000),
  };
  return db.businessProfile.upsert({
    create: { ...data, workspaceId },
    update: data,
    where: { workspaceId },
  });
}
