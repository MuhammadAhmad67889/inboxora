"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TAG_COLOR_OPTIONS, tagChipStyle } from "./TagChip";

export interface TagView {
  color: string | null;
  id: string;
  name: string;
}

/** Tags for one conversation: current tags with a remove button,
 * a picker for existing workspace tags, and a small form to
 * create a brand-new tag and attach it in one step. */
export function TagEditor({
  allTags,
  attachedTags,
  conversationId,
  workspaceId,
}: {
  allTags: TagView[];
  attachedTags: TagView[];
  conversationId: string;
  workspaceId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const attachedIds = new Set(attachedTags.map((tag) => tag.id));
  const availableTags = allTags.filter((tag) => !attachedIds.has(tag.id));

  async function call(method: string, payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/inbox/${conversationId}/tags`, {
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

  async function onAddExisting(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const tagId = String(new FormData(event.currentTarget).get("tagId") ?? "");
    if (tagId) await call("POST", { tagId });
  }

  async function onCreateAndAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const ok = await call("POST", {
      color: data.get("color"),
      name: data.get("name"),
    });
    if (ok) form.reset();
  }

  return (
    <section className="mt-4 rounded-xl border border-[var(--color-line)] bg-white p-4">
      <h2 className="text-sm font-semibold">Tags</h2>
      {attachedTags.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          No tags on this conversation yet.
        </p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-2">
          {attachedTags.map((tag) => (
            <li key={tag.id}>
              <span
                className="inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2 text-xs font-semibold"
                style={tagChipStyle(tag.color)}
              >
                {tag.name}
                <button
                  aria-label={`Remove tag ${tag.name}`}
                  className="rounded-full px-1 font-bold"
                  disabled={busy}
                  onClick={() => call("DELETE", { tagId: tag.id })}
                  type="button"
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-end gap-2">
        {availableTags.length > 0 && (
          <form className="flex items-end gap-2" onSubmit={onAddExisting}>
            <label>
              <span className="mb-1 block text-sm font-semibold">Add a tag</span>
              <select className="field max-w-48" name="tagId">
                {availableTags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn-ghost" disabled={busy} type="submit">
              Add
            </button>
          </form>
        )}

        <form className="flex flex-wrap items-end gap-2" onSubmit={onCreateAndAdd}>
          <label>
            <span className="mb-1 block text-sm font-semibold">New tag</span>
            <input
              className="field max-w-40"
              maxLength={40}
              name="name"
              placeholder="e.g. VIP"
              required
            />
          </label>
          <label>
            <span className="mb-1 block text-sm font-semibold">Color</span>
            <select className="field max-w-32" name="color">
              {TAG_COLOR_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button className="btn-ghost" disabled={busy} type="submit">
            Create &amp; add
          </button>
        </form>
      </div>
      {error && <p className="error-text mt-2">{error}</p>}
    </section>
  );
}
