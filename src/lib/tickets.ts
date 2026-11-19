import type { PrismaClient, Ticket } from "@prisma/client";
import { getConversation } from "./inbox";
import { getPrisma } from "./prisma";

/**
 * Tickets: chats that need a human. Created automatically when the
 * AI finds no answer in the FAQ ("ai-no-match"), or by hand from
 * the thread ("manual"). Every function is workspace-scoped.
 */

export const TICKET_STATUSES = ["open", "waiting", "resolved"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ["low", "normal", "high"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_SOURCES = ["ai-no-match", "manual"] as const;
export type TicketSource = (typeof TICKET_SOURCES)[number];

export function isTicketStatus(value: unknown): value is TicketStatus {
  return value === "open" || value === "waiting" || value === "resolved";
}

export function isTicketPriority(value: unknown): value is TicketPriority {
  return value === "low" || value === "normal" || value === "high";
}

export type TicketResult =
  | { ok: true; ticket: Ticket }
  | { error: string; ok: false };

export interface CreateTicketInput {
  conversationId: string;
  notes?: string;
  priority?: TicketPriority;
  source: TicketSource;
}

/** Create a ticket for a conversation in this workspace. The
 * conversation must belong to the workspace — a ticket can never
 * point at another business's chat. */
export async function createTicket(
  workspaceId: string,
  input: CreateTicketInput,
  db: PrismaClient = getPrisma(),
): Promise<TicketResult> {
  const conversation = await getConversation(workspaceId, input.conversationId, db);
  if (!conversation) return { error: "Conversation not found.", ok: false };
  const ticket = await db.ticket.create({
    data: {
      conversationId: input.conversationId,
      notes: input.notes?.trim().slice(0, 2000) || null,
      priority: input.priority ?? "normal",
      source: input.source,
      status: "open",
      workspaceId,
    },
  });
  return { ok: true, ticket };
}

export type TicketWithConversation = Ticket & {
  conversation: {
    contact: { name: string | null; phone: string };
    id: string;
    isDemo: boolean;
    status: string;
  };
};

/** List a workspace's tickets, newest first, optionally by status. */
export async function listTickets(
  workspaceId: string,
  db: PrismaClient = getPrisma(),
  status?: TicketStatus,
): Promise<TicketWithConversation[]> {
  return db.ticket.findMany({
    include: {
      conversation: {
        select: {
          contact: { select: { name: true, phone: true } },
          id: true,
          isDemo: true,
          status: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    where: { workspaceId, ...(status ? { status } : {}) },
  });
}

export async function getTicket(
  workspaceId: string,
  ticketId: string,
  db: PrismaClient = getPrisma(),
): Promise<Ticket | null> {
  return db.ticket.findFirst({ where: { id: ticketId, workspaceId } });
}

/** Change a ticket's status. Workspace-scoped: another workspace's
 * ticket id changes nothing and reports not-found. */
export async function setTicketStatus(
  workspaceId: string,
  ticketId: string,
  status: TicketStatus,
  db: PrismaClient = getPrisma(),
): Promise<{ ok: true } | { error: string; ok: false }> {
  const result = await db.ticket.updateMany({
    data: { status },
    where: { id: ticketId, workspaceId },
  });
  if (result.count === 0) return { error: "Ticket not found.", ok: false };
  return { ok: true };
}
