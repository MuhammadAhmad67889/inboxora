import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/SignOutButton";
import { TicketActions } from "@/components/TicketActions";
import { getCurrentUser } from "@/lib/session";
import { isTicketStatus, listTickets, TICKET_STATUSES } from "@/lib/tickets";
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

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspaces = await listWorkspacesForUser(user.id);
  const current = workspaces[0];
  if (!current) redirect("/signup");

  const { status: rawStatus } = await searchParams;
  const statusFilter = isTicketStatus(rawStatus) ? rawStatus : undefined;
  const tickets = await listTickets(current.workspace.id, undefined, statusFilter);

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Tickets</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {current.workspace.name} · chats that need a human
          </p>
        </div>
        <div className="flex gap-2">
          <Link className="btn-ghost" href="/inbox">
            Inbox
          </Link>
          <SignOutButton />
        </div>
      </header>

      <nav aria-label="Ticket status filters" className="mt-6 flex flex-wrap gap-2">
        <Link
          aria-current={!statusFilter ? "page" : undefined}
          className={
            !statusFilter
              ? "rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-sm font-semibold text-white"
              : "rounded-full border border-[var(--color-line)] bg-white px-4 py-1.5 text-sm"
          }
          href="/tickets"
        >
          All
        </Link>
        {TICKET_STATUSES.map((status) => (
          <Link
            aria-current={statusFilter === status ? "page" : undefined}
            className={
              statusFilter === status
                ? "rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-sm font-semibold capitalize text-white"
                : "rounded-full border border-[var(--color-line)] bg-white px-4 py-1.5 text-sm capitalize"
            }
            href={`/tickets?status=${status}`}
            key={status}
          >
            {status}
          </Link>
        ))}
      </nav>

      <section className="mt-4 overflow-hidden rounded-xl border border-[var(--color-line)] bg-white">
        {tickets.length === 0 ? (
          <p className="p-6 text-[var(--color-muted)]">
            No tickets here. Tickets appear when the AI finds no answer in your
            FAQ, or when you flag a chat for a human.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {tickets.map((ticket) => (
              <li className="px-5 py-4" key={ticket.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    className="font-semibold underline"
                    href={`/inbox/${ticket.conversationId}`}
                  >
                    {ticket.conversation.contact.name ??
                      ticket.conversation.contact.phone}
                  </Link>
                  <span className="text-sm text-[var(--color-muted)]">
                    {formatTime(ticket.createdAt)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[var(--color-muted)]">
                  {ticket.conversation.contact.phone} · status: {ticket.status} ·
                  priority: {ticket.priority} ·{" "}
                  {ticket.source === "ai-no-match"
                    ? "created by AI (no FAQ answer)"
                    : "created manually"}
                  {ticket.conversation.isDemo && (
                    <span className="demo-badge ml-2">Demo</span>
                  )}
                </p>
                {ticket.notes && <p className="mt-1 text-sm">{ticket.notes}</p>}
                <div className="mt-2">
                  <TicketActions
                    status={ticket.status}
                    ticketId={ticket.id}
                    workspaceId={current.workspace.id}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
