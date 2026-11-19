import type { PrismaClient } from "@prisma/client";
import { decryptSecret, encryptSecret } from "./crypto";
import { getPrisma } from "./prisma";

/** WhatsApp Cloud API credentials for one workspace.
 *
 * Phase 4 stores the values so the connect screen is real, but
 * nothing sends: live messaging starts only after Meta business
 * verification (see DEPLOY.md). The access token is encrypted at
 * rest and is never returned to the browser or written to logs. */

export type ConnectionInput = {
  accessToken: string;
  phoneNumberId: string;
  webhookVerifyKey: string;
};

export type ConnectionStatus = {
  /** Always false in the MVP — no live sending until Meta verification. */
  active: false;
  hasAccessToken: boolean;
  phoneNumberId: string;
  saved: boolean;
  webhookVerifyKey: string;
};

export type SaveConnectionResult =
  | { ok: true }
  | { error: string; ok: false };

/** Meta phone number IDs are numeric strings. */
function isValidPhoneNumberId(value: string): boolean {
  return /^\d{5,20}$/.test(value);
}

export async function saveWhatsAppConnection(
  workspaceId: string,
  input: ConnectionInput,
  db: PrismaClient = getPrisma(),
): Promise<SaveConnectionResult> {
  const phoneNumberId = input.phoneNumberId.trim();
  const webhookVerifyKey = input.webhookVerifyKey.trim();
  const accessToken = input.accessToken.trim();

  if (!isValidPhoneNumberId(phoneNumberId)) {
    return {
      error: "Phone number ID should be the numeric ID from Meta (5–20 digits).",
      ok: false,
    };
  }
  if (!webhookVerifyKey) {
    return { error: "Enter a webhook verify token (any secret word you choose).", ok: false };
  }

  const existing = await db.whatsAppConnection.findUnique({ where: { workspaceId } });
  // Leaving the token field blank keeps the saved token, so owners
  // can fix the other fields without re-pasting the secret.
  const accessTokenEnc = accessToken
    ? encryptSecret(accessToken)
    : (existing?.accessTokenEnc ?? "");
  if (!accessTokenEnc) {
    return { error: "Paste the access token from Meta.", ok: false };
  }

  await db.whatsAppConnection.upsert({
    create: { accessTokenEnc, phoneNumberId, webhookVerifyKey, workspaceId },
    update: { accessTokenEnc, phoneNumberId, webhookVerifyKey },
    where: { workspaceId },
  });
  return { ok: true };
}

/** What the connect screen may show. The token itself never leaves
 * the server — only whether one is saved. */
export async function getConnectionStatus(
  workspaceId: string,
  db: PrismaClient = getPrisma(),
): Promise<ConnectionStatus> {
  const row = await db.whatsAppConnection.findUnique({ where: { workspaceId } });
  if (!row) {
    return {
      active: false,
      hasAccessToken: false,
      phoneNumberId: "",
      saved: false,
      webhookVerifyKey: "",
    };
  }
  return {
    active: false,
    hasAccessToken: decryptSecret(row.accessTokenEnc) !== null,
    phoneNumberId: row.phoneNumberId,
    saved: true,
    webhookVerifyKey: row.webhookVerifyKey,
  };
}
