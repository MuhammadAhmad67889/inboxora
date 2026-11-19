import Link from "next/link";
import { redirect } from "next/navigation";
import { ConnectWhatsAppForm } from "@/components/ConnectWhatsAppForm";
import { SignOutButton } from "@/components/SignOutButton";
import { getConnectionStatus } from "@/lib/connection";
import { getCurrentUser } from "@/lib/session";
import { listWorkspacesForUser, ROLES } from "@/lib/workspaces";

export const dynamic = "force-dynamic";

const verificationSteps = [
  "Create a Meta Business account for your business.",
  "Verify the business with Meta: legal name and address documents, plus a business website.",
  "Use a phone number that is not already active on the WhatsApp app.",
  "Create a Meta app, add the WhatsApp product, and copy the phone number ID and access token.",
  "Point Meta's webhook at this app and enter the same verify token you save below.",
];

export default async function ConnectPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspaces = await listWorkspacesForUser(user.id);
  const current = workspaces[0];
  if (!current) redirect("/signup");

  const connection = await getConnectionStatus(current.workspace.id);
  const isOwner = current.membership.role === ROLES.owner;

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Connect WhatsApp</h1>
        <div className="flex gap-2">
          <Link className="btn-ghost" href="/inbox">
            Inbox
          </Link>
          <Link className="btn-ghost" href="/settings">
            Settings
          </Link>
          <SignOutButton />
        </div>
      </header>

      <section className="mt-8 rounded-xl border border-[var(--color-note-line)] bg-[var(--color-note)] p-6">
        <h2 className="text-xl font-semibold">Not connected</h2>
        <p className="mt-2">
          Not connected. Live sending starts after Meta business verification.
          You can save your Meta details here now so they are ready, but Inboxora
          will not send or receive real WhatsApp messages until verification is
          done. Until then, everything runs in clearly labelled demo mode.
        </p>
      </section>

      <section className="mt-8 rounded-xl border border-[var(--color-line)] bg-white p-6">
        <h2 className="text-xl font-semibold">What Meta requires first</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-[var(--color-muted)]">
          {verificationSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="mt-3 text-sm text-[var(--color-muted)]">
          Meta also charges per delivered message, and outside the 24-hour
          reply window only pre-approved templates may be sent.
        </p>
      </section>

      <section className="mt-8 rounded-xl border border-[var(--color-line)] bg-white p-6">
        <h2 className="text-xl font-semibold">Your Meta details</h2>
        {connection.saved && (
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            Details are saved for this workspace. They stay inactive until Meta
            verification is complete.
          </p>
        )}
        {isOwner ? (
          <ConnectWhatsAppForm
            connection={connection}
            workspaceId={current.workspace.id}
          />
        ) : (
          <p className="mt-2 text-[var(--color-muted)]">
            Only the workspace owner can change these settings.
          </p>
        )}
      </section>
    </main>
  );
}
