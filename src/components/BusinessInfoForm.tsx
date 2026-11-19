"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface BusinessProfileView {
  address: string;
  businessName: string;
  hours: string;
  policies: string;
}

/** The business facts form. The Phase 3 AI may answer only from
 * these facts plus the FAQ entries below. */
export function BusinessInfoForm({
  profile,
  workspaceId,
}: {
  profile: BusinessProfileView;
  workspaceId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    setError("");
    const res = await fetch("/api/knowledge/business", {
      body: JSON.stringify({
        address: form.get("address"),
        businessName: form.get("businessName"),
        hours: form.get("hours"),
        policies: form.get("policies"),
        workspaceId,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const data = (await res.json().catch(() => null)) as {
      errors?: Record<string, string>;
    } | null;
    setBusy(false);
    if (!res.ok) {
      setError(data?.errors?.form ?? "Could not save. Try again.");
      return;
    }
    setMessage("Saved.");
    router.refresh();
  }

  return (
    <form className="mt-4 space-y-3" onSubmit={onSubmit}>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">Business name</span>
        <input
          className="field"
          defaultValue={profile.businessName}
          maxLength={200}
          name="businessName"
          placeholder="e.g. Demo Store"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">Opening hours</span>
        <input
          className="field"
          defaultValue={profile.hours}
          maxLength={1000}
          name="hours"
          placeholder="e.g. Monday to Saturday, 10am to 9pm. Sunday 2pm to 9pm."
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">Address</span>
        <input
          className="field"
          defaultValue={profile.address}
          maxLength={1000}
          name="address"
          placeholder="e.g. Main Boulevard, Gulberg, Lahore"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">Policies</span>
        <textarea
          className="field"
          defaultValue={profile.policies}
          maxLength={5000}
          name="policies"
          placeholder="e.g. Delivery charges, returns, payment methods…"
          rows={4}
        />
      </label>
      <button className="btn-primary" disabled={busy} type="submit">
        {busy ? "Saving…" : "Save business info"}
      </button>
      {message && <p className="text-sm">{message}</p>}
      {error && <p className="error-text">{error}</p>}
    </form>
  );
}
