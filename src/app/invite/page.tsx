import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { acceptInvite } from "@/lib/workspaces";

export const dynamic = "force-dynamic";

export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const user = await getCurrentUser();

  if (!token) {
    return (
      <main className="mx-auto max-w-md px-5 py-12">
        <h1 className="text-3xl font-bold">Invite link missing</h1>
        <p className="mt-3 text-[var(--color-muted)]">
          Open the link from your invite email to join the workspace.
        </p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-md px-5 py-12">
        <h1 className="text-3xl font-bold">You are invited</h1>
        <p className="mt-3 text-[var(--color-muted)]">
          Sign in with the email this invite was sent to, then open this link again.
        </p>
        <p className="mt-6 flex gap-3">
          <Link className="btn-primary" href="/login">
            Sign in
          </Link>
          <Link className="btn-ghost" href="/signup">
            Create account
          </Link>
        </p>
      </main>
    );
  }

  const result = await acceptInvite(user.id, user.email, token);
  if (result.ok) redirect("/inbox");

  return (
    <main className="mx-auto max-w-md px-5 py-12">
      <h1 className="text-3xl font-bold">Invite not accepted</h1>
      <p className="mt-3 text-[var(--color-muted)]">{result.error}</p>
      <p className="mt-6">
        <Link className="underline" href="/inbox">
          Go to your inbox
        </Link>
      </p>
    </main>
  );
}
