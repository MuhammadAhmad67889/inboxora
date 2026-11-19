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
  deleteKnowledgeEntry,
  getConversation,
  getKnowledgeEntry,
  listContacts,
  listConversations,
  listKnowledgeEntries,
  listMessages,
  markConversationRead,
  updateKnowledgeEntry,
} from "./inbox";
import { createSession, userFromCookieValue } from "./session";
import {
  acceptInvite,
  createInvite,
  createWorkspaceForUser,
  getMembership,
  listWorkspacesForUser,
} from "./workspaces";

// Real database, same schema as production. Local dev runs SQLite,
// so the test pushes the committed schema into a throwaway SQLite
// file and deletes it afterwards. On Postgres (Neon) the same test
// would point at a throwaway database instead.
const dbFile = join(tmpdir(), `wa_saas_test_${randomBytes(6).toString("hex")}.db`);
const dbUrl = `file:${dbFile}`;
let db: PrismaClient;

beforeAll(async () => {
  process.env.DATABASE_URL = dbUrl;
  process.env.AUTH_SECRET = "test-only-secret-for-isolation-test";
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

describe("workspace isolation (real database via Prisma)", () => {
  it("workspace A cannot read or write workspace B's inbox data", async () => {
    const userA = await makeUser("a@example.com");
    const userB = await makeUser("b@example.com");
    const wsA = await createWorkspaceForUser(userA.id, "Shop A", {}, db);
    const wsB = await createWorkspaceForUser(userB.id, "Shop B", {}, db);
    await seedDemoData(wsA.id, db);
    await seedDemoData(wsB.id, db);

    const chatsB = await listConversations(wsB.id, db);
    expect(chatsB.length).toBeGreaterThan(0);
    const chatB = chatsB[0];

    // A listing its own inbox never sees B's chats.
    const chatsA = await listConversations(wsA.id, db);
    expect(chatsA.some((c) => c.id === chatB.id)).toBe(false);

    // Reading B's conversation/messages through A's workspace id fails.
    expect(await getConversation(wsA.id, chatB.id, db)).toBeNull();
    expect(await listMessages(wsA.id, chatB.id, db)).toEqual([]);
    expect((await listMessages(wsB.id, chatB.id, db)).length).toBeGreaterThan(0);

    // Contacts are scoped too.
    const contactsA = await listContacts(wsA.id, db);
    const contactsB = await listContacts(wsB.id, db);
    expect(contactsA.every((c) => c.workspaceId === wsA.id)).toBe(true);
    expect(contactsB.every((c) => c.workspaceId === wsB.id)).toBe(true);

    // Marking B's chat read through A's workspace changes nothing.
    expect(chatB.unreadCount).toBeGreaterThan(0);
    expect(await markConversationRead(wsA.id, chatB.id, db)).toBe(false);
    const chatBAfter = await getConversation(wsB.id, chatB.id, db);
    expect(chatBAfter?.unreadCount).toBe(chatB.unreadCount);

    // Knowledge entries: read, update and delete are all scoped.
    const entriesB = await listKnowledgeEntries(wsB.id, db);
    expect(entriesB.length).toBeGreaterThan(0);
    const entryB = entriesB[0];
    expect(await getKnowledgeEntry(wsA.id, entryB.id, db)).toBeNull();
    expect(
      await updateKnowledgeEntry(wsA.id, entryB.id, { title: "Hijacked" }, db),
    ).toBe(false);
    expect(await deleteKnowledgeEntry(wsA.id, entryB.id, db)).toBe(false);
    const entryBAfter = await getKnowledgeEntry(wsB.id, entryB.id, db);
    expect(entryBAfter?.title).toBe(entryB.title);
  });

  it("membership gates access: a non-member has no membership row", async () => {
    const userA = await makeUser("member-a@example.com");
    const userB = await makeUser("outsider-b@example.com");
    const wsA = await createWorkspaceForUser(userA.id, "Members Only", {}, db);

    expect(await getMembership(userA.id, wsA.id, db)).not.toBeNull();
    expect(await getMembership(userB.id, wsA.id, db)).toBeNull();
    expect((await listWorkspacesForUser(userB.id, db)).length).toBe(0);
  });

  it("invites: owner invites, matching email joins, wrong email is refused", async () => {
    const owner = await makeUser("owner@example.com");
    const teammate = await makeUser("teammate@example.com");
    const stranger = await makeUser("stranger@example.com");
    const ws = await createWorkspaceForUser(owner.id, "Invite Shop", {}, db);

    const invite = await createInvite(owner.id, ws.id, "Teammate@Example.com", db);
    expect(invite.ok).toBe(true);
    if (!invite.ok) throw new Error("invite should have been created");

    // A different signed-in user cannot use someone else's invite link.
    const refused = await acceptInvite(stranger.id, stranger.email, invite.token, db);
    expect(refused.ok).toBe(false);
    expect(await getMembership(stranger.id, ws.id, db)).toBeNull();

    // The invited email (any case) can join.
    const joined = await acceptInvite(teammate.id, teammate.email, invite.token, db);
    expect(joined.ok).toBe(true);
    const membership = await getMembership(teammate.id, ws.id, db);
    expect(membership?.role).toBe("agent");

    // The same link cannot be used twice.
    const again = await acceptInvite(teammate.id, teammate.email, invite.token, db);
    expect(again.ok).toBe(false);
  });

  it("invites: non-owners cannot invite and the seat cap holds", async () => {
    const owner = await makeUser("cap-owner@example.com");
    const agent = await makeUser("cap-agent@example.com");
    const third = await makeUser("cap-third@example.com");
    const fourth = await makeUser("cap-fourth@example.com");
    const ws = await createWorkspaceForUser(owner.id, "Cap Shop", {}, db);

    const inviteAgent = await createInvite(owner.id, ws.id, agent.email, db);
    if (!inviteAgent.ok) throw new Error("invite should have been created");
    await acceptInvite(agent.id, agent.email, inviteAgent.token, db);

    // An agent (not the owner) cannot invite.
    const byAgent = await createInvite(agent.id, ws.id, third.email, db);
    expect(byAgent.ok).toBe(false);

    const inviteThird = await createInvite(owner.id, ws.id, third.email, db);
    if (!inviteThird.ok) throw new Error("invite should have been created");
    await acceptInvite(third.id, third.email, inviteThird.token, db);

    // Owner + 2 agents = 3 seats filled; a fourth invite is refused.
    const inviteFourth = await createInvite(owner.id, ws.id, fourth.email, db);
    expect(inviteFourth.ok).toBe(false);
  });

  it("sessions: a cookie resolves to its user, tampering and expiry do not", async () => {
    const user = await makeUser("session@example.com");
    const { cookieValue, sessionId } = await createSession(user.id, db);

    const resolved = await userFromCookieValue(cookieValue, db);
    expect(resolved?.id).toBe(user.id);

    // Tampered signature → null.
    const dot = cookieValue.lastIndexOf(".");
    const tampered = `${cookieValue.slice(0, dot + 1)}${"0".repeat(64)}`;
    expect(await userFromCookieValue(tampered, db)).toBeNull();

    // Expired session → null.
    await db.session.update({
      data: { expiresAt: new Date(Date.now() - 1000) },
      where: { id: sessionId },
    });
    expect(await userFromCookieValue(cookieValue, db)).toBeNull();
  });
});
