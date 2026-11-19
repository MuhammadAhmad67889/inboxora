import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth";
import { seedDemoData } from "../src/lib/demoSeed";
import { createWorkspaceForUser, getMembership } from "../src/lib/workspaces";

/**
 * Creates a demo account so anyone can sign in and see the inbox:
 *   email:    demo@example.com
 *   password: demo-password-123
 * Idempotent — safe to run repeatedly.
 */
async function main() {
  const db = new PrismaClient();
  try {
    const email = "demo@example.com";
    let user = await db.user.findUnique({ where: { email } });
    if (!user) {
      user = await db.user.create({
        data: {
          email,
          name: "Demo Owner",
          passwordHash: hashPassword("demo-password-123"),
        },
      });
      console.log("Created demo user", email);
    }

    let workspace = await db.workspace.findFirst({
      where: { memberships: { some: { userId: user.id } }, name: "Demo Store" },
    });
    if (!workspace) {
      workspace = await createWorkspaceForUser(user.id, "Demo Store", { isDemo: true }, db);
      console.log("Created Demo Store workspace");
    } else if (!(await getMembership(user.id, workspace.id, db))) {
      await db.membership.create({
        data: { role: "owner", userId: user.id, workspaceId: workspace.id },
      });
    }

    await seedDemoData(workspace.id, db);
    console.log("Demo data ready. Sign in with demo@example.com / demo-password-123");
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
