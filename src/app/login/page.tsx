"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const res = await fetch("/api/auth/login", {
      body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const data = (await res.json().catch(() => null)) as {
      errors?: Record<string, string>;
    } | null;
    setBusy(false);
    if (!res.ok) {
      setError(data?.errors?.form ?? "Email or password is incorrect.");
      return;
    }
    router.push("/inbox");
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-md px-5 py-12">
      <h1 className="text-3xl font-bold">Sign in</h1>
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
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="password">
            Password
          </label>
          <input
            autoComplete="current-password"
            className="field"
            id="password"
            name="password"
            required
            type="password"
          />
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="btn-primary w-full" disabled={busy} type="submit">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="mt-6 text-sm text-[var(--color-muted)]">
        <Link className="underline" href="/forgot-password">
          Forgot your password?
        </Link>{" "}
        · New here?{" "}
        <Link className="underline" href="/signup">
          Create an account
        </Link>
      </p>
    </main>
  );
}
