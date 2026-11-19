import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "./auth";
import { seedDemoData } from "./demoSeed";
import {
  createKnowledgeEntry,
  getBusinessProfile,
  getConversation,
  getKnowledgeEntry,
  listConversations,
  listKnowledgeEntries,
  listMessages,
  upsertBusinessProfile,
  validateKnowledgeEntry,
} from "./inbox";
import {
  addNote,
  assignConversation,
  listNotes,
  sendAgentReply,
  setConversationStatus,
  simulateCustomerMessage,
} from "./messaging";
import { createWorkspaceForUser } from "./workspaces";

// Same real-database approach as isolation.test.ts: push the schema
// into a throwaway SQLite file and delete it afterwards.
const dbFile = join(tmpdir(), `wa_saas_phase2_${randomBytes(6).toString("hex")}.db`);
const dbUrl = `file:${dbFile}`;
let db: PrismaClient;

beforeAll(async () => {
  process.env.DATABASE_URL = dbUrl;
  process.env.AUTH_SECRET = "test-only-secret-for-phase2-test";
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

async function makeUser(email: string) {
  return db.user.create({
    data: { email, passwordHash: hashPassword("password-123") },
  });
}

async function makeSeededWorkspace(email: string, name: string) {
  const user = await makeUser(email);
  const workspace = await createWorkspaceForUser(user.id, name, { isDemo: true }, db);
  await seedDemoData(workspace.id, db);
  return { user, workspace };
}

describe("phase 2: replies, assign/resolve, notes, knowledge", () => {
  it("an agent reply is recorded in the right workspace only", async () => {
    const a = await makeSeededWorkspace("reply-a@example.com", "Reply A");
    const b = await makeSeededWorkspace("reply-b@example.com", "Reply B");
    const chatsB = await listConversations(b.workspace.id, db);
    const chatB = chatsB[0];
    const before = (await listMessages(b.workspace.id, chatB.id, db)).length;

    // Replying through workspace A's id to B's chat must fail.
    const refused = await sendAgentReply(
      a.workspace.id,
      chatB.id,
      a.user.id,
      "Cross-workspace reply",
      db,
    );
    expect(refused.ok).toBe(false);
    expect((await listMessages(b.workspace.id, chatB.id, db)).length).toBe(before);

    // Replying in the owning workspace works and is stored as out/agent.
    const sent = await sendAgentReply(
      b.workspace.id,
      chatB.id,
      b.user.id,
      "Yes, we can help with that.",
      db,
    );
    expect(sent.ok).toBe(true);
    if (!sent.ok) throw new Error("reply should have been sent");
    expect(sent.message.direction).toBe("out");
    expect(sent.message.authorType).toBe("agent");
    expect(sent.message.senderId).toBe(b.user.id);
    expect(sent.message.isDemo).toBe(true);
    const messages = await listMessages(b.workspace.id, chatB.id, db);
    expect(messages.length).toBe(before + 1);
    expect(messages[messages.length - 1].text).toBe("Yes, we can help with that.");

    // Empty replies are refused.
    const empty = await sendAgentReply(b.workspace.id, chatB.id, b.user.id, "   ", db);
    expect(empty.ok).toBe(false);
  });

  it("simulated customer messages are demo-only and bump unread", async () => {
    const { user, workspace } = await makeSeededWorkspace(
      "sim@example.com",
      "Sim Shop",
    );
    const chats = await listConversations(workspace.id, db);
    const chat = chats[0];

    const simulated = await simulateCustomerMessage(
      workspace.id,
      chat.id,
      "Do you deliver on Sunday?",
      db,
    );
    expect(simulated.ok).toBe(true);
    if (!simulated.ok) throw new Error("simulate should have worked");
    expect(simulated.message.direction).toBe("in");
    expect(simulated.message.authorType).toBe("customer");
    const after = await getConversation(workspace.id, chat.id, db);
    expect(after?.unreadCount).toBe(chat.unreadCount + 1);

    // A non-demo conversation refuses simulated messages.
    const realWorkspace = await createWorkspaceForUser(user.id, "Real Shop", {}, db);
    const contact = await db.contact.create({
      data: { isDemo: false, phone: "+92-300-9999999", workspaceId: realWorkspace.id },
    });
    const realChat = await db.conversation.create({
      data: { contactId: contact.id, isDemo: false, workspaceId: realWorkspace.id },
    });
    const refused = await simulateCustomerMessage(
      realWorkspace.id,
      realChat.id,
      "fake customer",
      db,
    );
    expect(refused.ok).toBe(false);
    expect(await listMessages(realWorkspace.id, realChat.id, db)).toEqual([]);
  });

  it("assign: members only, unassign works, cross-workspace fails", async () => {
    const owner = await makeUser("assign-owner@example.com");
    const agent = await makeUser("assign-agent@example.com");
    const outsider = await makeUser("assign-outsider@example.com");
    const ws = await createWorkspaceForUser(owner.id, "Assign Shop", { isDemo: true }, db);
    await db.membership.create({
      data: { role: "agent", userId: agent.id, workspaceId: ws.id },
    });
    await seedDemoData(ws.id, db);
    const other = await makeSeededWorkspace("assign-other@example.com", "Other Shop");
    const chat = (await listConversations(ws.id, db))[0];

    // Assigning to a non-member is refused.
    const toOutsider = await assignConversation(ws.id, chat.id, outsider.id, db);
    expect(toOutsider.ok).toBe(false);

    // Assigning through another workspace's id is refused.
    const crossWs = await assignConversation(other.workspace.id, chat.id, agent.id, db);
    expect(crossWs.ok).toBe(false);

    // Assigning to a member works; unassigning works too.
    expect((await assignConversation(ws.id, chat.id, agent.id, db)).ok).toBe(true);
    expect((await getConversation(ws.id, chat.id, db))?.assigneeId).toBe(agent.id);
    expect((await assignConversation(ws.id, chat.id, null, db)).ok).toBe(true);
    expect((await getConversation(ws.id, chat.id, db))?.assigneeId).toBeNull();
  });

  it("resolve and reopen change status; filters find the right chats", async () => {
    const { user, workspace } = await makeSeededWorkspace(
      "status@example.com",
      "Status Shop",
    );
    const chats = await listConversations(workspace.id, db);
    const chat = chats[0];

    expect((await setConversationStatus(workspace.id, chat.id, "resolved", db)).ok).toBe(true);
    expect((await getConversation(workspace.id, chat.id, db))?.status).toBe("resolved");

    const resolved = await listConversations(workspace.id, db, { kind: "resolved" });
    expect(resolved.map((c) => c.id)).toEqual([chat.id]);

    expect((await setConversationStatus(workspace.id, chat.id, "open", db)).ok).toBe(true);
    expect(
      await listConversations(workspace.id, db, { kind: "resolved" }),
    ).toEqual([]);

    // Unread filter: every seeded chat starts unread.
    const unread = await listConversations(workspace.id, db, { kind: "unread" });
    expect(unread.length).toBe(chats.length);

    // Mine filter: only chats assigned to the given user.
    await assignConversation(workspace.id, chat.id, user.id, db);
    const mine = await listConversations(workspace.id, db, {
      kind: "mine",
      userId: user.id,
    });
    expect(mine.map((c) => c.id)).toEqual([chat.id]);

    // A new simulated customer message reopens a resolved chat.
    await setConversationStatus(workspace.id, chat.id, "resolved", db);
    await simulateCustomerMessage(workspace.id, chat.id, "Still need help", db);
    expect((await getConversation(workspace.id, chat.id, db))?.status).toBe("open");
  });

  it("notes are stored separately and never appear as messages", async () => {
    const a = await makeSeededWorkspace("notes-a@example.com", "Notes A");
    const b = await makeSeededWorkspace("notes-b@example.com", "Notes B");
    const chatB = (await listConversations(b.workspace.id, db))[0];
    const messagesBefore = await listMessages(b.workspace.id, chatB.id, db);

    const added = await addNote(
      b.workspace.id,
      chatB.id,
      b.user.id,
      "Customer wants a callback after 6pm.",
      db,
    );
    expect(added.ok).toBe(true);

    const notes = await listNotes(b.workspace.id, chatB.id, db);
    expect(notes.length).toBe(1);
    expect(notes[0].text).toBe("Customer wants a callback after 6pm.");
    expect(notes[0].author.id).toBe(b.user.id);

    // The customer-facing message list is unchanged.
    const messagesAfter = await listMessages(b.workspace.id, chatB.id, db);
    expect(messagesAfter.length).toBe(messagesBefore.length);
    expect(messagesAfter.some((m) => m.text.includes("callback"))).toBe(false);

    // Notes through another workspace fail and stay invisible there.
    const refused = await addNote(a.workspace.id, chatB.id, a.user.id, "sneaky", db);
    expect(refused.ok).toBe(false);
    expect(await listNotes(a.workspace.id, chatB.id, db)).toEqual([]);
  });

  it("knowledge CRUD and business profile are workspace-scoped", async () => {
    const a = await makeSeededWorkspace("kb-a@example.com", "KB A");
    const b = await makeSeededWorkspace("kb-b@example.com", "KB B");

    const created = await createKnowledgeEntry(
      a.workspace.id,
      { content: "Cash on delivery is available.", title: "Payment methods" },
      a.user.id,
      db,
    );
    expect(created.workspaceId).toBe(a.workspace.id);

    // B cannot see A's new entry.
    expect(await getKnowledgeEntry(b.workspace.id, created.id, db)).toBeNull();
    const entriesB = await listKnowledgeEntries(b.workspace.id, db);
    expect(entriesB.some((e) => e.id === created.id)).toBe(false);

    // Validation refuses empty fields.
    expect(validateKnowledgeEntry("", "answer")).not.toBeNull();
    expect(validateKnowledgeEntry("question", "  ")).not.toBeNull();
    expect(validateKnowledgeEntry("question", "answer")).toBeNull();

    // Business profile: save in A, invisible in B, update in place.
    await upsertBusinessProfile(
      a.workspace.id,
      {
        address: "Main Boulevard, Lahore",
        businessName: "KB A Store",
        hours: "Mon–Sat 10am–9pm",
        policies: "Returns within 7 days.",
      },
      db,
    );
    expect((await getBusinessProfile(a.workspace.id, db))?.businessName).toBe("KB A Store");
    // B has its own seeded demo profile — A's save never leaks into it.
    const profileB = await getBusinessProfile(b.workspace.id, db);
    expect(profileB?.businessName).toBe("Demo Store");
    expect(profileB?.workspaceId).toBe(b.workspace.id);

    await upsertBusinessProfile(
      a.workspace.id,
      {
        address: "Main Boulevard, Lahore",
        businessName: "KB A Store",
        hours: "Mon–Sat 10am–10pm",
        policies: "Returns within 7 days.",
      },
      db,
    );
    const profiles = await db.businessProfile.findMany({
      where: { workspaceId: a.workspace.id },
    });
    expect(profiles.length).toBe(1);
    expect(profiles[0].hours).toBe("Mon–Sat 10am–10pm");
  });
});
