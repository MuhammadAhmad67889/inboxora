"use client";

import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const res = await fetch("/api/auth/forgot-password", {
      body: JSON.stringify({ email: form.get("email") }),
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
    setSent(true);
  }

  return (
    <main className="mx-auto max-w-md px-5 py-12">
      <h1 className="text-3xl font-bold">Reset your password</h1>
      {sent ? (
        <p className="mt-4 text-[var(--color-muted)]">
          If that email has an account, a reset link is on its way. It works for one
          hour.
        </p>
      ) : (
        <form className="mt-8 space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="email">
              Email
            </label>
            <input
              autoComplete="email"
              className="field"
              id="email"
              name="email"
              required
              type="email"
            />
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="btn-primary w-full" disabled={busy} type="submit">
            {busy ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
      <p className="mt-6 text-sm text-[var(--color-muted)]">
        <Link className="underline" href="/login">
          Back to sign in
        </Link>
      </p>
    </main>
  );
}
