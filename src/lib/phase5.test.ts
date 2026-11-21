import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "./auth";
import { DEMO_QUICK_REPLIES, seedDemoData } from "./demoSeed";
import { listConversations, UNASSIGNED } from "./inbox";
import { assignConversation, setConversationStatus, simulateCustomerMessage } from "./messaging";
import {
  createQuickReply,
  deleteQuickReply,
  listQuickReplies,
  updateQuickReply,
  validateQuickReply,
} from "./quickReplies";
import { appendQuickReply, fillQuickReply } from "./quickReplyText";
import { createWorkspaceForUser } from "./workspaces";

// Same real-database approach as phase2.test.ts: push the schema
// into a throwaway SQLite file and delete it afterwards.
const dbFile = join(tmpdir(), `wa_saas_phase5_${randomBytes(6).toString("hex")}.db`);
const dbUrl = `file:${dbFile}`;
let db: PrismaClient;

beforeAll(async () => {
  process.env.DATABASE_URL = dbUrl;
  process.env.AUTH_SECRET = "test-only-secret-for-phase5-test";
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

describe("phase 5: conversation search and assignee filter", () => {
  it("search matches contact name, phone and message text, case-insensitively", async () => {
    const { workspace } = await makeSeededWorkspace("search@example.com", "Search Shop");
    const ayesha = await chatFor(workspace.id, "Ayesha");
    const bilal = await chatFor(workspace.id, "Bilal");
    const fatima = await chatFor(workspace.id, "Fatima");

    // By name, typed in lowercase.
    const byName = await listConversations(workspace.id, db, { search: "ayesha" });
    expect(byName.map((c) => c.id)).toEqual([ayesha.id]);

    // By phone digits.
    const byPhone = await listConversations(workspace.id, db, { search: "0000002" });
    expect(byPhone.map((c) => c.id)).toEqual([bilal.id]);

    // By message text, typed in uppercase.
    const byMessage = await listConversations(workspace.id, db, { search: "KURTA" });
    expect(byMessage.map((c) => c.id)).toEqual([ayesha.id]);

    const bySunday = await listConversations(workspace.id, db, { search: "sunday" });
    expect(bySunday.map((c) => c.id)).toEqual([fatima.id]);

    // No match anywhere returns an empty list, not everything.
    const none = await listConversations(workspace.id, db, { search: "xylophone" });
    expect(none).toEqual([]);

    // Blank search behaves like no search.
    const all = await listConversations(workspace.id, db, { search: "   " });
    expect(all.length).toBe(3);
  });

  it("search combines with the kind filter and the assignee filter", async () => {
    const owner = await makeUser("combo-owner@example.com");
    const agent = await makeUser("combo-agent@example.com");
    const ws = await createWorkspaceForUser(owner.id, "Combo Shop", { isDemo: true }, db);
    await db.membership.create({
      data: { role: "agent", userId: agent.id, workspaceId: ws.id },
    });
    await seedDemoData(ws.id, db);
    const ayesha = await chatFor(ws.id, "Ayesha");

    // Assignee filter: only the assigned chat; unassigned gets the rest.
    await assignConversation(ws.id, ayesha.id, agent.id, db);
    const forAgent = await listConversations(ws.id, db, { assignee: agent.id });
    expect(forAgent.map((c) => c.id)).toEqual([ayesha.id]);
    const unassigned = await listConversations(ws.id, db, { assignee: UNASSIGNED });
    expect(unassigned.length).toBe(2);
    expect(unassigned.some((c) => c.id === ayesha.id)).toBe(false);

    // Search + assignee: both must match.
    const both = await listConversations(ws.id, db, {
      assignee: agent.id,
      search: "kurta",
    });
    expect(both.map((c) => c.id)).toEqual([ayesha.id]);
    const mismatch = await listConversations(ws.id, db, {
      assignee: owner.id,
      search: "kurta",
    });
    expect(mismatch).toEqual([]);

    // Search + kind: resolved chats only.
    await setConversationStatus(ws.id, ayesha.id, "resolved", db);
    const resolvedHit = await listConversations(ws.id, db, {
      kind: "resolved",
      search: "kurta",
    });
    expect(resolvedHit.map((c) => c.id)).toEqual([ayesha.id]);
    const resolvedMiss = await listConversations(ws.id, db, {
      kind: "resolved",
      search: "sunday",
    });
    expect(resolvedMiss).toEqual([]);
  });

  it("search never leaks another workspace's chats", async () => {
    const a = await makeSeededWorkspace("iso-a@example.com", "Iso A");
    const b = await makeSeededWorkspace("iso-b@example.com", "Iso B");
    const chatB = await chatFor(b.workspace.id, "Bilal");

    // A message that exists only in workspace B.
    await simulateCustomerMessage(b.workspace.id, chatB.id, "zebra-unique-token", db);

    // Searching A for B's unique text finds nothing.
    const leaked = await listConversations(a.workspace.id, db, {
      search: "zebra-unique-token",
    });
    expect(leaked).toEqual([]);

    // The same search in B finds B's chat.
    const found = await listConversations(b.workspace.id, db, {
      search: "zebra-unique-token",
    });
    expect(found.map((c) => c.id)).toEqual([chatB.id]);

    // Text present in both workspaces returns only the caller's rows.
    const inA = await listConversations(a.workspace.id, db, { search: "kurta" });
    expect(inA.length).toBe(1);
    expect(inA[0].workspaceId).toBe(a.workspace.id);
  });
});

describe("phase 5: quick replies", () => {
  it("validation refuses empty or over-long fields", () => {
    expect(validateQuickReply("", "body")).not.toBeNull();
    expect(validateQuickReply("title", "  ")).not.toBeNull();
    expect(validateQuickReply("t".repeat(101), "body")).not.toBeNull();
    expect(validateQuickReply("title", "b".repeat(2001))).not.toBeNull();
    expect(validateQuickReply("Order status", "Your order is on its way.")).toBeNull();
  });

  it("CRUD is workspace-scoped; another workspace cannot read or change them", async () => {
    const a = await makeSeededWorkspace("qr-a@example.com", "QR A");
    const b = await makeSeededWorkspace("qr-b@example.com", "QR B");

    const created = await createQuickReply(
      a.workspace.id,
      { body: "Hi {{name}}, your order is ready.", title: "Order ready" },
      a.user.id,
      db,
    );
    expect(created.workspaceId).toBe(a.workspace.id);
    expect(created.createdById).toBe(a.user.id);

    // B's list has only B's seeded replies, never A's new one.
    const listB = await listQuickReplies(b.workspace.id, db);
    expect(listB.some((r) => r.id === created.id)).toBe(false);
    expect(listB.length).toBe(DEMO_QUICK_REPLIES.length);

    // B cannot edit or delete A's reply.
    expect(
      await updateQuickReply(
        b.workspace.id,
        created.id,
        { body: "hacked", title: "hacked" },
        db,
      ),
    ).toBe(false);
    expect(await deleteQuickReply(b.workspace.id, created.id, db)).toBe(false);
    const afterAttack = (await listQuickReplies(a.workspace.id, db)).find(
      (r) => r.id === created.id,
    );
    expect(afterAttack?.title).toBe("Order ready");

    // A can edit and delete its own.
    expect(
      await updateQuickReply(
        a.workspace.id,
        created.id,
        { body: "Hi {{name}}, your order has shipped.", title: "Order shipped" },
        db,
      ),
    ).toBe(true);
    const updated = (await listQuickReplies(a.workspace.id, db)).find(
      (r) => r.id === created.id,
    );
    expect(updated?.title).toBe("Order shipped");
    expect(updated?.body).toContain("has shipped");

    expect(await deleteQuickReply(a.workspace.id, created.id, db)).toBe(true);
    expect(
      (await listQuickReplies(a.workspace.id, db)).some((r) => r.id === created.id),
    ).toBe(false);
  });

  it("the demo seed adds the sample quick replies exactly once", async () => {
    const { workspace } = await makeSeededWorkspace("qr-seed@example.com", "QR Seed");
    const first = await listQuickReplies(workspace.id, db);
    expect(first.map((r) => r.title)).toEqual(DEMO_QUICK_REPLIES.map((r) => r.title));

    // Seeding again does not duplicate them.
    await seedDemoData(workspace.id, db);
    const second = await listQuickReplies(workspace.id, db);
    expect(second.length).toBe(DEMO_QUICK_REPLIES.length);
  });

  it("placeholders fill with the customer name, or a friendly fallback", () => {
    expect(fillQuickReply("Hi {{name}}, welcome!", "Ayesha Khan")).toBe(
      "Hi Ayesha Khan, welcome!",
    );
    // Spacing and casing variants work too.
    expect(fillQuickReply("Hi {{ NAME }}!", "Bilal")).toBe("Hi Bilal!");
    // No name saved: greeting still reads naturally.
    expect(fillQuickReply("Hi {{name}}, welcome!", null)).toBe("Hi there, welcome!");
    expect(fillQuickReply("Hi {{name}}, welcome!", "  ")).toBe("Hi there, welcome!");
    // No placeholder: text passes through unchanged.
    expect(fillQuickReply("Delivery costs Rs 250.", "Ayesha")).toBe(
      "Delivery costs Rs 250.",
    );
  });

  it("inserting appends to a draft instead of wiping it", () => {
    expect(appendQuickReply("", "Hello!")).toBe("Hello!");
    expect(appendQuickReply("   ", "Hello!")).toBe("Hello!");
    expect(appendQuickReply("Thanks for waiting.", "Your order shipped.")).toBe(
      "Thanks for waiting.\nYour order shipped.",
    );
    // Trailing blank lines in the draft do not pile up.
    expect(appendQuickReply("Thanks.\n\n", "Bye!")).toBe("Thanks.\nBye!");
  });
});
