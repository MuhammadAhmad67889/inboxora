"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface ConnectionView {
  hasAccessToken: boolean;
  phoneNumberId: string;
  saved: boolean;
  webhookVerifyKey: string;
}

/** The WhatsApp credentials form. Saving stores the values for
 * later; it does not connect anything. The token field is always
 * blank — a saved token is never sent back to the browser. */
export function ConnectWhatsAppForm({
  connection,
  workspaceId,
}: {
  connection: ConnectionView;
  workspaceId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    setError("");
    const res = await fetch("/api/connection", {
      body: JSON.stringify({
        accessToken: form.get("accessToken"),
        phoneNumberId: form.get("phoneNumberId"),
        webhookVerifyKey: form.get("webhookVerifyKey"),
        workspaceId,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const data = (await res.json().catch(() => null)) as {
      errors?: Record<string, string>;
    } | null;
    setBusy(false);
    if (!res.ok) {
      setError(data?.errors?.form ?? "Could not save. Try again.");
      return;
    }
    setMessage("Saved. Nothing is connected yet. See the steps above.");
    router.refresh();
  }

  return (
    <form className="mt-4 space-y-3" onSubmit={onSubmit}>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">Phone number ID</span>
        <input
          className="field"
          defaultValue={connection.phoneNumberId}
          inputMode="numeric"
          maxLength={20}
          name="phoneNumberId"
          placeholder="The numeric ID from Meta, e.g. 123456789012345"
          required
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">Access token</span>
        <input
          autoComplete="off"
          className="field"
          maxLength={500}
          name="accessToken"
          placeholder={
            connection.hasAccessToken
              ? "A token is saved. Leave blank to keep it"
              : "Paste the token from Meta"
          }
          type="password"
        />
        <span className="mt-1 block text-sm text-[var(--color-muted)]">
          Stored encrypted. It is never shown again after saving.
        </span>
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">Webhook verify token</span>
        <input
          className="field"
          defaultValue={connection.webhookVerifyKey}
          maxLength={200}
          name="webhookVerifyKey"
          placeholder="A secret word you choose, e.g. inboxora-verify-2026"
          required
        />
        <span className="mt-1 block text-sm text-[var(--color-muted)]">
          You will type this same word into Meta&apos;s webhook settings later.
        </span>
      </label>
      <button className="btn-primary" disabled={busy} type="submit">
        {busy ? "Saving…" : "Save WhatsApp settings"}
      </button>
      {message && <p className="text-sm">{message}</p>}
      {error && <p className="error-text">{error}</p>}
    </form>
  );
}
