"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface NoteView {
  authorLabel: string;
  createdAtLabel: string;
  id: string;
  text: string;
}

/** Internal notes for one conversation. Rendered in a distinct
 * yellow style so nobody mistakes a note for a customer message —
 * notes are stored separately and never sent. */
export function NotesPanel({
  conversationId,
  notes,
  workspaceId,
}: {
  conversationId: string;
  notes: NoteView[];
  workspaceId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const text = String(new FormData(form).get("text") ?? "");
    setBusy(true);
    setError("");
    const res = await fetch(`/api/inbox/${conversationId}/notes`, {
      body: JSON.stringify({ text, workspaceId }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const data = (await res.json().catch(() => null)) as {
      errors?: Record<string, string>;
    } | null;
    setBusy(false);
    if (!res.ok) {
      setError(data?.errors?.form ?? "Could not add the note.");
      return;
    }
    form.reset();
    router.refresh();
  }

  return (
    <section className="mt-8 rounded-xl border border-[var(--color-note-line)] bg-[var(--color-note)] p-4">
      <h2 className="font-semibold">Internal notes</h2>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        Only your team sees these. They are never sent to the customer.
      </p>
      {notes.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--color-muted)]">No notes yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {notes.map((note) => (
            <li
              className="rounded-lg border border-[var(--color-note-line)] bg-white/70 px-3 py-2"
              key={note.id}
            >
              <p>{note.text}</p>
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                {note.authorLabel} · {note.createdAtLabel}
              </p>
            </li>
          ))}
        </ul>
      )}
      <form className="mt-4 flex flex-wrap items-end gap-2" onSubmit={onAdd}>
        <label className="min-w-56 flex-1">
          <span className="mb-1 block text-sm font-semibold">Add a note</span>
          <textarea
            className="field"
            maxLength={2000}
            name="text"
            placeholder="e.g. Customer asked for a callback after 6pm"
            required
            rows={2}
          />
        </label>
        <button className="btn-primary" disabled={busy} type="submit">
          {busy ? "Adding…" : "Add note"}
        </button>
      </form>
      {error && <p className="error-text mt-2">{error}</p>}
    </section>
  );
}
