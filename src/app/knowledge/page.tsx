import Link from "next/link";
import { redirect } from "next/navigation";
import { BusinessInfoForm } from "@/components/BusinessInfoForm";
import { KnowledgeEditor } from "@/components/KnowledgeEditor";
import { SignOutButton } from "@/components/SignOutButton";
import { getBusinessProfile, listKnowledgeEntries } from "@/lib/inbox";
import { getCurrentUser } from "@/lib/session";
import { listWorkspacesForUser } from "@/lib/workspaces";

export const dynamic = "force-dynamic";

export default async function KnowledgePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspaces = await listWorkspacesForUser(user.id);
  const current = workspaces[0];
  if (!current) redirect("/signup");

  const [profile, entries] = await Promise.all([
    getBusinessProfile(current.workspace.id),
    listKnowledgeEntries(current.workspace.id),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Knowledge base</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {current.workspace.name} · what the assistant may answer from
          </p>
        </div>
        <div className="flex gap-2">
          <Link className="btn-ghost" href="/inbox">
            Inbox
          </Link>
          <SignOutButton />
        </div>
      </header>

      <p className="mt-6 rounded-lg border border-[var(--color-line)] bg-white p-4 text-sm">
        Write your business facts and common answers here. The assistant drafts
        replies using <strong>only</strong> this content, and shows which entry
        each answer came from. Questions with no answer here become tickets.
      </p>

      <section className="mt-6 rounded-xl border border-[var(--color-line)] bg-white p-6">
        <h2 className="text-xl font-semibold">Business info</h2>
        <BusinessInfoForm
          profile={{
            address: profile?.address ?? "",
            businessName: profile?.businessName ?? current.workspace.name,
            hours: profile?.hours ?? "",
            policies: profile?.policies ?? "",
          }}
          workspaceId={current.workspace.id}
        />
      </section>

      <section className="mt-6 rounded-xl border border-[var(--color-line)] bg-white p-6">
        <h2 className="text-xl font-semibold">Questions and answers</h2>
        <KnowledgeEditor
          entries={entries.map((entry) => ({
            content: entry.content,
            id: entry.id,
            title: entry.title,
          }))}
          workspaceId={current.workspace.id}
        />
      </section>
    </main>
  );
}
