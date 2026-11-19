"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface KnowledgeEntryView {
  content: string;
  id: string;
  title: string;
}

/** FAQ editor: create, edit and delete question/answer entries.
 * These entries are the only content the Phase 3 AI may answer from. */
export function KnowledgeEditor({
  entries,
  workspaceId,
}: {
  entries: KnowledgeEntryView[];
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
    const ok = await call("/api/knowledge", "POST", {
      content: data.get("content"),
      title: data.get("title"),
    });
    if (ok) form.reset();
  }

  async function onUpdate(entryId: string, event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const ok = await call(`/api/knowledge/${entryId}`, "PATCH", {
      content: data.get("content"),
      title: data.get("title"),
    });
    if (ok) setEditingId(null);
  }

  async function onDelete(entry: KnowledgeEntryView) {
    // Deleting knowledge removes answers the AI could give, so ask first.
    if (!window.confirm(`Delete "${entry.title}"?`)) return;
    await call(`/api/knowledge/${entry.id}`, "DELETE", {});
  }

  return (
    <div className="mt-4">
      {entries.length === 0 ? (
        <p className="text-[var(--color-muted)]">
          No FAQ entries yet. Add your first one below.
        </p>
      ) : (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <li
              className="rounded-lg border border-[var(--color-line)] bg-white p-4"
              key={entry.id}
            >
              {editingId === entry.id ? (
                <form
                  className="space-y-2"
                  onSubmit={(event) => onUpdate(entry.id, event)}
                >
                  <input
                    className="field"
                    defaultValue={entry.title}
                    maxLength={200}
                    name="title"
                    required
                  />
                  <textarea
                    className="field"
                    defaultValue={entry.content}
                    maxLength={5000}
                    name="content"
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
                  <p className="font-semibold">{entry.title}</p>
                  <p className="mt-1 text-sm">{entry.content}</p>
                  <div className="mt-3 flex gap-2">
                    <button
                      className="btn-ghost"
                      onClick={() => setEditingId(entry.id)}
                      type="button"
                    >
                      Edit
                    </button>
                    <button
                      className="btn-ghost"
                      disabled={busy}
                      onClick={() => onDelete(entry)}
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
        <p className="font-semibold">Add a question and answer</p>
        <input
          className="field"
          maxLength={200}
          name="title"
          placeholder="Question, e.g. What are your delivery charges?"
          required
        />
        <textarea
          className="field"
          maxLength={5000}
          name="content"
          placeholder="Answer, exactly as customers should hear it"
          required
          rows={3}
        />
        <button className="btn-primary" disabled={busy} type="submit">
          {busy ? "Adding…" : "Add entry"}
        </button>
      </form>
      {error && <p className="error-text mt-2">{error}</p>}
    </div>
  );
}
