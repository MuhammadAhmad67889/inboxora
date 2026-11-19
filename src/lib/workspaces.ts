import type { Membership, PrismaClient, Workspace } from "@prisma/client";
import { hashToken, newSessionToken, normalizeEmail } from "./auth";
import { getPrisma } from "./prisma";

export const ROLES = { agent: "agent", owner: "owner" } as const;
export type Role = (typeof ROLES)[keyof typeof ROLES];

/** Seats per workspace in the MVP (owner + agents). Matches the
 * Pro plan in the spec: up to 3 seats. */
export const MAX_SEATS = 3;

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Create a workspace and make the given user its owner. */
export async function createWorkspaceForUser(
  userId: string,
  name: string,
  options: { isDemo?: boolean } = {},
  db: PrismaClient = getPrisma(),
): Promise<Workspace> {
  const workspace = await db.workspace.create({
    data: { isDemo: options.isDemo ?? false, name },
  });
  await db.membership.create({
    data: { role: ROLES.owner, userId, workspaceId: workspace.id },
  });
  return workspace;
}

/** All workspaces a user belongs to, oldest first. */
export async function listWorkspacesForUser(
  userId: string,
  db: PrismaClient = getPrisma(),
): Promise<Array<{ membership: Membership; workspace: Workspace }>> {
  const memberships = await db.membership.findMany({
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
    where: { userId },
  });
  return memberships.map((m) => ({ membership: m, workspace: m.workspace }));
}

/** The membership row if the user belongs to the workspace, else null.
 * Every workspace-scoped feature starts by calling this. */
export async function getMembership(
  userId: string,
  workspaceId: string,
  db: PrismaClient = getPrisma(),
): Promise<Membership | null> {
  return db.membership.findUnique({
    where: { workspaceId_userId: { userId, workspaceId } },
  });
}

export async function countMembers(
  workspaceId: string,
  db: PrismaClient = getPrisma(),
): Promise<number> {
  return db.membership.count({ where: { workspaceId } });
}

/** Everyone in a workspace, oldest membership first. Used for the
 * assignee picker — only these users may be assigned a chat. */
export async function listMembers(
  workspaceId: string,
  db: PrismaClient = getPrisma(),
) {
  return db.membership.findMany({
    include: { user: { select: { email: true, id: true, name: true } } },
    orderBy: { createdAt: "asc" },
    where: { workspaceId },
  });
}

export type InviteResult =
  | { inviteId: string; ok: true; token: string }
  | { error: string; ok: false };

/**
 * Invite a teammate by email. Only owners can invite, and the
 * workspace seat cap is enforced here so no route can bypass it.
 * Returns the raw token once — only its hash is stored.
 */
export async function createInvite(
  inviterUserId: string,
  workspaceId: string,
  email: string,
  db: PrismaClient = getPrisma(),
): Promise<InviteResult> {
  const membership = await getMembership(inviterUserId, workspaceId, db);
  if (!membership) return { error: "You do not belong to this workspace.", ok: false };
  if (membership.role !== ROLES.owner) {
    return { error: "Only the workspace owner can invite teammates.", ok: false };
  }
  const seats = await countMembers(workspaceId, db);
  if (seats >= MAX_SEATS) {
    return { error: `This workspace already has ${MAX_SEATS} seats filled.`, ok: false };
  }
  const token = newSessionToken();
  const invite = await db.invite.create({
    data: {
      email: normalizeEmail(email),
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      role: ROLES.agent,
      tokenHash: hashToken(token),
      workspaceId,
    },
  });
  return { inviteId: invite.id, ok: true, token };
}

export type AcceptInviteResult =
  | { ok: true; workspaceId: string }
  | { error: string; ok: false };

/**
 * Accept an invite for a signed-in user. The invite email must match
 * the account email, so a leaked link cannot be used by someone else.
 */
export async function acceptInvite(
  userId: string,
  userEmail: string,
  token: string,
  db: PrismaClient = getPrisma(),
): Promise<AcceptInviteResult> {
  const invite = await db.invite.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!invite) return { error: "This invite link is not valid.", ok: false };
  if (invite.acceptedAt) return { error: "This invite was already used.", ok: false };
  if (invite.expiresAt.getTime() <= Date.now()) {
    return { error: "This invite link has expired.", ok: false };
  }
  if (invite.email !== normalizeEmail(userEmail)) {
    return { error: "This invite was sent to a different email address.", ok: false };
  }
  const existing = await getMembership(userId, invite.workspaceId, db);
  if (existing) return { ok: true, workspaceId: invite.workspaceId };
  const seats = await countMembers(invite.workspaceId, db);
  if (seats >= MAX_SEATS) {
    return { error: `This workspace already has ${MAX_SEATS} seats filled.`, ok: false };
  }
  await db.membership.create({
    data: { role: invite.role, userId, workspaceId: invite.workspaceId },
  });
  await db.invite.update({
    data: { acceptedAt: new Date() },
    where: { id: invite.id },
  });
  return { ok: true, workspaceId: invite.workspaceId };
}
