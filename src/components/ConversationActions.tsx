"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface MemberOption {
  email: string;
  id: string;
  name: string | null;
}

/** Assign-to picker plus resolve/reopen for one conversation. */
export function ConversationActions({
  assigneeId,
  conversationId,
  members,
  status,
  workspaceId,
}: {
  assigneeId: string | null;
  conversationId: string;
  members: MemberOption[];
  status: string;
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
      return;
    }
    router.refresh();
  }

  const isResolved = status === "resolved";

  return (
    <section className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-[var(--color-line)] bg-white p-4">
      <label>
        <span className="mb-1 block text-sm font-semibold">Assigned to</span>
        <select
          className="field max-w-56"
          defaultValue={assigneeId ?? ""}
          disabled={busy}
          onChange={(event) =>
            post(`/api/inbox/${conversationId}/assign`, {
              assigneeId: event.target.value || null,
            })
          }
        >
          <option value="">Unassigned</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name ?? member.email}
            </option>
          ))}
        </select>
      </label>
      <button
        className="btn-ghost"
        disabled={busy}
        onClick={() =>
          post(`/api/inbox/${conversationId}/status`, {
            status: isResolved ? "open" : "resolved",
          })
        }
        type="button"
      >
        {isResolved ? "Reopen conversation" : "Mark resolved"}
      </button>
      {error && <p className="error-text w-full">{error}</p>}
    </section>
  );
}
