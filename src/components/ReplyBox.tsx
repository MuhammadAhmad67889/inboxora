"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Reply box for one conversation. Sending records the message via
 * the demo provider — nothing goes to WhatsApp yet. In demo chats a
 * second button simulates the customer replying back. */
export function ReplyBox({
  conversationId,
  isDemo,
  workspaceId,
}: {
  conversationId: string;
  isDemo: boolean;
  workspaceId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function post(path: string, payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    const res = await fetch(path, {
      body: JSON.stringify({ workspaceId, ...payload }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const data = (await res.json().catch(() => null)) as {
      errors?: Record<string, string>;
    } | null;
    setBusy(false);
    if (!res.ok) {
      setError(data?.errors?.form ?? "Something went wrong. Try again.");
      return false;
    }
    router.refresh();
    return true;
  }

  async function onSend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const text = String(new FormData(form).get("text") ?? "");
    const ok = await post(`/api/inbox/${conversationId}/reply`, { text });
    if (ok) form.reset();
  }

  async function onSimulate() {
    await post(`/api/inbox/${conversationId}/simulate`, {});
  }

  return (
    <section className="mt-8 rounded-xl border border-[var(--color-line)] bg-white p-4">
      <form className="flex flex-wrap items-end gap-2" onSubmit={onSend}>
        <label className="min-w-56 flex-1">
          <span className="mb-1 block text-sm font-semibold">Reply</span>
          <textarea
            className="field"
            maxLength={2000}
            name="text"
            placeholder="Write your reply…"
            required
            rows={3}
          />
        </label>
        <button className="btn-primary" disabled={busy} type="submit">
          {busy ? "Sending…" : "Send reply"}
        </button>
      </form>
      {isDemo && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            className="btn-ghost"
            disabled={busy}
            onClick={onSimulate}
            type="button"
          >
            Simulate customer reply
          </button>
          <span className="text-xs text-[var(--color-muted)]">
            Demo only — pretends the customer sent another message.
          </span>
        </div>
      )}
      {error && <p className="error-text mt-2">{error}</p>}
    </section>
  );
}
