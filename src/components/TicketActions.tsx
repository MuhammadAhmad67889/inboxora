"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const STATUSES = ["open", "waiting", "resolved"] as const;

/** Status buttons for one ticket. */
export function TicketActions({
  status,
  ticketId,
  workspaceId,
}: {
  status: string;
  ticketId: string;
  workspaceId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function setStatus(next: string) {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/tickets/${ticketId}/status`, {
      body: JSON.stringify({ status: next, workspaceId }),
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

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {STATUSES.filter((s) => s !== status).map((s) => (
        <button
          className="btn-ghost px-3 py-1 text-sm"
          disabled={busy}
          key={s}
          onClick={() => setStatus(s)}
          type="button"
        >
          Mark {s}
        </button>
      ))}
      {error && <span className="error-text">{error}</span>}
    </span>
  );
}
