"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { appendQuickReply, fillQuickReply } from "@/lib/quickReplyText";

export interface QuickReplyOption {
  body: string;
  id: string;
  title: string;
}

/** Reply box for one conversation. Sending records the message via
 * the demo provider — nothing goes to WhatsApp yet. In demo chats a
 * second button simulates the customer replying back.
 *
 * Quick replies insert their text into the draft box only. They
 * never send by themselves: a person reviews the text and presses
 * Send, same as a hand-typed reply. */
export function ReplyBox({
  contactName,
  conversationId,
  isDemo,
  quickReplies,
  workspaceId,
}: {
  contactName: string | null;
  conversationId: string;
  isDemo: boolean;
  quickReplies: QuickReplyOption[];
  workspaceId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [text, setText] = useState("");

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
    const ok = await post(`/api/inbox/${conversationId}/reply`, { text });
    if (ok) setText("");
  }

  async function onSimulate() {
    await post(`/api/inbox/${conversationId}/simulate`, {});
  }

  function onInsertQuickReply(quickReply: QuickReplyOption) {
    const filled = fillQuickReply(quickReply.body, contactName);
    setText((current) => appendQuickReply(current, filled));
  }

  return (
    <section className="mt-8 rounded-xl border border-[var(--color-line)] bg-white p-4">
      {quickReplies.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">Quick replies:</span>
          {quickReplies.map((quickReply) => (
            <button
              className="rounded-full border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-1 text-sm"
              disabled={busy}
              key={quickReply.id}
              onClick={() => onInsertQuickReply(quickReply)}
              title={fillQuickReply(quickReply.body, contactName)}
              type="button"
            >
              {quickReply.title}
            </button>
          ))}
          <span className="text-xs text-[var(--color-muted)]">
            Tap to insert — you still review and press Send.
          </span>
        </div>
      )}
      <form className="flex flex-wrap items-end gap-2" onSubmit={onSend}>
        <label className="min-w-56 flex-1">
          <span className="mb-1 block text-sm font-semibold">Reply</span>
          <textarea
            className="field"
            maxLength={2000}
            name="text"
            onChange={(event) => setText(event.target.value)}
            placeholder="Write your reply…"
            required
            rows={3}
            value={text}
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
