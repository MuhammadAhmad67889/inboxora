import Link from "next/link";
import { redirect } from "next/navigation";
import { InviteForm } from "@/components/InviteForm";
import { SignOutButton } from "@/components/SignOutButton";
import { getPrisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { listWorkspacesForUser, MAX_SEATS } from "@/lib/workspaces";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspaces = await listWorkspacesForUser(user.id);
  const current = workspaces[0];
  if (!current) redirect("/signup");

  const db = getPrisma();
  const members = await db.membership.findMany({
    include: { user: { select: { email: true, name: true } } },
    orderBy: { createdAt: "asc" },
    where: { workspaceId: current.workspace.id },
  });

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Settings</h1>
        <div className="flex gap-2">
          <Link className="btn-ghost" href="/inbox">
            Inbox
          </Link>
          <Link className="btn-ghost" href="/connect">
            Connect WhatsApp
          </Link>
          <SignOutButton />
        </div>
      </header>

      <section className="mt-8 rounded-xl border border-[var(--color-line)] bg-white p-6">
        <h2 className="text-xl font-semibold">
          Team ({members.length} of {MAX_SEATS} seats)
        </h2>
        <ul className="mt-4 space-y-2">
          {members.map((member) => (
            <li className="flex justify-between" key={member.id}>
              <span>{member.user.name ?? member.user.email}</span>
              <span className="text-sm text-[var(--color-muted)]">{member.role}</span>
            </li>
          ))}
        </ul>
        {current.membership.role === "owner" && (
          <div className="mt-6 border-t border-[var(--color-line)] pt-6">
            <h3 className="font-semibold">Invite a teammate</h3>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              They get a link that works for 7 days. In local dev the link is printed
              to the server console instead of emailed.
            </p>
            <InviteForm workspaceId={current.workspace.id} />
          </div>
        )}
      </section>
    </main>
  );
}
