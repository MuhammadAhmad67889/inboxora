"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface QuickReplyView {
  body: string;
  id: string;
  title: string;
}

/** Quick-reply editor: create, edit and delete saved reply
 * templates. Agents insert these into the reply box; inserting
 * never sends — a person still reviews and presses Send. */
export function QuickReplyEditor({
  quickReplies,
  workspaceId,
}: {
  quickReplies: QuickReplyView[];
  workspaceId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  async function call(path: string, method: string, payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    const res = await fetch(path, {
      body: JSON.stringify({ workspaceId, ...payload }),
      headers: { "Content-Type": "application/json" },
      method,
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

  async function onCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const ok = await call("/api/quick-replies", "POST", {
      body: data.get("body"),
      title: data.get("title"),
    });
    if (ok) form.reset();
  }

  async function onUpdate(quickReplyId: string, event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const ok = await call(`/api/quick-replies/${quickReplyId}`, "PATCH", {
      body: data.get("body"),
      title: data.get("title"),
    });
    if (ok) setEditingId(null);
  }

  async function onDelete(quickReply: QuickReplyView) {
    if (!window.confirm(`Delete "${quickReply.title}"?`)) return;
    await call(`/api/quick-replies/${quickReply.id}`, "DELETE", {});
  }

  return (
    <div className="mt-4">
      {quickReplies.length === 0 ? (
        <p className="text-[var(--color-muted)]">
          No quick replies yet. Add your first one below.
        </p>
      ) : (
        <ul className="space-y-3">
          {quickReplies.map((quickReply) => (
            <li
              className="rounded-lg border border-[var(--color-line)] bg-white p-4"
              key={quickReply.id}
            >
              {editingId === quickReply.id ? (
                <form
                  className="space-y-2"
                  onSubmit={(event) => onUpdate(quickReply.id, event)}
                >
                  <input
                    className="field"
                    defaultValue={quickReply.title}
                    maxLength={100}
                    name="title"
                    required
                  />
                  <textarea
                    className="field"
                    defaultValue={quickReply.body}
                    maxLength={2000}
                    name="body"
                    required
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <button className="btn-primary" disabled={busy} type="submit">
                      Save
                    </button>
                    <button
                      className="btn-ghost"
                      onClick={() => setEditingId(null)}
                      type="button"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <p className="font-semibold">{quickReply.title}</p>
                  <p className="mt-1 text-sm">{quickReply.body}</p>
                  <div className="mt-3 flex gap-2">
                    <button
                      className="btn-ghost"
                      onClick={() => setEditingId(quickReply.id)}
                      type="button"
                    >
                      Edit
                    </button>
                    <button
                      className="btn-ghost"
                      disabled={busy}
                      onClick={() => onDelete(quickReply)}
                      type="button"
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <form
        className="mt-6 space-y-2 rounded-lg border border-dashed border-[var(--color-line)] p-4"
        onSubmit={onCreate}
      >
        <p className="font-semibold">Add a quick reply</p>
        <input
          className="field"
          maxLength={100}
          name="title"
          placeholder="Short title, e.g. Order status"
          required
        />
        <textarea
          className="field"
          maxLength={2000}
          name="body"
          placeholder="Reply text. Use {{name}} and it becomes the customer's name."
          required
          rows={3}
        />
        <button className="btn-primary" disabled={busy} type="submit">
          {busy ? "Adding…" : "Add quick reply"}
        </button>
      </form>
      {error && <p className="error-text mt-2">{error}</p>}
    </div>
  );
}
