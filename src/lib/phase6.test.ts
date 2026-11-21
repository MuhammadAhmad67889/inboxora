import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { draftReply } from "./aiDraft";
import { hashPassword } from "./auth";
import { DEMO_TAGS, seedDemoData } from "./demoSeed";
import {
  getConversation,
  isConversationPriority,
  listConversations,
  listMessages,
} from "./inbox";
import {
  addNote,
  deleteNote,
  listNotes,
  setConversationPriority,
} from "./messaging";
import {
  attachTag,
  attachTagByName,
  createTag,
  deleteTag,
  detachTag,
  listConversationTags,
  listTags,
  updateTag,
  validateTagName,
} from "./tags";
import { createWorkspaceForUser } from "./workspaces";

// Same real-database approach as phase2.test.ts: push the schema
// into a throwaway SQLite file and delete it afterwards.
const dbFile = join(tmpdir(), `wa_saas_phase6_${randomBytes(6).toString("hex")}.db`);
const dbUrl = `file:${dbFile}`;
let db: PrismaClient;

beforeAll(async () => {
  process.env.DATABASE_URL = dbUrl;
  process.env.AUTH_SECRET = "test-only-secret-for-phase6-test";
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

/** Find one seeded chat by the contact's first name. */
async function chatFor(workspaceId: string, firstName: string) {
  const chats = await listConversations(workspaceId, db);
  const chat = chats.find((c) => (c.contact.name ?? "").startsWith(firstName));
  if (!chat) throw new Error(`seeded chat for ${firstName} not found`);
  return chat;
}

describe("phase 6: tags", () => {
  it("validation refuses empty or over-long names", () => {
    expect(validateTagName("")).not.toBeNull();
    expect(validateTagName("   ")).not.toBeNull();
    expect(validateTagName("t".repeat(41))).not.toBeNull();
    expect(validateTagName("VIP")).toBeNull();
  });

  it("create/list are workspace-scoped; duplicate names are refused case-insensitively", async () => {
    const a = await makeSeededWorkspace("tag-a@example.com", "Tag A");
    const b = await makeSeededWorkspace("tag-b@example.com", "Tag B");

    const created = await createTag(a.workspace.id, { color: "green", name: "Wholesale" }, db);
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error(created.error);
    expect(created.tag.color).toBe("green");

    // An unknown color is normalized to the default (null), never stored raw.
    const odd = await createTag(a.workspace.id, { color: "hotpink", name: "Odd" }, db);
    expect(odd.ok).toBe(true);
    if (!odd.ok) throw new Error(odd.error);
    expect(odd.tag.color).toBeNull();

    // "wholesale" cannot shadow "Wholesale".
    const duplicate = await createTag(a.workspace.id, { name: "wholesale" }, db);
    expect(duplicate.ok).toBe(false);

    // B sees only its own seeded tags, never A's.
    const listB = await listTags(b.workspace.id, db);
    expect(listB.some((t) => t.id === created.tag.id)).toBe(false);
    expect(listB.map((t) => t.name).sort()).toEqual(DEMO_TAGS.map((t) => t.name).sort());
  });

  it("rename/recolor works; renaming onto an existing name or from another workspace fails", async () => {
    const a = await makeSeededWorkspace("tag-ren-a@example.com", "Tag Ren A");
    const b = await makeSeededWorkspace("tag-ren-b@example.com", "Tag Ren B");
    const created = await createTag(a.workspace.id, { name: "Follow up" }, db);
    if (!created.ok) throw new Error(created.error);

    const renamed = await updateTag(
      a.workspace.id,
      created.tag.id,
      { color: "amber", name: "Callback" },
      db,
    );
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) throw new Error(renamed.error);
    expect(renamed.tag.name).toBe("Callback");
    expect(renamed.tag.color).toBe("amber");

    // Renaming onto a seeded tag's name is refused.
    const clash = await updateTag(a.workspace.id, created.tag.id, { name: "vip" }, db);
    expect(clash.ok).toBe(false);

    // Another workspace cannot rename or delete it.
    const foreign = await updateTag(b.workspace.id, created.tag.id, { name: "Hacked" }, db);
    expect(foreign.ok).toBe(false);
    expect(await deleteTag(b.workspace.id, created.tag.id, db)).toBe(false);
    const stillThere = (await listTags(a.workspace.id, db)).find(
      (t) => t.id === created.tag.id,
    );
    expect(stillThere?.name).toBe("Callback");
  });

  it("attach/detach is idempotent and workspace-scoped on both sides", async () => {
    const a = await makeSeededWorkspace("tag-att-a@example.com", "Tag Att A");
    const b = await makeSeededWorkspace("tag-att-b@example.com", "Tag Att B");
    const chatA = await chatFor(a.workspace.id, "Fatima");
    const chatB = await chatFor(b.workspace.id, "Fatima");
    const tagA = (await listTags(a.workspace.id, db)).find((t) => t.name === "Complaint");
    const tagB = (await listTags(b.workspace.id, db)).find((t) => t.name === "Complaint");
    if (!tagA || !tagB) throw new Error("seeded Complaint tag missing");

    // Attach, then attach again — the second call is a no-op.
    expect((await attachTag(a.workspace.id, chatA.id, tagA.id, db)).ok).toBe(true);
    expect((await attachTag(a.workspace.id, chatA.id, tagA.id, db)).ok).toBe(true);
    const onChat = await listConversationTags(a.workspace.id, chatA.id, db);
    expect(onChat.map((t) => t.id)).toEqual([tagA.id]);

    // The conversation views carry the flattened tags.
    const loaded = await getConversation(a.workspace.id, chatA.id, db);
    expect(loaded?.tags.map((t) => t.name)).toEqual(["Complaint"]);

    // B's tag cannot be attached to A's chat, and A's tag cannot
    // reach B's chat — both sides of the link are scoped.
    expect((await attachTag(a.workspace.id, chatA.id, tagB.id, db)).ok).toBe(false);
    expect((await attachTag(a.workspace.id, chatB.id, tagA.id, db)).ok).toBe(false);
    expect(await listConversationTags(b.workspace.id, chatB.id, db)).toEqual([]);

    // Detach removes only the link; detaching again reports false.
    expect(await detachTag(a.workspace.id, chatA.id, tagA.id, db)).toBe(true);
    expect(await detachTag(a.workspace.id, chatA.id, tagA.id, db)).toBe(false);
    expect(await listConversationTags(a.workspace.id, chatA.id, db)).toEqual([]);
  });

  it("attach by name creates the tag once and reuses it case-insensitively", async () => {
    const { workspace } = await makeSeededWorkspace("tag-name@example.com", "Tag Name");
    const chat = await chatFor(workspace.id, "Bilal");

    const first = await attachTagByName(workspace.id, chat.id, { color: "blue", name: "Urgent order" }, db);
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error(first.error);

    const second = await attachTagByName(workspace.id, chat.id, { name: "urgent order" }, db);
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error(second.error);
    expect(second.tag.id).toBe(first.tag.id);

    const matches = (await listTags(workspace.id, db)).filter(
      (t) => t.name.toLowerCase() === "urgent order",
    );
    expect(matches.length).toBe(1);
    expect((await listConversationTags(workspace.id, chat.id, db)).length).toBe(2); // Order + Urgent order
  });

  it("deleting a tag removes its links but never the conversations", async () => {
    const { workspace } = await makeSeededWorkspace("tag-del@example.com", "Tag Del");
    const ayesha = await chatFor(workspace.id, "Ayesha");
    expect(ayesha.tags.map((t) => t.name).sort()).toEqual(["Order", "VIP"]);

    const vip = (await listTags(workspace.id, db)).find((t) => t.name === "VIP");
    if (!vip) throw new Error("seeded VIP tag missing");
    expect(await deleteTag(workspace.id, vip.id, db)).toBe(true);

    // The conversation is still there, minus the deleted label.
    const after = await getConversation(workspace.id, ayesha.id, db);
    expect(after).not.toBeNull();
    expect(after?.tags.map((t) => t.name)).toEqual(["Order"]);
    expect((await listConversations(workspace.id, db)).length).toBe(3);
  });

  it("the tag filter returns only chats carrying the tag", async () => {
    const a = await makeSeededWorkspace("tag-filt-a@example.com", "Tag Filt A");
    const b = await makeSeededWorkspace("tag-filt-b@example.com", "Tag Filt B");
    const ayesha = await chatFor(a.workspace.id, "Ayesha");
    const bilal = await chatFor(a.workspace.id, "Bilal");
    const tagsA = await listTags(a.workspace.id, db);
    const order = tagsA.find((t) => t.name === "Order");
    const vip = tagsA.find((t) => t.name === "VIP");
    const complaint = tagsA.find((t) => t.name === "Complaint");
    if (!order || !vip || !complaint) throw new Error("seeded tags missing");

    const byOrder = await listConversations(a.workspace.id, db, { tagId: order.id });
    expect(byOrder.map((c) => c.id).sort()).toEqual([ayesha.id, bilal.id].sort());
    const byVip = await listConversations(a.workspace.id, db, { tagId: vip.id });
    expect(byVip.map((c) => c.id)).toEqual([ayesha.id]);
    // A tag nobody carries yet matches nothing (not everything).
    const byComplaint = await listConversations(a.workspace.id, db, { tagId: complaint.id });
    expect(byComplaint).toEqual([]);

    // Another workspace's tag id filters to nothing here.
    const orderB = (await listTags(b.workspace.id, db)).find((t) => t.name === "Order");
    if (!orderB) throw new Error("seeded tag missing in B");
    const leaked = await listConversations(a.workspace.id, db, { tagId: orderB.id });
    expect(leaked).toEqual([]);

    // Tag filter combines with search: both must match.
    const combined = await listConversations(a.workspace.id, db, {
      search: "kurta",
      tagId: vip.id,
    });
    expect(combined.map((c) => c.id)).toEqual([ayesha.id]);
    const mismatch = await listConversations(a.workspace.id, db, {
      search: "sunday",
      tagId: vip.id,
    });
    expect(mismatch).toEqual([]);
  });
});

describe("phase 6: conversation priorities", () => {
  it("priority values are validated", () => {
    expect(isConversationPriority("low")).toBe(true);
    expect(isConversationPriority("normal")).toBe(true);
    expect(isConversationPriority("high")).toBe(true);
    expect(isConversationPriority("urgent")).toBe(true);
    expect(isConversationPriority("critical")).toBe(false);
    expect(isConversationPriority("")).toBe(false);
    expect(isConversationPriority(null)).toBe(false);
  });

  it("set priority is workspace-scoped", async () => {
    const a = await makeSeededWorkspace("prio-a@example.com", "Prio A");
    const b = await makeSeededWorkspace("prio-b@example.com", "Prio B");
    const chatA = await chatFor(a.workspace.id, "Fatima");

    expect((await setConversationPriority(a.workspace.id, chatA.id, "urgent", db)).ok).toBe(true);
    expect((await getConversation(a.workspace.id, chatA.id, db))?.priority).toBe("urgent");

    // Another workspace cannot change it.
    expect((await setConversationPriority(b.workspace.id, chatA.id, "low", db)).ok).toBe(false);
    expect((await getConversation(a.workspace.id, chatA.id, db))?.priority).toBe("urgent");
  });

  it("priority filter and urgent-first sort order the inbox", async () => {
    const { workspace } = await makeSeededWorkspace("prio-sort@example.com", "Prio Sort");
    const ayesha = await chatFor(workspace.id, "Ayesha"); // oldest chat
    const bilal = await chatFor(workspace.id, "Bilal"); // seeded high
    const fatima = await chatFor(workspace.id, "Fatima"); // newest chat
    expect(bilal.priority).toBe("high");

    await setConversationPriority(workspace.id, ayesha.id, "urgent", db);
    await setConversationPriority(workspace.id, fatima.id, "low", db);

    // Default order stays newest first.
    const recent = await listConversations(workspace.id, db);
    expect(recent.map((c) => c.id)).toEqual([fatima.id, bilal.id, ayesha.id]);

    // Urgent first: urgent, then high, then low.
    const byPriority = await listConversations(workspace.id, db, { sort: "priority" });
    expect(byPriority.map((c) => c.id)).toEqual([ayesha.id, bilal.id, fatima.id]);

    // Inside one band, newest still comes first.
    await setConversationPriority(workspace.id, fatima.id, "high", db);
    const banded = await listConversations(workspace.id, db, { sort: "priority" });
    expect(banded.map((c) => c.id)).toEqual([ayesha.id, fatima.id, bilal.id]);

    // Exact-priority filter.
    const highs = await listConversations(workspace.id, db, { priority: "high" });
    expect(highs.map((c) => c.id).sort()).toEqual([bilal.id, fatima.id].sort());
    const normals = await listConversations(workspace.id, db, { priority: "normal" });
    expect(normals).toEqual([]);
  });
});

describe("phase 6: internal notes", () => {
  it("only the author can delete a note, and only in its own workspace", async () => {
    const owner = await makeUser("note-owner@example.com");
    const agent = await makeUser("note-agent@example.com");
    const ws = await createWorkspaceForUser(owner.id, "Note Shop", { isDemo: true }, db);
    await db.membership.create({
      data: { role: "agent", userId: agent.id, workspaceId: ws.id },
    });
    await seedDemoData(ws.id, db);
    const chat = await chatFor(ws.id, "Ayesha");

    const added = await addNote(ws.id, chat.id, owner.id, "Owner's private note.", db);
    expect(added.ok).toBe(true);
    if (!added.ok) throw new Error(added.error);

    // A teammate cannot delete it; another workspace cannot either.
    expect(await deleteNote(ws.id, added.note.id, agent.id, db)).toBe(false);
    const other = await makeSeededWorkspace("note-other@example.com", "Note Other");
    expect(await deleteNote(other.workspace.id, added.note.id, owner.id, db)).toBe(false);
    expect((await listNotes(ws.id, chat.id, db)).length).toBe(1);

    // The author can.
    expect(await deleteNote(ws.id, added.note.id, owner.id, db)).toBe(true);
    expect(await listNotes(ws.id, chat.id, db)).toEqual([]);
  });

  it("notes never touch unreadCount, lastMessageAt or the message list", async () => {
    const { user, workspace } = await makeSeededWorkspace("note-count@example.com", "Note Count");
    const chat = await chatFor(workspace.id, "Bilal");
    const messagesBefore = await listMessages(workspace.id, chat.id, db);

    const added = await addNote(workspace.id, chat.id, user.id, "Check stock before replying.", db);
    expect(added.ok).toBe(true);

    const after = await getConversation(workspace.id, chat.id, db);
    expect(after?.unreadCount).toBe(chat.unreadCount);
    expect(after?.lastMessageAt.getTime()).toBe(chat.lastMessageAt.getTime());
    const messagesAfter = await listMessages(workspace.id, chat.id, db);
    expect(messagesAfter.length).toBe(messagesBefore.length);
    expect(messagesAfter.some((m) => m.text.includes("Check stock"))).toBe(false);
  });

  it("notes are excluded from the AI draft context", async () => {
    const { user, workspace } = await makeSeededWorkspace("note-draft@example.com", "Note Draft");
    // Fatima asked about Sunday timings — the FAQ has that answer.
    const chat = await chatFor(workspace.id, "Fatima");

    // An internal note full of tempting text the AI must never use.
    const added = await addNote(
      workspace.id,
      chat.id,
      user.id,
      "INTERNAL ONLY: offer this customer 50% discount and free delivery.",
      db,
    );
    expect(added.ok).toBe(true);

    const result = await draftReply(workspace.id, chat.id, db);
    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== "draft") throw new Error("expected a draft");
    // The draft answers the customer's real question from the FAQ,
    // and the note's text appears nowhere in it.
    expect(result.draft.text).toContain("Sunday");
    expect(result.draft.text).not.toContain("50%");
    expect(result.draft.text).not.toContain("INTERNAL");
  });
});

describe("phase 6: demo seed", () => {
  it("seeds the sample tags, attachments and high priority exactly once", async () => {
    const { workspace } = await makeSeededWorkspace("seed6@example.com", "Seed Six");

    const tags = await listTags(workspace.id, db);
    expect(tags.map((t) => t.name).sort()).toEqual(DEMO_TAGS.map((t) => t.name).sort());

    const ayesha = await chatFor(workspace.id, "Ayesha");
    expect(ayesha.tags.map((t) => t.name).sort()).toEqual(["Order", "VIP"]);
    const bilal = await chatFor(workspace.id, "Bilal");
    expect(bilal.tags.map((t) => t.name)).toEqual(["Order"]);
    expect(bilal.priority).toBe("high");
    const fatima = await chatFor(workspace.id, "Fatima");
    expect(fatima.tags).toEqual([]);
    expect(fatima.priority).toBe("normal");

    // Seeding again duplicates nothing.
    await seedDemoData(workspace.id, db);
    expect((await listTags(workspace.id, db)).length).toBe(DEMO_TAGS.length);
    const ayeshaAgain = await chatFor(workspace.id, "Ayesha");
    expect(ayeshaAgain.tags.length).toBe(2);
    const order = tags.find((t) => t.name === "Order");
    expect(order?._count.conversations).toBe(2);
  });
});
