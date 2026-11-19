"use client";

import { useState } from "react";

export function InviteForm({ workspaceId }: { workspaceId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    const form = new FormData(event.currentTarget);
    const res = await fetch("/api/workspaces/invite", {
      body: JSON.stringify({ email: form.get("email"), workspaceId }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const data = (await res.json().catch(() => null)) as {
      errors?: Record<string, string>;
    } | null;
    setBusy(false);
    if (!res.ok) {
      setError(data?.errors?.form ?? data?.errors?.email ?? "Could not send the invite.");
      return;
    }
    setMessage("Invite sent.");
    event.currentTarget.reset();
  }

  return (
    <form className="mt-4 flex flex-wrap gap-2" onSubmit={onSubmit}>
      <input
        className="field max-w-xs"
        name="email"
        placeholder="teammate@example.com"
        required
        type="email"
      />
      <button className="btn-primary" disabled={busy} type="submit">
        {busy ? "Sending…" : "Send invite"}
      </button>
      {message && <p className="w-full text-sm">{message}</p>}
      {error && <p className="error-text w-full">{error}</p>}
    </form>
  );
}
