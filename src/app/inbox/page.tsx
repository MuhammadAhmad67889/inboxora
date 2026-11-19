import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/SignOutButton";
import {
  isConversationFilterKind,
  listConversations,
  type ConversationFilterKind,
} from "@/lib/inbox";
import { getCurrentUser } from "@/lib/session";
import { listWorkspacesForUser } from "@/lib/workspaces";

export const dynamic = "force-dynamic";

function formatTime(date: Date): string {
  return date.toLocaleString("en-GB", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  });
}

const FILTERS: Array<{ kind: ConversationFilterKind; label: string }> = [
  { kind: "all", label: "All" },
  { kind: "unread", label: "Unread" },
  { kind: "mine", label: "Mine" },
  { kind: "resolved", label: "Resolved" },
];

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspaces = await listWorkspacesForUser(user.id);
  const current = workspaces[0];
  if (!current) redirect("/signup");

  const { filter: rawFilter } = await searchParams;
  const filter: ConversationFilterKind = isConversationFilterKind(rawFilter)
    ? rawFilter
    : "all";

  const conversations = await listConversations(
    current.workspace.id,
    undefined,
    { kind: filter, userId: user.id },
  );

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{current.workspace.name}</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Signed in as {user.email} · {current.membership.role}
          </p>
        </div>
        <div className="flex gap-2">
          <Link className="btn-ghost" href="/tickets">
            Tickets
          </Link>
          <Link className="btn-ghost" href="/knowledge">
            Knowledge
          </Link>
          <Link className="btn-ghost" href="/settings">
            Settings
          </Link>
          <SignOutButton />
        </div>
      </header>

      {current.workspace.isDemo && (
        <p className="mt-6 rounded-lg border border-[var(--color-line)] bg-white p-4 text-sm">
          <span className="demo-badge mr-2">Demo</span>
          These are simulated chats so you can try the inbox. No real WhatsApp
          number is connected yet.
        </p>
      )}

      <nav aria-label="Conversation filters" className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map(({ kind, label }) => (
          <Link
            aria-current={filter === kind ? "page" : undefined}
            className={
              filter === kind
                ? "rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-sm font-semibold text-white"
                : "rounded-full border border-[var(--color-line)] bg-white px-4 py-1.5 text-sm"
            }
            href={kind === "all" ? "/inbox" : `/inbox?filter=${kind}`}
            key={kind}
          >
            {label}
          </Link>
        ))}
      </nav>

      <section className="mt-4 overflow-hidden rounded-xl border border-[var(--color-line)] bg-white">
        {conversations.length === 0 ? (
          <p className="p-6 text-[var(--color-muted)]">
            No conversations match this filter.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {conversations.map((chat) => (
              <li key={chat.id}>
                <Link
                  className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-[var(--color-paper)]"
                  href={`/inbox/${chat.id}`}
                >
                  <span>
                    <span className="font-semibold">
                      {chat.contact.name ?? chat.contact.phone}
                    </span>
                    {chat.isDemo && <span className="demo-badge ml-2">Demo</span>}
                    <span className="block text-sm text-[var(--color-muted)]">
                      {chat.contact.phone} · {chat.status}
                      {chat.assignee
                        ? ` · assigned to ${chat.assignee.name ?? chat.assignee.email}`
                        : " · unassigned"}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-sm text-[var(--color-muted)]">
                      {formatTime(chat.lastMessageAt)}
                    </span>
                    {chat.unreadCount > 0 && (
                      <span className="mt-1 inline-block rounded-full bg-[var(--color-accent)] px-2 py-0.5 text-xs font-bold text-white">
                        {chat.unreadCount} new
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
