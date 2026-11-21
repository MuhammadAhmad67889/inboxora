import type { PrismaClient, Tag } from "@prisma/client";
import { getConversation } from "./inbox";
import { getPrisma } from "./prisma";

/**
 * Conversation tags: short labels ("VIP", "Complaint") the team
 * sticks on chats to organize the inbox. Tags belong to one
 * workspace; the link rows (ConversationTag) carry the
 * workspaceId too, so every query here is workspace-scoped in one
 * WHERE clause — one business can never see, attach or delete
 * another business's tags.
 *
 * Deleting a tag removes the label from every chat. It never
 * deletes a conversation.
 */

export const MAX_TAG_NAME_LENGTH = 40;

/** The only colors a tag may use. The stored value is the key,
 * never a raw CSS color, so user input can never inject styling.
 * The chip component maps keys to its own palette. */
export const TAG_COLORS = ["green", "blue", "purple", "amber", "red", "gray"] as const;
export type TagColor = (typeof TAG_COLORS)[number];

export function isTagColor(value: unknown): value is TagColor {
  return (
    value === "green" ||
    value === "blue" ||
    value === "purple" ||
    value === "amber" ||
    value === "red" ||
    value === "gray"
  );
}

/** Validate one tag's name. Returns an error message, or null
 * when the name is fine to save. */
export function validateTagName(name: string): string | null {
  if (!name.trim()) return "Give the tag a name.";
  if (name.trim().length > MAX_TAG_NAME_LENGTH) {
    return `Tag name is too long (max ${MAX_TAG_NAME_LENGTH} characters).`;
  }
  return null;
}

/** Normalize a color from untrusted input: a known palette key,
 * or null for the default chip look. */
function cleanColor(color: string | null | undefined): TagColor | null {
  return isTagColor(color) ? color : null;
}

/** Find a tag by name, case-insensitively ("vip" finds "VIP").
 * Tag counts per workspace are small, so this loads the list and
 * matches in memory — the same approach as conversation search,
 * because `mode: "insensitive"` does not exist on SQLite. */
async function findTagByName(
  workspaceId: string,
  name: string,
  db: PrismaClient,
): Promise<Tag | null> {
  const needle = name.trim().toLowerCase();
  const tags = await db.tag.findMany({ where: { workspaceId } });
  return tags.find((tag) => tag.name.toLowerCase() === needle) ?? null;
}

export type TagWithCount = Tag & { _count: { conversations: number } };

/** Every tag in the workspace, oldest first, with how many chats
 * carry it (shown in Settings). */
export async function listTags(
  workspaceId: string,
  db: PrismaClient = getPrisma(),
): Promise<TagWithCount[]> {
  return db.tag.findMany({
    include: { _count: { select: { conversations: true } } },
    orderBy: { createdAt: "asc" },
    where: { workspaceId },
  });
}

export type TagResult = { ok: true; tag: Tag } | { error: string; ok: false };

/** Create one tag. Refuses a name the workspace already has
 * (compared case-insensitively, so "vip" cannot shadow "VIP"). */
export async function createTag(
  workspaceId: string,
  data: { color?: string | null; name: string },
  db: PrismaClient = getPrisma(),
): Promise<TagResult> {
  const problem = validateTagName(data.name);
  if (problem) return { error: problem, ok: false };
  const existing = await findTagByName(workspaceId, data.name, db);
  if (existing) {
    return { error: `This workspace already has a tag called "${existing.name}".`, ok: false };
  }
  const tag = await db.tag.create({
    data: { color: cleanColor(data.color), name: data.name.trim(), workspaceId },
  });
  return { ok: true, tag };
}

/** Rename a tag and/or change its color. Workspace-scoped: a tag
 * id from another workspace changes nothing and reports
 * not-found. Renaming onto an existing name is refused. */
export async function updateTag(
  workspaceId: string,
  tagId: string,
  data: { color?: string | null; name: string },
  db: PrismaClient = getPrisma(),
): Promise<TagResult> {
  const problem = validateTagName(data.name);
  if (problem) return { error: problem, ok: false };
  const clash = await findTagByName(workspaceId, data.name, db);
  if (clash && clash.id !== tagId) {
    return { error: `This workspace already has a tag called "${clash.name}".`, ok: false };
  }
  const result = await db.tag.updateMany({
    data: { color: cleanColor(data.color), name: data.name.trim() },
    where: { id: tagId, workspaceId },
  });
  if (result.count === 0) return { error: "Tag not found.", ok: false };
  const tag = await db.tag.findFirst({ where: { id: tagId, workspaceId } });
  if (!tag) return { error: "Tag not found.", ok: false };
  return { ok: true, tag };
}

/** Delete one tag. Its links to conversations go with it (the
 * conversations themselves are untouched). Returns false when
 * the tag is not in this workspace. */
export async function deleteTag(
  workspaceId: string,
  tagId: string,
  db: PrismaClient = getPrisma(),
): Promise<boolean> {
  const result = await db.tag.deleteMany({
    where: { id: tagId, workspaceId },
  });
  return result.count > 0;
}

export type AttachResult = { ok: true } | { error: string; ok: false };

/** Attach an existing tag to a conversation. Both must belong to
 * this workspace. Attaching twice is fine — the second call is a
 * no-op, so a double-click never errors. */
export async function attachTag(
  workspaceId: string,
  conversationId: string,
  tagId: string,
  db: PrismaClient = getPrisma(),
): Promise<AttachResult> {
  const conversation = await getConversation(workspaceId, conversationId, db);
  if (!conversation) return { error: "Conversation not found.", ok: false };
  const tag = await db.tag.findFirst({ where: { id: tagId, workspaceId } });
  if (!tag) return { error: "Tag not found.", ok: false };

  const existing = await db.conversationTag.findFirst({
    where: { conversationId, tagId, workspaceId },
  });
  if (!existing) {
    await db.conversationTag.create({
      data: { conversationId, tagId, workspaceId },
    });
  }
  return { ok: true };
}

/** Create-or-reuse a tag by name and attach it — the "type a new
 * tag name in the conversation view" path. Reuses the existing
 * tag when the name already exists (case-insensitively). */
export async function attachTagByName(
  workspaceId: string,
  conversationId: string,
  data: { color?: string | null; name: string },
  db: PrismaClient = getPrisma(),
): Promise<TagResult> {
  const problem = validateTagName(data.name);
  if (problem) return { error: problem, ok: false };

  let tag = await findTagByName(workspaceId, data.name, db);
  if (!tag) {
    tag = await db.tag.create({
      data: { color: cleanColor(data.color), name: data.name.trim(), workspaceId },
    });
  }
  const attached = await attachTag(workspaceId, conversationId, tag.id, db);
  if (!attached.ok) return { error: attached.error, ok: false };
  return { ok: true, tag };
}

/** Remove a tag from one conversation. The tag itself stays in
 * the workspace for other chats. */
export async function detachTag(
  workspaceId: string,
  conversationId: string,
  tagId: string,
  db: PrismaClient = getPrisma(),
): Promise<boolean> {
  const result = await db.conversationTag.deleteMany({
    where: { conversationId, tagId, workspaceId },
  });
  return result.count > 0;
}

/** The tags on one conversation, oldest tag first. */
export async function listConversationTags(
  workspaceId: string,
  conversationId: string,
  db: PrismaClient = getPrisma(),
): Promise<Tag[]> {
  const links = await db.conversationTag.findMany({
    include: { tag: true },
    orderBy: { tag: { createdAt: "asc" } },
    where: { conversationId, workspaceId },
  });
  return links.map((link) => link.tag);
}
