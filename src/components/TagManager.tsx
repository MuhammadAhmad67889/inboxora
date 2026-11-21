"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TAG_COLOR_OPTIONS, TagChip } from "./TagChip";

export interface ManagedTagView {
  color: string | null;
  conversationCount: number;
  id: string;
  name: string;
}

/** Tag manager for Settings: create, rename/recolor and delete
 * the workspace's tags. Deleting a tag removes the label from
 * every conversation — the conversations themselves stay. */
export function TagManager({
  tags,
  workspaceId,
}: {
  tags: ManagedTagView[];
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
    const ok = await call("/api/tags", "POST", {
      color: data.get("color"),
      name: data.get("name"),
    });
    if (ok) form.reset();
  }

  async function onUpdate(tagId: string, event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const ok = await call(`/api/tags/${tagId}`, "PATCH", {
      color: data.get("color"),
      name: data.get("name"),
    });
    if (ok) setEditingId(null);
  }

  async function onDelete(tag: ManagedTagView) {
    const warning =
      tag.conversationCount > 0
        ? `Delete "${tag.name}"? It will be removed from ${tag.conversationCount} conversation(s). The conversations themselves are not deleted.`
        : `Delete "${tag.name}"?`;
    if (!window.confirm(warning)) return;
    await call(`/api/tags/${tag.id}`, "DELETE", {});
  }

  function colorSelect(defaultValue: string | null) {
    return (
      <select className="field max-w-32" defaultValue={defaultValue ?? ""} name="color">
        {TAG_COLOR_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className="mt-4">
      {tags.length === 0 ? (
        <p className="text-[var(--color-muted)]">No tags yet. Add your first one below.</p>
      ) : (
        <ul className="space-y-3">
          {tags.map((tag) => (
            <li
              className="rounded-lg border border-[var(--color-line)] bg-white p-4"
              key={tag.id}
            >
              {editingId === tag.id ? (
                <form
                  className="flex flex-wrap items-end gap-2"
                  onSubmit={(event) => onUpdate(tag.id, event)}
                >
                  <input
                    className="field max-w-48"
                    defaultValue={tag.name}
                    maxLength={40}
                    name="name"
                    required
                  />
                  {colorSelect(tag.color)}
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
                </form>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <TagChip color={tag.color} name={tag.name} />
                    <span className="text-sm text-[var(--color-muted)]">
                      {tag.conversationCount} conversation
                      {tag.conversationCount === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span className="flex gap-2">
                    <button
                      className="btn-ghost"
                      onClick={() => setEditingId(tag.id)}
                      type="button"
                    >
                      Edit
                    </button>
                    <button
                      className="btn-ghost"
                      disabled={busy}
                      onClick={() => onDelete(tag)}
                      type="button"
                    >
                      Delete
                    </button>
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <form
        className="mt-6 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-[var(--color-line)] p-4"
        onSubmit={onCreate}
      >
        <label>
          <span className="mb-1 block text-sm font-semibold">New tag name</span>
          <input
            className="field max-w-48"
            maxLength={40}
            name="name"
            placeholder="e.g. Complaint"
            required
          />
        </label>
        <label>
          <span className="mb-1 block text-sm font-semibold">Color</span>
          {colorSelect(null)}
        </label>
        <button className="btn-primary" disabled={busy} type="submit">
          {busy ? "Adding…" : "Add tag"}
        </button>
      </form>
      {error && <p className="error-text mt-2">{error}</p>}
    </div>
  );
}
