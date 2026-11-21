"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DemoLoginButton } from "@/components/DemoLoginButton";

/**
 * The landing page is static HTML, so the signed-in state is
 * checked in the browser instead of on the server. Both landing
 * components share one /api/me request through this cached
 * promise, so the page never asks twice.
 */
let sessionRequest: Promise<string | null> | null = null;

function fetchSessionEmail(): Promise<string | null> {
  if (!sessionRequest) {
    sessionRequest = fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { email?: unknown } | null) =>
        typeof data?.email === "string" ? data.email : null,
      )
      // If the check fails, stay with the signed-out view. The
      // landing page must never break over a session lookup.
      .catch(() => null);
  }
  return sessionRequest;
}

/** Signed-in email, or null while unknown / signed out. */
function useSessionEmail(): string | null {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSessionEmail().then((found) => {
      if (!cancelled) setEmail(found);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return email;
}

/** Header link: "Sign in" until a session is found. */
export function LandingHeaderLink() {
  const email = useSessionEmail();

  if (email) {
    return (
      <Link className="btn-ghost" href="/inbox">
        Open your inbox
      </Link>
    );
  }
  return (
    <Link className="btn-ghost" href="/login">
      Sign in
    </Link>
  );
}

/** Hero actions: demo entry for visitors, inbox link for users. */
export function LandingHeroActions() {
  const email = useSessionEmail();

  if (email) {
    return (
      <Link className="btn-primary" href="/inbox">
        Open your inbox
      </Link>
    );
  }
  return (
    <>
      <DemoLoginButton />
      <Link className="btn-ghost" href="/signup">
        Create an account
      </Link>
    </>
  );
}
