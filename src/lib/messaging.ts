import type { ConversationNote, Message, PrismaClient } from "@prisma/client";
import { getConversation } from "./inbox";
import { getPrisma } from "./prisma";
import { getMembership } from "./workspaces";

/**
 * Sending messages. Everything outbound goes through a provider so
 * the demo never pretends to talk to WhatsApp: DemoProvider records
 * the message in the database and sends nothing externally. The real
 * Cloud API provider arrives in a later phase behind this same
 * interface.
 */

export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_NOTE_LENGTH = 2000;

export interface OutboundMessage {
  conversationId: string;
  isDemo: boolean;
  senderId: string;
  text: string;
  workspaceId: string;
}

export interface MessageProvider {
  /** "Deliver" one outbound message. Returns the status to store. */
  send(message: OutboundMessage): Promise<{ status: string }>;
}

/** Demo provider: the message is recorded by the caller; nothing
 * leaves this server. That honesty is the point of demo mode. */
export const demoProvider: MessageProvider = {
  async send() {
    return { status: "sent" };
  },
};

export type SendResult =
  | { message: Message; ok: true }
  | { error: string; ok: false };

function cleanText(text: string, maxLength: number): string | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  return trimmed;
}

/**
 * An agent replies in a conversation. The conversation must belong
 * to the workspace; the message is stored as an outbound agent
 * message and the conversation's lastMessageAt moves so the inbox
 * sorts correctly.
 */
export async function sendAgentReply(
  workspaceId: string,
  conversationId: string,
  senderId: string,
  text: string,
  db: PrismaClient = getPrisma(),
  provider: MessageProvider = demoProvider,
): Promise<SendResult> {
  const cleaned = cleanText(text, MAX_MESSAGE_LENGTH);
  if (!cleaned) {
    return { error: "Write a message first (up to 2000 characters).", ok: false };
  }
  const conversation = await getConversation(workspaceId, conversationId, db);
  if (!conversation) return { error: "Conversation not found.", ok: false };

  const { status } = await provider.send({
    conversationId,
    isDemo: conversation.isDemo,
    senderId,
    text: cleaned,
    workspaceId,
  });

  const message = await db.message.create({
    data: {
      authorType: "agent",
      conversationId,
      direction: "out",
      isDemo: conversation.isDemo,
      senderId,
      status,
      text: cleaned,
      workspaceId,
    },
  });
  await db.conversation.update({
    data: { lastMessageAt: message.createdAt },
    where: { id: conversationId },
  });
  return { message, ok: true };
}

const DEMO_CUSTOMER_LINES = [
  "Thank you! And what are your delivery charges?",
  "Okay, please also tell me your return policy.",
  "Got it. Can I pay cash on delivery?",
  "One more question — do you deliver on Sunday?",
];

/**
 * Demo only: pretend the customer sent another message, so the full
 * loop (reply → customer answers → reply) can be tried without a
 * WhatsApp number. Refused for non-demo conversations so a real chat
 * can never gain a fake customer message. A resolved chat reopens,
 * because a new customer message means the conversation is alive.
 */
export async function simulateCustomerMessage(
  workspaceId: string,
  conversationId: string,
  text: string | undefined,
  db: PrismaClient = getPrisma(),
): Promise<SendResult> {
  const conversation = await getConversation(workspaceId, conversationId, db);
  if (!conversation) return { error: "Conversation not found.", ok: false };
  if (!conversation.isDemo) {
    return { error: "Simulated messages only work in demo chats.", ok: false };
  }

  const cleaned =
    (text ? cleanText(text, MAX_MESSAGE_LENGTH) : null) ??
    DEMO_CUSTOMER_LINES[Math.floor(Math.random() * DEMO_CUSTOMER_LINES.length)];

  const message = await db.message.create({
    data: {
      authorType: "customer",
      conversationId,
      direction: "in",
      isDemo: true,
      status: "sent",
      text: cleaned,
      workspaceId,
    },
  });
  await db.conversation.update({
    data: {
      lastMessageAt: message.createdAt,
      status: "open",
      unreadCount: { increment: 1 },
    },
    where: { id: conversationId },
  });
  return { message, ok: true };
}

export type AssignResult = { ok: true } | { error: string; ok: false };

/**
 * Assign a conversation to a teammate, or unassign with null. The
 * assignee must be a member of this workspace — assigning to an
 * outsider (or a member of another workspace) is refused.
 */
export async function assignConversation(
  workspaceId: string,
  conversationId: string,
  assigneeId: string | null,
  db: PrismaClient = getPrisma(),
): Promise<AssignResult> {
  const conversation = await getConversation(workspaceId, conversationId, db);
  if (!conversation) return { error: "Conversation not found.", ok: false };
  if (assigneeId !== null) {
    const membership = await getMembership(assigneeId, workspaceId, db);
    if (!membership) {
      return { error: "That person is not a member of this workspace.", ok: false };
    }
  }
  await db.conversation.update({
    data: { assigneeId },
    where: { id: conversationId },
  });
  return { ok: true };
}

export const CONVERSATION_STATUSES = ["open", "resolved"] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export function isConversationStatus(value: unknown): value is ConversationStatus {
  return value === "open" || value === "resolved";
}

/** Resolve a conversation, or reopen it. Workspace-scoped. */
export async function setConversationStatus(
  workspaceId: string,
  conversationId: string,
  status: ConversationStatus,
  db: PrismaClient = getPrisma(),
): Promise<AssignResult> {
  const result = await db.conversation.updateMany({
    data: { status },
    where: { id: conversationId, workspaceId },
  });
  if (result.count === 0) return { error: "Conversation not found.", ok: false };
  return { ok: true };
}

export type NoteResult =
  | { note: ConversationNote; ok: true }
  | { error: string; ok: false };

/** Add an internal note. Notes live in their own table, so they can
 * never appear in the customer-facing message list. */
export async function addNote(
  workspaceId: string,
  conversationId: string,
  authorId: string,
  text: string,
  db: PrismaClient = getPrisma(),
): Promise<NoteResult> {
  const cleaned = cleanText(text, MAX_NOTE_LENGTH);
  if (!cleaned) {
    return { error: "Write a note first (up to 2000 characters).", ok: false };
  }
  const conversation = await getConversation(workspaceId, conversationId, db);
  if (!conversation) return { error: "Conversation not found.", ok: false };
  const note = await db.conversationNote.create({
    data: { authorId, conversationId, text: cleaned, workspaceId },
  });
  return { note, ok: true };
}

export type NoteWithAuthor = ConversationNote & {
  author: { email: string; id: string; name: string | null };
};

export async function listNotes(
  workspaceId: string,
  conversationId: string,
  db: PrismaClient = getPrisma(),
): Promise<NoteWithAuthor[]> {
  return db.conversationNote.findMany({
    include: { author: { select: { email: true, id: true, name: true } } },
    orderBy: { createdAt: "asc" },
    where: { conversationId, workspaceId },
  });
}
