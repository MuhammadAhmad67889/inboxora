"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SignupPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    const form = new FormData(event.currentTarget);
    const res = await fetch("/api/auth/signup", {
      body: JSON.stringify({
        businessName: form.get("businessName"),
        email: form.get("email"),
        name: form.get("name"),
        password: form.get("password"),
      }),
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
    router.push("/inbox");
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-md px-5 py-12">
      <h1 className="text-3xl font-bold">Create your account</h1>
      <p className="mt-2 text-[var(--color-muted)]">
        Your workspace starts in demo mode with simulated chats, so you can try the
        inbox straight away.
      </p>
      <form className="mt-8 space-y-4" onSubmit={onSubmit}>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="businessName">
            Business name
          </label>
          <input
            className="field"
            id="businessName"
            name="businessName"
            placeholder="e.g. Demo Store"
            required
          />
          {errors.businessName && <p className="error-text mt-1">{errors.businessName}</p>}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="name">
            Your name
          </label>
          <input className="field" id="name" name="name" placeholder="Your name" />
        </div>
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
          {errors.email && <p className="error-text mt-1">{errors.email}</p>}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="password">
            Password
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
          {busy ? "Creating account…" : "Create account"}
        </button>
      </form>
      <p className="mt-6 text-sm text-[var(--color-muted)]">
        Already have an account?{" "}
        <Link className="underline" href="/login">
          Sign in
        </Link>
      </p>
    </main>
  );
}
