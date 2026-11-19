"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function ResetForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    const form = new FormData(event.currentTarget);
    const res = await fetch("/api/auth/reset-password", {
      body: JSON.stringify({ password: form.get("password"), token }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const data = (await res.json().catch(() => null)) as {
      errors?: Record<string, string>;
    } | null;
    setBusy(false);
    if (!res.ok) {
      setErrors(data?.errors ?? { form: "Something went wrong. Try again." });
      return;
    }
    router.push("/login");
  }

  if (!token) {
    return (
      <p className="mt-4 text-[var(--color-muted)]">
        This page needs a reset link from your email.{" "}
        <Link className="underline" href="/forgot-password">
          Ask for a new one
        </Link>
        .
      </p>
    );
  }

  return (
    <form className="mt-8 space-y-4" onSubmit={onSubmit}>
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="password">
          New password
        </label>
        <input
          autoComplete="new-password"
          className="field"
          id="password"
          minLength={8}
          name="password"
          required
          type="password"
        />
        {errors.password && <p className="error-text mt-1">{errors.password}</p>}
      </div>
      {errors.form && <p className="error-text">{errors.form}</p>}
      <button className="btn-primary w-full" disabled={busy} type="submit">
        {busy ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="mx-auto max-w-md px-5 py-12">
      <h1 className="text-3xl font-bold">Set a new password</h1>
      <Suspense>
        <ResetForm />
      </Suspense>
    </main>
  );
}
