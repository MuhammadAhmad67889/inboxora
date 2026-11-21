import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/SignOutButton";
import { PriorityBadge, PRIORITY_OPTIONS, TagChip } from "@/components/TagChip";
import {
  isConversationFilterKind,
  isConversationPriority,
  isConversationSort,
  listConversations,
  UNASSIGNED,
  type ConversationFilterKind,
  type ConversationSort,
} from "@/lib/inbox";
import { getCurrentUser } from "@/lib/session";
import { listTags } from "@/lib/tags";
import { listMembers, listWorkspacesForUser } from "@/lib/workspaces";

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

/** Build an inbox URL that keeps the active search, assignee,
 * tag, priority and sort, so switching a filter pill never
 * loses them. */
function inboxHref(params: {
  assignee: string;
  filter: ConversationFilterKind;
  priority: string;
  q: string;
  sort: ConversationSort;
  tag: string;
}): string {
  const query = new URLSearchParams();
  if (params.filter !== "all") query.set("filter", params.filter);
  if (params.q) query.set("q", params.q);
  if (params.assignee) query.set("assignee", params.assignee);
  if (params.tag) query.set("tag", params.tag);
  if (params.priority) query.set("priority", params.priority);
  if (params.sort !== "recent") query.set("sort", params.sort);
  const text = query.toString();
  return text ? `/inbox?${text}` : "/inbox";
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{
    assignee?: string;
    filter?: string;
    priority?: string;
    q?: string;
    sort?: string;
    tag?: string;
  }>;
}) {
  // The filters come from the URL, so they do not need to wait
  // for the session lookup. Resolve both at the same time.
  const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
  if (!user) redirect("/login");

  const workspaces = await listWorkspacesForUser(user.id);
  const current = workspaces[0];
  if (!current) redirect("/signup");

  const filter: ConversationFilterKind = isConversationFilterKind(params.filter)
    ? params.filter
    : "all";
  const search = (params.q ?? "").trim();

  const members = await listMembers(current.workspace.id);
  // Only accept "unassigned" or a real member's id — anything else
  // in the URL is ignored instead of filtering to an empty list.
  const assignee =
    params.assignee === UNASSIGNED ||
    members.some((member) => member.user.id === params.assignee)
      ? (params.assignee ?? "")
      : "";

  // Same idea for the tag filter: only a real tag id from this
  // workspace counts; anything else in the URL is ignored.
  const tags = await listTags(current.workspace.id);
  const tagId = tags.some((tag) => tag.id === params.tag) ? (params.tag ?? "") : "";
  const priority = isConversationPriority(params.priority) ? params.priority : "";
  const sort: ConversationSort = isConversationSort(params.sort)
    ? params.sort
    : "recent";

  const conversations = await listConversations(current.workspace.id, undefined, {
    assignee: assignee || undefined,
    kind: filter,
    priority: priority || undefined,
    search: search || undefined,
    sort,
    tagId: tagId || undefined,
    userId: user.id,
  });

  const hasActiveFilters =
    filter !== "all" ||
    search !== "" ||
    assignee !== "" ||
    tagId !== "" ||
    priority !== "" ||
    sort !== "recent";

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
          <Link className="btn-ghost" href="/analytics">
            Analytics
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

      <form
        action="/inbox"
        className="mt-6 flex flex-wrap items-end gap-2"
        method="get"
        role="search"
      >
        {/* Keep the active filter pill when the search is submitted. */}
        {filter !== "all" && <input name="filter" type="hidden" value={filter} />}
        <label className="min-w-52 flex-1">
          <span className="mb-1 block text-sm font-semibold">Search chats</span>
          <input
            className="field"
            defaultValue={search}
            name="q"
            placeholder="Name, phone or message text…"
            type="search"
          />
        </label>
        <label>
          <span className="mb-1 block text-sm font-semibold">Assigned to</span>
          <select className="field" defaultValue={assignee} name="assignee">
            <option value="">Anyone</option>
            <option value={UNASSIGNED}>Unassigned</option>
            {members.map((member) => (
              <option key={member.user.id} value={member.user.id}>
                {member.user.name ?? member.user.email}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-sm font-semibold">Tag</span>
          <select className="field" defaultValue={tagId} name="tag">
            <option value="">Any tag</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-sm font-semibold">Priority</span>
          <select className="field" defaultValue={priority} name="priority">
            <option value="">Any priority</option>
            {PRIORITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-sm font-semibold">Order</span>
          <select className="field" defaultValue={sort} name="sort">
            <option value="recent">Most recent</option>
            <option value="priority">Urgent first</option>
          </select>
        </label>
        <button className="btn-primary" type="submit">
          Search
        </button>
        {hasActiveFilters && (
          <Link className="btn-ghost" href="/inbox">
            Clear filters
          </Link>
        )}
      </form>

      <nav aria-label="Conversation filters" className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map(({ kind, label }) => (
          <Link
            aria-current={filter === kind ? "page" : undefined}
            className={
              filter === kind
                ? "rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-sm font-semibold text-white"
                : "rounded-full border border-[var(--color-line)] bg-white px-4 py-1.5 text-sm"
            }
            href={inboxHref({ assignee, filter: kind, priority, q: search, sort, tag: tagId })}
            key={kind}
          >
            {label}
          </Link>
        ))}
      </nav>

      <section className="mt-4 overflow-hidden rounded-xl border border-[var(--color-line)] bg-white">
        {conversations.length === 0 ? (
          <p className="p-6 text-[var(--color-muted)]">
            {hasActiveFilters ? (
              <>
                No conversations match your search or filters.{" "}
                <Link className="underline" href="/inbox">
                  Clear them
                </Link>{" "}
                to see every chat.
              </>
            ) : (
              "No conversations yet."
            )}
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
                    <span className="ml-2">
                      <PriorityBadge priority={chat.priority} />
                    </span>
                    <span className="block text-sm text-[var(--color-muted)]">
                      {chat.contact.phone} · {chat.status}
                      {chat.assignee
                        ? ` · assigned to ${chat.assignee.name ?? chat.assignee.email}`
                        : " · unassigned"}
                    </span>
                    {chat.tags.length > 0 && (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {chat.tags.map((tag) => (
                          <TagChip color={tag.color} key={tag.id} name={tag.name} />
                        ))}
                      </span>
                    )}
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
