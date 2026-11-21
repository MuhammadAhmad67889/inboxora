import type { Conversation, Message, Prisma, PrismaClient } from "@prisma/client";
import { getPrisma } from "./prisma";

/**
 * The inbox data layer. Every function takes workspaceId and puts
 * it in the WHERE clause — there is no way to ask for a conversation
 * "by id only". The isolation tests prove that a workspace cannot
 * read or write another workspace's rows through these functions.
 */

export type ConversationTagView = {
  color: string | null;
  id: string;
  name: string;
};

export type ConversationWithContact = Conversation & {
  assignee: { email: string; id: string; name: string | null } | null;
  contact: { id: string; name: string | null; phone: string };
  tags: ConversationTagView[];
};

const conversationInclude = {
  assignee: { select: { email: true, id: true, name: true } },
  contact: { select: { id: true, name: true, phone: true } },
  tags: {
    orderBy: { tag: { createdAt: "asc" } },
    select: { tag: { select: { color: true, id: true, name: true } } },
  },
} as const;

/** The include above returns link rows ({ tag: {...} }); flatten
 * them so callers always get plain tag objects. */
function withFlatTags(
  chat: Omit<ConversationWithContact, "tags"> & {
    tags: Array<{ tag: ConversationTagView }>;
  },
): ConversationWithContact {
  return { ...chat, tags: chat.tags.map((link) => link.tag) };
}

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
  /** Free-text search over the contact's name and phone, and the
   * text of every message in the chat. Case-insensitive. */
  search?: string;
  /** A teammate's user id, or UNASSIGNED for chats nobody owns yet.
   * Combines with kind: every active filter must match. */
  assignee?: string;
  /** Only chats carrying this tag. The caller validates the id
   * against the workspace's real tags first. */
  tagId?: string;
  /** Only chats with exactly this priority ("low" | "normal" |
   * "high" | "urgent"). */
  priority?: string;
  /** "priority" puts urgent chats first (then high, normal,
   * low), newest first inside each band. Default: newest first. */
  sort?: ConversationSort;
}

export type ConversationSort = "recent" | "priority";

export function isConversationSort(value: unknown): value is ConversationSort {
  return value === "recent" || value === "priority";
}

/** The assignee filter value meaning "no assignee". A real user id
 * is a cuid, so this word can never collide with one. */
export const UNASSIGNED = "unassigned";

/** Build the WHERE clause for the kind + assignee + tag +
 * priority filters. Search text is handled separately (see
 * listConversations). */
function conversationWhere(
  workspaceId: string,
  kind: ConversationFilterKind,
  filter: ConversationFilter,
): Prisma.ConversationWhereInput {
  const conditions: Prisma.ConversationWhereInput[] = [];
  if (kind === "unread") conditions.push({ unreadCount: { gt: 0 } });
  if (kind === "resolved") conditions.push({ status: "resolved" });
  if (kind === "mine" && filter.userId) {
    conditions.push({ assigneeId: filter.userId });
  }
  if (filter.assignee === UNASSIGNED) {
    conditions.push({ assigneeId: null });
  } else if (filter.assignee) {
    conditions.push({ assigneeId: filter.assignee });
  }
  if (filter.tagId) {
    conditions.push({
      tags: { some: { tagId: filter.tagId, workspaceId } },
    });
  }
  if (filter.priority) {
    conditions.push({ priority: filter.priority });
  }
  return {
    workspaceId,
    ...(conditions.length > 0 ? { AND: conditions } : {}),
  };
}

/** Does this chat match the (already lowercased) search text?
 * Checks the contact's name and phone, then every message. */
function conversationMatchesSearch(
  chat: {
    contact: { name: string | null; phone: string };
    messages: Array<{ text: string }>;
  },
  needle: string,
): boolean {
  const fields = [chat.contact.name, chat.contact.phone];
  if (fields.some((field) => (field ?? "").toLowerCase().includes(needle))) {
    return true;
  }
  return chat.messages.some((message) =>
    message.text.toLowerCase().includes(needle),
  );
}

/** Conversation priorities, least to most urgent. Plain strings
 * in the database (SQLite has no enum); validate with
 * isConversationPriority before saving. */
export const CONVERSATION_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type ConversationPriority = (typeof CONVERSATION_PRIORITIES)[number];

export function isConversationPriority(value: unknown): value is ConversationPriority {
  return (
    value === "low" || value === "normal" || value === "high" || value === "urgent"
  );
}

/** Sort rank for priorities. SQL cannot rank these strings
 * (alphabetically "high" < "low" < "normal" < "urgent"), so the
 * priority sort happens in memory. Unknown values rank as normal. */
export function priorityRank(priority: string): number {
  switch (priority) {
    case "urgent":
      return 3;
    case "high":
      return 2;
    case "low":
      return 0;
    default:
      return 1;
  }
}

export async function listConversations(
  workspaceId: string,
  db: PrismaClient = getPrisma(),
  filter: ConversationFilter = {},
): Promise<ConversationWithContact[]> {
  const kind = filter.kind ?? "all";
  const where = conversationWhere(workspaceId, kind, filter);
  const search = filter.search?.trim().toLowerCase() ?? "";

  let chats: ConversationWithContact[];
  if (!search) {
    const rows = await db.conversation.findMany({
      include: conversationInclude,
      orderBy: { lastMessageAt: "desc" },
      where,
    });
    chats = rows.map(withFlatTags);
  } else {
    // Text search runs in memory, not in SQL: Prisma's
    // `mode: "insensitive"` does not exist on SQLite (tests/local),
    // and plain `contains` is case-sensitive on Postgres
    // (production) — matching here keeps both databases behaving
    // the same, the same approach as knowledgeSearch.ts. The inbox
    // list already loads every chat in the workspace, so this only
    // adds the message texts while searching.
    const rows = await db.conversation.findMany({
      include: { ...conversationInclude, messages: { select: { text: true } } },
      orderBy: { lastMessageAt: "desc" },
      where,
    });
    chats = rows
      .filter((chat) => conversationMatchesSearch(chat, search))
      .map((chat) => {
        // The message texts were loaded only for searching; drop
        // them so callers always get the plain conversation shape.
        const { messages, ...conversation } = chat;
        void messages;
        return withFlatTags(conversation);
      });
  }

  if (filter.sort === "priority") {
    // Urgent first; newest first inside each priority band. The
    // list is already newest-first, and Array.sort is stable, so
    // sorting by rank alone keeps the recency order within bands.
    chats = [...chats].sort(
      (a, b) => priorityRank(b.priority) - priorityRank(a.priority),
    );
  }
  return chats;
}

export async function getConversation(
  workspaceId: string,
  conversationId: string,
  db: PrismaClient = getPrisma(),
): Promise<ConversationWithContact | null> {
  const chat = await db.conversation.findFirst({
    include: conversationInclude,
    where: { id: conversationId, workspaceId },
  });
  return chat ? withFlatTags(chat) : null;
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
