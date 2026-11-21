import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  average,
  conversationsPerDay,
  firstResponseTimesMs,
  formatDuration,
  getAnalytics,
  median,
  perAssignee,
  perPriority,
  perTag,
  replyTimesMs,
  summarizeDrafts,
  type MessageRow,
} from "./analytics";
import { approveDraft, discardDraft, draftReply } from "./aiDraft";
import { hashPassword } from "./auth";
import { seedDemoData } from "./demoSeed";
import { listConversations } from "./inbox";
import { createWorkspaceForUser } from "./workspaces";

// Same real-database approach as phase6.test.ts: push the schema
// into a throwaway SQLite file and delete it afterwards.
const dbFile = join(tmpdir(), `wa_saas_analytics_${randomBytes(6).toString("hex")}.db`);
const dbUrl = `file:${dbFile}`;
let db: PrismaClient;

beforeAll(async () => {
  process.env.DATABASE_URL = dbUrl;
  process.env.AUTH_SECRET = "test-only-secret-for-analytics-test";
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    cwd: join(__dirname, "..", ".."),
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: "pipe",
  });
  db = new PrismaClient({ datasources: { db: { url: dbUrl } } });
}, 120_000);

afterAll(async () => {
  await db.$disconnect().catch(() => undefined);
  try {
    unlinkSync(dbFile);
  } catch {
    // Already gone — nothing to clean up.
  }
});

const MIN = 60_000;
const at = (iso: string) => new Date(iso);

describe("analytics: pure helpers", () => {
  it("median and average handle empty, odd and even lists", () => {
    expect(median([])).toBeNull();
    expect(average([])).toBeNull();
    expect(median([3])).toBe(3);
    expect(median([1, 9, 2])).toBe(2);
    expect(median([5, 12])).toBe(8.5);
    expect(average([5, 12])).toBe(8.5);
  });

  it("formatDuration speaks plainly", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(45_000)).toBe("45 sec");
    expect(formatDuration(12 * MIN)).toBe("12 min");
    expect(formatDuration(2 * 60 * MIN + 5 * MIN)).toBe("2 h 5 min");
    expect(formatDuration(3 * 24 * 60 * MIN)).toBe("3 days");
  });
});

describe("analytics: response times from raw rows", () => {
  const rows: MessageRow[] = [
    // Chat 1: first reply after 5 min, second wait 15 min.
    { conversationId: "c1", createdAt: at("2026-11-20T10:00:00Z"), direction: "in" },
    { conversationId: "c1", createdAt: at("2026-11-20T10:05:00Z"), direction: "out" },
    { conversationId: "c1", createdAt: at("2026-11-20T10:10:00Z"), direction: "in" },
    { conversationId: "c1", createdAt: at("2026-11-20T10:25:00Z"), direction: "out" },
    // Chat 2: two customer messages, then a reply 12 min after the first.
    { conversationId: "c2", createdAt: at("2026-11-21T09:00:00Z"), direction: "in" },
    { conversationId: "c2", createdAt: at("2026-11-21T09:02:00Z"), direction: "in" },
    { conversationId: "c2", createdAt: at("2026-11-21T09:12:00Z"), direction: "out" },
    // Chat 3: never answered — contributes nothing.
    { conversationId: "c3", createdAt: at("2026-11-21T09:30:00Z"), direction: "in" },
    // Chat 4: business spoke first (no wait to measure).
    { conversationId: "c4", createdAt: at("2026-11-21T08:00:00Z"), direction: "out" },
  ];

  it("first response is first customer message to first reply", () => {
    expect(firstResponseTimesMs(rows).sort((a, b) => a - b)).toEqual([
      5 * MIN,
      12 * MIN,
    ]);
  });

  it("reply waits measure from the earliest unanswered message", () => {
    expect(replyTimesMs(rows).sort((a, b) => a - b)).toEqual([
      5 * MIN,
      12 * MIN,
      15 * MIN,
    ]);
  });

  it("row order in the input does not matter", () => {
    const shuffled = [...rows].reverse();
    expect(firstResponseTimesMs(shuffled).sort((a, b) => a - b)).toEqual([
      5 * MIN,
      12 * MIN,
    ]);
  });
});

describe("analytics: buckets and breakdowns from raw rows", () => {
  const now = at("2026-11-21T12:00:00Z");
  const conversations = [
    { assigneeId: "u1", createdAt: at("2026-11-20T10:00:00Z"), id: "a", priority: "high", status: "resolved", unreadCount: 0 },
    { assigneeId: null, createdAt: at("2026-11-21T09:00:00Z"), id: "b", priority: "normal", status: "open", unreadCount: 2 },
    { assigneeId: "u1", createdAt: at("2026-11-21T10:00:00Z"), id: "c", priority: "normal", status: "open", unreadCount: 1 },
    // Outside the 7-day window: no bucket.
    { assigneeId: null, createdAt: at("2026-11-01T10:00:00Z"), id: "old", priority: "low", status: "open", unreadCount: 0 },
  ];

  it("per-day buckets include zero days and skip out-of-window chats", () => {
    const perDay = conversationsPerDay(conversations, 7, now);
    expect(perDay.map((d) => d.date)).toEqual([
      "2026-11-15",
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
      "2026-11-20",
      "2026-11-21",
    ]);
    expect(perDay.map((d) => d.count)).toEqual([0, 0, 0, 0, 0, 1, 2]);
  });

  it("per-assignee counts assigned and resolved, plus unassigned", () => {
    const { rows, unassigned } = perAssignee(conversations, [
      { email: "a@example.com", id: "u1", name: "Ayesha" },
      { email: "b@example.com", id: "u2", name: null },
    ]);
    expect(rows).toEqual([
      { assigned: 2, label: "Ayesha", resolved: 1, userId: "u1" },
      { assigned: 0, label: "b@example.com", resolved: 0, userId: "u2" },
    ]);
    expect(unassigned).toBe(2);
  });

  it("per-priority keeps severity order with zeros", () => {
    expect(perPriority(conversations)).toEqual([
      { count: 0, label: "urgent" },
      { count: 1, label: "high" },
      { count: 2, label: "normal" },
      { count: 1, label: "low" },
    ]);
  });

  it("per-tag counts links and hides unused tags", () => {
    const rows = perTag(
      [
        { conversationId: "a", tagId: "t1" },
        { conversationId: "b", tagId: "t1" },
        { conversationId: "a", tagId: "t2" },
      ],
      [
        { id: "t1", name: "Order" },
        { id: "t2", name: "VIP" },
        { id: "t3", name: "Unused" },
      ],
    );
    expect(rows).toEqual([
      { count: 2, label: "Order" },
      { count: 1, label: "VIP" },
    ]);
  });

  it("draft summary counts outcomes and the acceptance rate", () => {
    const summary = summarizeDrafts([
      { createdAt: now, outcome: "generated" },
      { createdAt: now, outcome: "generated" },
      { createdAt: now, outcome: "generated" },
      { createdAt: now, outcome: "sent-as-is" },
      { createdAt: now, outcome: "edited" },
      { createdAt: now, outcome: "discarded" },
    ]);
    expect(summary.generated).toBe(3);
    expect(summary.sentAsIs).toBe(1);
    expect(summary.edited).toBe(1);
    expect(summary.discarded).toBe(1);
    expect(summary.sentTotal).toBe(2);
    expect(summary.acceptanceRate).toBeCloseTo(2 / 3);
    // Nothing decided yet → no rate, not a fake 0% or 100%.
    expect(summarizeDrafts([]).acceptanceRate).toBeNull();
  });
});

async function makeUser(email: string) {
  return db.user.create({
    data: { email, passwordHash: hashPassword("password-123") },
  });
}

async function makeChat(
  workspaceId: string,
  phone: string,
  data: {
    assigneeId?: string | null;
    createdAt: Date;
    priority?: string;
    status?: string;
    unreadCount?: number;
  },
) {
  const contact = await db.contact.create({ data: { phone, workspaceId } });
  return db.conversation.create({
    data: {
      assigneeId: data.assigneeId ?? null,
      contactId: contact.id,
      createdAt: data.createdAt,
      lastMessageAt: data.createdAt,
      priority: data.priority ?? "normal",
      status: data.status ?? "open",
      unreadCount: data.unreadCount ?? 0,
      workspaceId,
    },
  });
}

async function addMessage(
  workspaceId: string,
  conversationId: string,
  direction: "in" | "out",
  createdAt: Date,
) {
  return db.message.create({
    data: {
      authorType: direction === "in" ? "customer" : "agent",
      conversationId,
      createdAt,
      direction,
      status: "sent",
      text: direction === "in" ? "customer says hi" : "agent replies",
      workspaceId,
    },
  });
}

describe("analytics: getAnalytics against the database", () => {
  const now = at("2026-11-21T12:00:00Z");

  it("computes exact numbers and never counts another workspace", async () => {
    const ownerA = await makeUser("analytics-a@example.com");
    const wsA = await createWorkspaceForUser(ownerA.id, "Analytics A", {}, db);
    const ownerB = await makeUser("analytics-b@example.com");
    const wsB = await createWorkspaceForUser(ownerB.id, "Analytics B", {}, db);

    // Workspace A, chat 1: resolved, assigned, high priority.
    const chat1 = await makeChat(wsA.id, "+92-300-1000001", {
      assigneeId: ownerA.id,
      createdAt: at("2026-11-20T10:00:00Z"),
      priority: "high",
      status: "resolved",
    });
    await addMessage(wsA.id, chat1.id, "in", at("2026-11-20T10:00:00Z"));
    await addMessage(wsA.id, chat1.id, "out", at("2026-11-20T10:05:00Z"));
    await addMessage(wsA.id, chat1.id, "in", at("2026-11-20T10:10:00Z"));
    await addMessage(wsA.id, chat1.id, "out", at("2026-11-20T10:25:00Z"));

    // Workspace A, chat 2: open, unassigned, 2 unread.
    const chat2 = await makeChat(wsA.id, "+92-300-1000002", {
      createdAt: at("2026-11-21T09:00:00Z"),
      unreadCount: 2,
    });
    await addMessage(wsA.id, chat2.id, "in", at("2026-11-21T09:00:00Z"));
    await addMessage(wsA.id, chat2.id, "in", at("2026-11-21T09:02:00Z"));
    await addMessage(wsA.id, chat2.id, "out", at("2026-11-21T09:12:00Z"));

    // Workspace A, old chat: outside the period, still 3 unread now.
    await makeChat(wsA.id, "+92-300-1000003", {
      createdAt: at("2026-11-01T10:00:00Z"),
      unreadCount: 3,
    });

    // Workspace A tickets: one AI no-match (resolved), one manual (open).
    await db.ticket.create({
      data: {
        conversationId: chat1.id,
        createdAt: at("2026-11-20T11:00:00Z"),
        source: "ai-no-match",
        status: "resolved",
        workspaceId: wsA.id,
      },
    });
    await db.ticket.create({
      data: {
        conversationId: chat2.id,
        createdAt: at("2026-11-21T09:30:00Z"),
        source: "manual",
        status: "open",
        workspaceId: wsA.id,
      },
    });

    // Workspace A draft history.
    for (const outcome of ["generated", "generated", "generated", "sent-as-is", "edited", "discarded"]) {
      await db.draftEvent.create({
        data: {
          aiMode: "demo",
          conversationId: chat1.id,
          createdAt: at("2026-11-20T12:00:00Z"),
          outcome,
          workspaceId: wsA.id,
        },
      });
    }

    // Workspace A tag on chat 1.
    const vip = await db.tag.create({ data: { name: "VIP", workspaceId: wsA.id } });
    await db.conversationTag.create({
      data: { conversationId: chat1.id, tagId: vip.id, workspaceId: wsA.id },
    });

    // Workspace B has its own chat, ticket and draft event that
    // must never leak into A's numbers.
    const chatB = await makeChat(wsB.id, "+92-300-2000001", {
      createdAt: at("2026-11-21T08:00:00Z"),
      status: "resolved",
      unreadCount: 9,
    });
    await addMessage(wsB.id, chatB.id, "in", at("2026-11-21T08:00:00Z"));
    await addMessage(wsB.id, chatB.id, "out", at("2026-11-21T08:01:00Z"));
    await db.ticket.create({
      data: {
        conversationId: chatB.id,
        createdAt: at("2026-11-21T08:30:00Z"),
        source: "ai-no-match",
        status: "open",
        workspaceId: wsB.id,
      },
    });
    await db.draftEvent.create({
      data: {
        aiMode: "demo",
        conversationId: chatB.id,
        createdAt: at("2026-11-21T08:05:00Z"),
        outcome: "generated",
        workspaceId: wsB.id,
      },
    });

    const stats = await getAnalytics(wsA.id, 7, db, now);

    expect(stats.conversations.total).toBe(2);
    expect(stats.conversations.open).toBe(1);
    expect(stats.conversations.resolved).toBe(1);
    expect(stats.conversations.resolutionRate).toBe(0.5);
    expect(stats.conversations.unreadNow).toBe(5); // 2 in period + 3 old
    expect(stats.conversations.perDay.map((d) => d.count)).toEqual([
      0, 0, 0, 0, 0, 1, 1,
    ]);

    expect(stats.responseTimes.firstSamples).toBe(2);
    expect(stats.responseTimes.firstMedianMs).toBe(8.5 * MIN);
    expect(stats.responseTimes.firstAverageMs).toBe(8.5 * MIN);
    expect(stats.responseTimes.replySamples).toBe(3);
    expect(stats.responseTimes.replyMedianMs).toBe(12 * MIN);
    expect(stats.responseTimes.replyAverageMs).toBeCloseTo((32 / 3) * MIN);

    expect(stats.tickets).toEqual({
      aiNoMatch: 1,
      created: 2,
      resolved: 1,
      stillOpen: 1,
    });

    expect(stats.drafts.generated).toBe(3);
    expect(stats.drafts.sentAsIs).toBe(1);
    expect(stats.drafts.edited).toBe(1);
    expect(stats.drafts.discarded).toBe(1);
    expect(stats.drafts.acceptanceRate).toBeCloseTo(2 / 3);
    expect(stats.drafts.waitingNow).toBe(0);

    expect(stats.assignees).toEqual([
      {
        assigned: 1,
        label: "analytics-a@example.com",
        resolved: 1,
        userId: ownerA.id,
      },
    ]);
    expect(stats.unassigned).toBe(1);
    expect(stats.tags).toEqual([{ count: 1, label: "VIP" }]);
    expect(stats.priorities).toEqual([
      { count: 0, label: "urgent" },
      { count: 1, label: "high" },
      { count: 1, label: "normal" },
      { count: 0, label: "low" },
    ]);

    // B sees only its own single chat.
    const statsB = await getAnalytics(wsB.id, 7, db, now);
    expect(statsB.conversations.total).toBe(1);
    expect(statsB.conversations.unreadNow).toBe(9);
    expect(statsB.drafts.generated).toBe(1);
    expect(statsB.tickets.created).toBe(1);
  });

  it("an empty workspace returns zeros and nulls, never a crash", async () => {
    const owner = await makeUser("analytics-empty@example.com");
    const ws = await createWorkspaceForUser(owner.id, "Empty", {}, db);

    const stats = await getAnalytics(ws.id, 30, db, now);
    expect(stats.conversations.total).toBe(0);
    expect(stats.conversations.resolutionRate).toBeNull();
    expect(stats.conversations.unreadNow).toBe(0);
    expect(stats.conversations.perDay).toHaveLength(30);
    expect(stats.conversations.perDay.every((d) => d.count === 0)).toBe(true);
    expect(stats.responseTimes.firstMedianMs).toBeNull();
    expect(stats.responseTimes.firstSamples).toBe(0);
    expect(stats.drafts.generated).toBe(0);
    expect(stats.drafts.acceptanceRate).toBeNull();
    expect(stats.tickets.created).toBe(0);
    expect(stats.tags).toEqual([]);
  });
});

describe("analytics: draft outcome tracking", () => {
  async function seededWorkspace(email: string) {
    const user = await makeUser(email);
    const workspace = await createWorkspaceForUser(user.id, "Draft Shop", { isDemo: true }, db);
    await seedDemoData(workspace.id, db);
    const chats = await listConversations(workspace.id, db);
    const fatima = chats.find((c) => (c.contact.name ?? "").startsWith("Fatima"));
    if (!fatima) throw new Error("seeded Fatima chat missing");
    return { fatima, user, workspace };
  }

  async function outcomesFor(workspaceId: string) {
    const events = await db.draftEvent.findMany({
      orderBy: { createdAt: "asc" },
      where: { workspaceId },
    });
    return events.map((event) => event.outcome);
  }

  it("seeded demo draft history is recorded once", async () => {
    const { workspace } = await seededWorkspace("draft-seed@example.com");
    // The demo seed simulates one edited and one discarded draft.
    expect((await outcomesFor(workspace.id)).sort()).toEqual([
      "discarded",
      "edited",
      "generated",
      "generated",
    ]);
    await seedDemoData(workspace.id, db);
    expect((await outcomesFor(workspace.id)).length).toBe(4);
  });

  it("generate → approve unedited records generated + sent-as-is", async () => {
    const { fatima, user, workspace } = await seededWorkspace("draft-asis@example.com");
    const before = (await outcomesFor(workspace.id)).length;

    const result = await draftReply(workspace.id, fatima.id, db);
    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== "draft") throw new Error("expected a draft");

    const approved = await approveDraft(
      workspace.id,
      fatima.id,
      result.draft.id,
      user.id,
      undefined,
      db,
    );
    expect(approved.ok).toBe(true);

    const outcomes = await outcomesFor(workspace.id);
    expect(outcomes.slice(before)).toEqual(["generated", "sent-as-is"]);
  });

  it("approve with changed text records edited", async () => {
    const { fatima, user, workspace } = await seededWorkspace("draft-edited@example.com");
    const before = (await outcomesFor(workspace.id)).length;

    const result = await draftReply(workspace.id, fatima.id, db);
    if (!result.ok || result.kind !== "draft") throw new Error("expected a draft");

    const approved = await approveDraft(
      workspace.id,
      fatima.id,
      result.draft.id,
      user.id,
      "A completely rewritten reply from the agent.",
      db,
    );
    expect(approved.ok).toBe(true);

    const outcomes = await outcomesFor(workspace.id);
    expect(outcomes.slice(before)).toEqual(["generated", "edited"]);
  });

  it("discard records discarded and still deletes the draft row", async () => {
    const { fatima, workspace } = await seededWorkspace("draft-discard@example.com");
    const before = (await outcomesFor(workspace.id)).length;

    const result = await draftReply(workspace.id, fatima.id, db);
    if (!result.ok || result.kind !== "draft") throw new Error("expected a draft");

    expect((await discardDraft(workspace.id, fatima.id, result.draft.id, db)).ok).toBe(true);
    const gone = await db.message.findUnique({ where: { id: result.draft.id } });
    expect(gone).toBeNull();

    const outcomes = await outcomesFor(workspace.id);
    expect(outcomes.slice(before)).toEqual(["generated", "discarded"]);

    // Discarding again is an error and records nothing new.
    expect((await discardDraft(workspace.id, fatima.id, result.draft.id, db)).ok).toBe(false);
    expect((await outcomesFor(workspace.id)).length).toBe(before + 2);
  });
});
