"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** One-click entry into the seeded demo account. The demo login
 * is public on purpose (it is printed in the README) and holds
 * only simulated chats. */
export function DemoLoginButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onClick() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      body: JSON.stringify({
        email: "demo@example.com",
        password: "demo-password-123",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    setBusy(false);
    if (!res.ok) {
      setError("The demo account is not ready yet. Create your own account instead.");
      return;
    }
    router.push("/inbox");
    router.refresh();
  }

  return (
    <span className="inline-flex flex-col gap-2">
      <button className="btn-primary" disabled={busy} onClick={onClick} type="button">
        {busy ? "Opening the demo…" : "Try the demo"}
      </button>
      {error && <span className="error-text">{error}</span>}
    </span>
  );
}
