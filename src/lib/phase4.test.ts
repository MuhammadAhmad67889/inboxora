import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "./auth";
import { getConnectionStatus, saveWhatsAppConnection } from "./connection";
import { decryptSecret, encryptSecret } from "./crypto";
import { checkDatabase } from "./health";
import { createWorkspaceForUser } from "./workspaces";

// Same real-database approach as phase2/phase3 tests.
const dbFile = join(tmpdir(), `wa_saas_phase4_${randomBytes(6).toString("hex")}.db`);
const dbUrl = `file:${dbFile}`;
let db: PrismaClient;

beforeAll(async () => {
  process.env.DATABASE_URL = dbUrl;
  process.env.AUTH_SECRET = "phase4-test-secret";
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
    // already gone
  }
});

async function makeWorkspace(email: string, name: string) {
  const user = await db.user.create({
    data: { email, passwordHash: hashPassword("password-123") },
  });
  const workspace = await createWorkspaceForUser(user.id, name, { isDemo: true }, db);
  return { user, workspace };
}

describe("phase 4: secret encryption", () => {
  it("round-trips a secret and never stores it in plaintext", () => {
    const stored = encryptSecret("EAAG-test-token-123");
    expect(stored.startsWith("enc:v1:")).toBe(true);
    expect(stored).not.toContain("EAAG-test-token-123");
    expect(decryptSecret(stored)).toBe("EAAG-test-token-123");
  });

  it("uses a fresh IV each time and rejects tampered values", () => {
    const a = encryptSecret("same-input");
    const b = encryptSecret("same-input");
    expect(a).not.toBe(b);
    const tampered = a.slice(0, -2) + (a.endsWith("A") ? "B" : "A") + a.slice(-1);
    expect(decryptSecret(tampered)).toBeNull();
    expect(decryptSecret("plaintext-token")).toBeNull();
    expect(decryptSecret("enc:v1:only-one-part")).toBeNull();
  });
});

describe("phase 4: WhatsApp connection settings", () => {
  it("saves credentials encrypted and never exposes the token in status", async () => {
    const { workspace } = await makeWorkspace("conn-a@example.com", "Conn A");

    const saved = await saveWhatsAppConnection(
      workspace.id,
      {
        accessToken: "EAAG-secret-token",
        phoneNumberId: "123456789012345",
        webhookVerifyKey: "my-verify-word",
      },
      db,
    );
    expect(saved.ok).toBe(true);

    const row = await db.whatsAppConnection.findUnique({
      where: { workspaceId: workspace.id },
    });
    expect(row?.accessTokenEnc).not.toContain("EAAG-secret-token");
    expect(decryptSecret(row?.accessTokenEnc ?? "")).toBe("EAAG-secret-token");

    const status = await getConnectionStatus(workspace.id, db);
    expect(status.saved).toBe(true);
    expect(status.active).toBe(false);
    expect(status.hasAccessToken).toBe(true);
    expect(status.phoneNumberId).toBe("123456789012345");
    expect(JSON.stringify(status)).not.toContain("EAAG-secret-token");
  });

  it("keeps the saved token when the token field is left blank", async () => {
    const { workspace } = await makeWorkspace("conn-b@example.com", "Conn B");
    await saveWhatsAppConnection(
      workspace.id,
      {
        accessToken: "first-token",
        phoneNumberId: "111222333444555",
        webhookVerifyKey: "word-one",
      },
      db,
    );
    const again = await saveWhatsAppConnection(
      workspace.id,
      { accessToken: "", phoneNumberId: "999888777666555", webhookVerifyKey: "word-two" },
      db,
    );
    expect(again.ok).toBe(true);
    const row = await db.whatsAppConnection.findUnique({
      where: { workspaceId: workspace.id },
    });
    expect(decryptSecret(row?.accessTokenEnc ?? "")).toBe("first-token");
    expect(row?.phoneNumberId).toBe("999888777666555");
  });

  it("refuses bad input: non-numeric ID, missing verify word, missing first token", async () => {
    const { workspace } = await makeWorkspace("conn-c@example.com", "Conn C");
    const badId = await saveWhatsAppConnection(
      workspace.id,
      { accessToken: "tok", phoneNumberId: "not-a-number", webhookVerifyKey: "word" },
      db,
    );
    expect(badId.ok).toBe(false);
    const noWord = await saveWhatsAppConnection(
      workspace.id,
      { accessToken: "tok", phoneNumberId: "12345678901", webhookVerifyKey: "  " },
      db,
    );
    expect(noWord.ok).toBe(false);
    const noToken = await saveWhatsAppConnection(
      workspace.id,
      { accessToken: "", phoneNumberId: "12345678901", webhookVerifyKey: "word" },
      db,
    );
    expect(noToken.ok).toBe(false);
    const status = await getConnectionStatus(workspace.id, db);
    expect(status.saved).toBe(false);
  });

  it("is workspace-scoped: one workspace's settings never appear in another", async () => {
    const a = await makeWorkspace("conn-d@example.com", "Conn D");
    const b = await makeWorkspace("conn-e@example.com", "Conn E");
    await saveWhatsAppConnection(
      a.workspace.id,
      {
        accessToken: "token-for-a",
        phoneNumberId: "100200300400500",
        webhookVerifyKey: "word-a",
      },
      db,
    );
    const statusB = await getConnectionStatus(b.workspace.id, db);
    expect(statusB.saved).toBe(false);
    expect(statusB.phoneNumberId).toBe("");

    await saveWhatsAppConnection(
      b.workspace.id,
      {
        accessToken: "token-for-b",
        phoneNumberId: "500400300200100",
        webhookVerifyKey: "word-b",
      },
      db,
    );
    const statusA = await getConnectionStatus(a.workspace.id, db);
    expect(statusA.phoneNumberId).toBe("100200300400500");
    expect(statusA.webhookVerifyKey).toBe("word-a");
  });
});

describe("phase 4: health check", () => {
  it("reports up for a working database and down for a broken one", async () => {
    expect(await checkDatabase(db)).toBe(true);
    const broken = new PrismaClient({
      datasources: { db: { url: "file:/no-such-dir-inboxora/db.db" } },
    });
    expect(await checkDatabase(broken)).toBe(false);
    await broken.$disconnect().catch(() => undefined);
  });
});
