"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export interface DraftView {
  aiMode: string | null;
  id: string;
  sourceLabel: string | null;
  text: string;
}

type PanelState =
  | { kind: "idle" }
  | { draft: DraftView; kind: "draft" }
  | { kind: "no-match" };

/**
 * The AI draft panel for one conversation. "Draft with AI" asks the
 * server for a draft based only on the workspace FAQ. The draft
 * shows its source and whether it is demo or live AI. Nothing is
 * sent until the agent presses "Approve and send". When the FAQ
 * has no answer, the server creates a ticket and the panel says so
 * plainly.
 */
export function DraftPanel({
  conversationId,
  initialDraft,
  workspaceId,
}: {
  conversationId: string;
  initialDraft: DraftView | null;
  workspaceId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [state, setState] = useState<PanelState>(
    initialDraft ? { draft: initialDraft, kind: "draft" } : { kind: "idle" },
  );
  const [draftText, setDraftText] = useState(initialDraft?.text ?? "");
  const [ticketNote, setTicketNote] = useState("");

  async function post(path: string, payload: Record<string, unknown>) {
    const res = await fetch(path, {
      body: JSON.stringify({ workspaceId, ...payload }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const data = (await res.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    return { data, ok: res.ok };
  }

  function showError(data: Record<string, unknown> | null) {
    const errors = data?.errors as Record<string, string> | undefined;
    setError(errors?.form ?? "Something went wrong. Try again.");
  }

  async function onDraft() {
    setBusy(true);
    setError("");
    setTicketNote("");
    const { data, ok } = await post(`/api/inbox/${conversationId}/draft`, {});
    setBusy(false);
    if (!ok || !data) {
      showError(data);
      return;
    }
    if (data.kind === "no-match") {
      setState({ kind: "no-match" });
      router.refresh();
      return;
    }
    const draft = data.draft as DraftView;
    setState({ draft, kind: "draft" });
    setDraftText(draft.text);
  }

  async function onApprove() {
    if (state.kind !== "draft") return;
    setBusy(true);
    setError("");
    const { data, ok } = await post(`/api/inbox/${conversationId}/approve-draft`, {
      draftId: state.draft.id,
      text: draftText,
    });
    setBusy(false);
    if (!ok) {
      showError(data);
      return;
    }
    setState({ kind: "idle" });
    setDraftText("");
    router.refresh();
  }

  async function onDiscard() {
    if (state.kind !== "draft") return;
    setBusy(true);
    setError("");
    const { data, ok } = await post(`/api/inbox/${conversationId}/discard-draft`, {
      draftId: state.draft.id,
    });
    setBusy(false);
    if (!ok) {
      showError(data);
      return;
    }
    setState({ kind: "idle" });
    setDraftText("");
    router.refresh();
  }

  async function onCreateTicket() {
    setBusy(true);
    setError("");
    const { data, ok } = await post(`/api/tickets`, {
      conversationId,
      notes: "Flagged for a human from the conversation thread.",
    });
    setBusy(false);
    if (!ok) {
      showError(data);
      return;
    }
    setTicketNote("Ticket created — see the Tickets page.");
    router.refresh();
  }

  return (
    <section className="mt-6 rounded-xl border border-[var(--color-line)] bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">AI draft</h2>
        <span className="text-xs text-[var(--color-muted)]">
          Drafts use only your FAQ and business info. You approve every send.
        </span>
      </div>

      {state.kind === "idle" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className="btn-primary" disabled={busy} onClick={onDraft} type="button">
            {busy ? "Drafting…" : "Draft with AI"}
          </button>
          <button className="btn-ghost" disabled={busy} onClick={onCreateTicket} type="button">
            Flag for a human
          </button>
        </div>
      )}

      {state.kind === "draft" && (
        <div className="mt-3">
          <p className="text-sm">
            <span className="demo-badge mr-2">
              {state.draft.aiMode === "live" ? "Live AI" : "Demo AI"}
            </span>
            {state.draft.aiMode === "live"
              ? "Written by the live model from your FAQ."
              : "Demo mode: this is your FAQ entry's own text — no live AI is connected."}
          </p>
          {state.draft.sourceLabel && (
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Source: {state.draft.sourceLabel}
            </p>
          )}
          <label className="mt-2 block">
            <span className="mb-1 block text-sm font-semibold">Draft reply</span>
            <textarea
              aria-label="Draft reply"
              className="field"
              maxLength={2000}
              onChange={(event) => setDraftText(event.target.value)}
              rows={4}
              value={draftText}
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn-primary" disabled={busy} onClick={onApprove} type="button">
              {busy ? "Sending…" : "Approve and send"}
            </button>
            <button className="btn-ghost" disabled={busy} onClick={onDiscard} type="button">
              Discard draft
            </button>
          </div>
        </div>
      )}

      {state.kind === "no-match" && (
        <div className="mt-3">
          <p className="text-sm font-semibold">
            No answer in your FAQ — needs a human.
          </p>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            A ticket was created for this chat so it is not lost. Reply by hand
            below, or add the answer to your FAQ for next time.{" "}
            <Link className="underline" href="/tickets">
              View tickets
            </Link>
          </p>
          <button
            className="btn-ghost mt-3"
            disabled={busy}
            onClick={() => setState({ kind: "idle" })}
            type="button"
          >
            Try drafting again
          </button>
        </div>
      )}

      {ticketNote && <p className="mt-2 text-sm">{ticketNote}</p>}
      {error && <p className="error-text mt-2">{error}</p>}
    </section>
  );
}
