import type { PrismaClient } from "@prisma/client";
import { getPrisma } from "./prisma";
import { listMembers } from "./workspaces";

/**
 * Analytics for one workspace. Two layers:
 *
 * - Pure functions that take plain rows and return numbers. They
 *   never touch the database, so the tests can feed them exact
 *   hand-built data and assert exact results.
 * - One fetcher (getAnalytics) that loads the workspace's rows
 *   and hands them to the pure functions.
 *
 * Honesty rules, same as the rest of the app:
 * - Only metrics the stored data actually supports. There is no
 *   "resolved at" timestamp, so resolution is "of the chats
 *   started in this period, how many are resolved now".
 * - AI draft outcomes come from DraftEvent rows, which exist only
 *   since that tracking shipped. The page says so.
 * - Empty data produces zeros and nulls, never invented numbers.
 */

export interface ConversationRow {
  assigneeId: string | null;
  createdAt: Date;
  id: string;
  priority: string;
  status: string;
  unreadCount: number;
}

export interface MessageRow {
  conversationId: string;
  createdAt: Date;
  direction: string;
}

export interface TicketRow {
  createdAt: Date;
  source: string;
  status: string;
}

export interface DraftEventRow {
  createdAt: Date;
  outcome: string;
}

export interface TagLinkRow {
  conversationId: string;
  tagId: string;
}

export interface MemberRow {
  email: string;
  id: string;
  name: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The middle value of a list, or null when the list is empty.
 * For an even count it is the mean of the two middle values. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

/** The mean of a list, or null when the list is empty. */
export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Messages of one conversation in time order. The input rows
 * may arrive in any order, so always sort a copy. */
function inTimeOrder(messages: MessageRow[]): MessageRow[] {
  return [...messages].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
}

function groupByConversation(
  messages: MessageRow[],
): Map<string, MessageRow[]> {
  const grouped = new Map<string, MessageRow[]>();
  for (const message of messages) {
    const list = grouped.get(message.conversationId) ?? [];
    list.push(message);
    grouped.set(message.conversationId, list);
  }
  return grouped;
}

/**
 * First-response time per conversation, in milliseconds: the
 * first customer message → the first business reply after it.
 * Conversations with no reply yet contribute nothing.
 */
export function firstResponseTimesMs(messages: MessageRow[]): number[] {
  const times: number[] = [];
  for (const thread of groupByConversation(messages).values()) {
    let firstCustomerAt: number | null = null;
    for (const message of inTimeOrder(thread)) {
      if (message.direction === "in" && firstCustomerAt === null) {
        firstCustomerAt = message.createdAt.getTime();
      } else if (message.direction === "out" && firstCustomerAt !== null) {
        times.push(message.createdAt.getTime() - firstCustomerAt);
        break;
      }
    }
  }
  return times;
}

/**
 * Every reply wait, in milliseconds: each business reply measured
 * from the earliest customer message that was still unanswered.
 * A customer who sends three messages in a row waits from the
 * first one — that is the wait they actually felt.
 */
export function replyTimesMs(messages: MessageRow[]): number[] {
  const times: number[] = [];
  for (const thread of groupByConversation(messages).values()) {
    let waitingSince: number | null = null;
    for (const message of inTimeOrder(thread)) {
      if (message.direction === "in") {
        if (waitingSince === null) waitingSince = message.createdAt.getTime();
      } else if (message.direction === "out" && waitingSince !== null) {
        times.push(message.createdAt.getTime() - waitingSince);
        waitingSince = null;
      }
    }
  }
  return times;
}

export interface DayCount {
  /** "2026-11-21" (UTC day). */
  date: string;
  count: number;
}

/**
 * Conversations started per day for the last `days` days, oldest
 * first, including zero days so the chart has no gaps. Days are
 * UTC days — simple and consistent; a business in another
 * timezone may see a late-night chat land on the neighbouring
 * bar, which is acceptable for a volume chart.
 */
export function conversationsPerDay(
  conversations: ConversationRow[],
  days: number,
  now: Date,
): DayCount[] {
  const buckets: DayCount[] = [];
  const byDate = new Map<string, number>();
  for (let offset = days - 1; offset >= 0; offset--) {
    const date = new Date(now.getTime() - offset * DAY_MS)
      .toISOString()
      .slice(0, 10);
    byDate.set(date, 0);
    buckets.push({ count: 0, date });
  }
  for (const conversation of conversations) {
    const date = conversation.createdAt.toISOString().slice(0, 10);
    if (byDate.has(date)) byDate.set(date, (byDate.get(date) ?? 0) + 1);
  }
  return buckets.map((bucket) => ({
    count: byDate.get(bucket.date) ?? 0,
    date: bucket.date,
  }));
}

export interface DraftSummary {
  /** Drafts the agent sent (as-is + edited) ÷ drafts decided
   * (sent + discarded). Null when nothing was decided yet. */
  acceptanceRate: number | null;
  discarded: number;
  edited: number;
  generated: number;
  sentAsIs: number;
  sentTotal: number;
}

export function summarizeDrafts(events: DraftEventRow[]): DraftSummary {
  let generated = 0;
  let sentAsIs = 0;
  let edited = 0;
  let discarded = 0;
  for (const event of events) {
    if (event.outcome === "generated") generated += 1;
    else if (event.outcome === "sent-as-is") sentAsIs += 1;
    else if (event.outcome === "edited") edited += 1;
    else if (event.outcome === "discarded") discarded += 1;
  }
  const sentTotal = sentAsIs + edited;
  const decided = sentTotal + discarded;
  return {
    acceptanceRate: decided > 0 ? sentTotal / decided : null,
    discarded,
    edited,
    generated,
    sentAsIs,
    sentTotal,
  };
}

export interface AssigneeCount {
  assigned: number;
  label: string;
  resolved: number;
  userId: string;
}

/** Conversations per team member (assigned + resolved), plus the
 * unassigned count. Members with no chats still appear with
 * zeros so the whole team is visible. */
export function perAssignee(
  conversations: ConversationRow[],
  members: MemberRow[],
): { rows: AssigneeCount[]; unassigned: number } {
  const rows = members.map((member) => ({
    assigned: 0,
    label: member.name ?? member.email,
    resolved: 0,
    userId: member.id,
  }));
  const byId = new Map(rows.map((row) => [row.userId, row]));
  let unassigned = 0;
  for (const conversation of conversations) {
    if (!conversation.assigneeId) {
      unassigned += 1;
      continue;
    }
    const row = byId.get(conversation.assigneeId);
    if (!row) continue; // assignee left the workspace; not a member row
    row.assigned += 1;
    if (conversation.status === "resolved") row.resolved += 1;
  }
  return { rows, unassigned };
}

export interface NamedCount {
  count: number;
  label: string;
}

/** Conversations per tag. Only tags carried by at least one chat
 * in the period are listed. */
export function perTag(
  links: TagLinkRow[],
  tags: Array<{ id: string; name: string }>,
): NamedCount[] {
  const counts = new Map<string, number>();
  for (const link of links) {
    counts.set(link.tagId, (counts.get(link.tagId) ?? 0) + 1);
  }
  return tags
    .map((tag) => ({ count: counts.get(tag.id) ?? 0, label: tag.name }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Conversations per priority, in severity order. */
export function perPriority(conversations: ConversationRow[]): NamedCount[] {
  const order = ["urgent", "high", "normal", "low"];
  const counts = new Map<string, number>();
  for (const conversation of conversations) {
    counts.set(
      conversation.priority,
      (counts.get(conversation.priority) ?? 0) + 1,
    );
  }
  return order.map((priority) => ({
    count: counts.get(priority) ?? 0,
    label: priority,
  }));
}

/** Human-readable duration for the page: "45 sec", "12 min",
 * "2 h 5 min", "3 days". Null (no data) shows as a dash. */
export function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest > 0 ? `${hours} h ${rest} min` : `${hours} h`;
  }
  const days = Math.round(hours / 24);
  return days === 1 ? "1 day" : `${days} days`;
}

export interface Analytics {
  assignees: AssigneeCount[];
  conversations: {
    open: number;
    perDay: DayCount[];
    resolved: number;
    /** resolved ÷ total in period; null when no chats in period. */
    resolutionRate: number | null;
    total: number;
    /** Unread customer messages right now, across all chats. */
    unreadNow: number;
  };
  drafts: DraftSummary & {
    /** Drafts generated but not yet approved or discarded. */
    waitingNow: number;
  };
  priorities: NamedCount[];
  responseTimes: {
    firstAverageMs: number | null;
    firstMedianMs: number | null;
    /** How many conversations had a first reply to measure. */
    firstSamples: number;
    replyAverageMs: number | null;
    replyMedianMs: number | null;
    replySamples: number;
  };
  tags: NamedCount[];
  tickets: {
    /** Tickets the AI created when it found no answer. */
    aiNoMatch: number;
    created: number;
    resolved: number;
    stillOpen: number;
  };
  unassigned: number;
}

/**
 * Load one workspace's rows and compute every metric. Period
 * metrics cover conversations started in the last `days` days
 * (and the messages inside them); "now" figures (unread, drafts
 * waiting) are current totals. Every query is workspace-scoped.
 */
export async function getAnalytics(
  workspaceId: string,
  days: number,
  db: PrismaClient = getPrisma(),
  now: Date = new Date(),
): Promise<Analytics> {
  const since = new Date(now.getTime() - days * DAY_MS);

  const allConversations = await db.conversation.findMany({
    select: {
      assigneeId: true,
      createdAt: true,
      id: true,
      priority: true,
      status: true,
      unreadCount: true,
    },
    where: { workspaceId },
  });
  const inPeriod = allConversations.filter(
    (conversation) => conversation.createdAt >= since,
  );
  const periodIds = inPeriod.map((conversation) => conversation.id);

  const [messages, tickets, draftEvents, waitingNow, tags, tagLinks, members] =
    await Promise.all([
      periodIds.length > 0
        ? db.message.findMany({
            select: { conversationId: true, createdAt: true, direction: true },
            where: {
              conversationId: { in: periodIds },
              status: "sent",
              workspaceId,
            },
          })
        : Promise.resolve([]),
      db.ticket.findMany({
        select: { createdAt: true, source: true, status: true },
        where: { createdAt: { gte: since }, workspaceId },
      }),
      db.draftEvent.findMany({
        select: { createdAt: true, outcome: true },
        where: { createdAt: { gte: since }, workspaceId },
      }),
      db.message.count({ where: { status: "draft", workspaceId } }),
      db.tag.findMany({
        select: { id: true, name: true },
        where: { workspaceId },
      }),
      periodIds.length > 0
        ? db.conversationTag.findMany({
            select: { conversationId: true, tagId: true },
            where: { conversationId: { in: periodIds }, workspaceId },
          })
        : Promise.resolve([]),
      listMembers(workspaceId, db),
    ]);

  const resolved = inPeriod.filter((c) => c.status === "resolved").length;
  const firstTimes = firstResponseTimesMs(messages);
  const replyTimes = replyTimesMs(messages);
  const { rows: assignees, unassigned } = perAssignee(
    inPeriod,
    members.map((member) => ({
      email: member.user.email,
      id: member.user.id,
      name: member.user.name,
    })),
  );

  return {
    assignees,
    conversations: {
      open: inPeriod.length - resolved,
      perDay: conversationsPerDay(inPeriod, days, now),
      resolved,
      resolutionRate:
        inPeriod.length > 0 ? resolved / inPeriod.length : null,
      total: inPeriod.length,
      unreadNow: allConversations.reduce(
        (sum, conversation) => sum + conversation.unreadCount,
        0,
      ),
    },
    drafts: { ...summarizeDrafts(draftEvents), waitingNow },
    priorities: perPriority(inPeriod),
    responseTimes: {
      firstAverageMs: average(firstTimes),
      firstMedianMs: median(firstTimes),
      firstSamples: firstTimes.length,
      replyAverageMs: average(replyTimes),
      replyMedianMs: median(replyTimes),
      replySamples: replyTimes.length,
    },
    tags: perTag(tagLinks, tags),
    tickets: {
      aiNoMatch: tickets.filter((t) => t.source === "ai-no-match").length,
      created: tickets.length,
      resolved: tickets.filter((t) => t.status === "resolved").length,
      stillOpen: tickets.filter((t) => t.status !== "resolved").length,
    },
    unassigned,
  };
}
