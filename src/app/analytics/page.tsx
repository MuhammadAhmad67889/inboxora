import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { SignOutButton } from "@/components/SignOutButton";
import { formatDuration, getAnalytics, type NamedCount } from "@/lib/analytics";
import { getCurrentUser } from "@/lib/session";
import { listWorkspacesForUser } from "@/lib/workspaces";

export const dynamic = "force-dynamic";

/** The two periods the toggle offers. Anything else in the URL
 * falls back to 30 days. */
const RANGES = [7, 30] as const;

function parseRange(raw: string | undefined): number {
  const days = Number(raw);
  return (RANGES as readonly number[]).includes(days) ? days : 30;
}

function percent(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

function Card({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="rounded-xl border border-[var(--color-line)] bg-white p-5">
      <h2 className="text-lg font-bold">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-sm text-[var(--color-muted)]">{label}</p>
    </div>
  );
}

/** Simple horizontal bars (plain divs — no chart library). */
function BarRows({ emptyText, rows }: { emptyText: string; rows: NamedCount[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-[var(--color-muted)]">{emptyText}</p>;
  }
  const max = Math.max(...rows.map((row) => row.count), 1);
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li className="flex items-center gap-3 text-sm" key={row.label}>
          <span className="w-24 shrink-0 capitalize">{row.label}</span>
          <span className="h-3 flex-1 overflow-hidden rounded bg-[var(--color-paper)]">
            <span
              className="block h-full bg-[var(--color-accent)]"
              style={{ width: `${Math.round((row.count / max) * 100)}%` }}
            />
          </span>
          <span className="w-8 text-right font-semibold">{row.count}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  // The period comes from the URL, so it does not need to wait
  // for the session lookup. Resolve both at once.
  const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
  if (!user) redirect("/login");

  const workspaces = await listWorkspacesForUser(user.id);
  const current = workspaces[0];
  if (!current) redirect("/signup");

  const days = parseRange(params.days);
  const stats = await getAnalytics(current.workspace.id, days);
  const { conversations, drafts, responseTimes, tickets } = stats;

  const maxPerDay = Math.max(...conversations.perDay.map((d) => d.count), 1);
  // Label every bar for a week, every fifth bar for a month, so
  // the dates stay readable on a phone.
  const labelEvery = days > 14 ? 5 : 1;

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {current.workspace.name} · last {days} days
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="btn-ghost" href="/inbox">
            Inbox
          </Link>
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
          These numbers come from the simulated demo chats, so you can see how
          the page works. They are not real customer data.
        </p>
      )}

      <nav aria-label="Time period" className="mt-6 flex flex-wrap gap-2">
        {RANGES.map((range) => (
          <Link
            aria-current={days === range ? "page" : undefined}
            className={
              days === range
                ? "rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-sm font-semibold text-white"
                : "rounded-full border border-[var(--color-line)] bg-white px-4 py-1.5 text-sm"
            }
            href={`/analytics?days=${range}`}
            key={range}
          >
            Last {range} days
          </Link>
        ))}
      </nav>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Card title="Conversations">
          <div className="grid grid-cols-2 gap-4">
            <Stat label={`started in last ${days} days`} value={String(conversations.total)} />
            <Stat label="unread messages now" value={String(conversations.unreadNow)} />
            <Stat label="still open" value={String(conversations.open)} />
            <Stat label="resolved" value={String(conversations.resolved)} />
          </div>
        </Card>

        <Card title="Resolution">
          <div className="grid grid-cols-2 gap-4">
            <Stat
              label="of chats started in this period are resolved"
              value={percent(conversations.resolutionRate)}
            />
            <Stat label="tickets created" value={String(tickets.created)} />
            <Stat label="tickets resolved" value={String(tickets.resolved)} />
            <Stat label="tickets still open" value={String(tickets.stillOpen)} />
          </div>
          <p className="mt-3 text-sm text-[var(--color-muted)]">
            {tickets.aiNoMatch} ticket{tickets.aiNoMatch === 1 ? "" : "s"} came
            from the AI finding no answer in your FAQ.
          </p>
        </Card>
      </div>

      <div className="mt-4">
        <Card title={`Conversations per day (last ${days} days)`}>
          {conversations.total === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">
              No conversations started in this period yet.
            </p>
          ) : (
            <>
              <div
                aria-label="Bar chart of conversations started per day"
                className="flex h-32 items-end gap-1"
                role="img"
              >
                {conversations.perDay.map((day) => (
                  <div
                    className="flex-1 rounded-t bg-[var(--color-accent)]"
                    key={day.date}
                    style={{
                      height: `${Math.max(2, Math.round((day.count / maxPerDay) * 100))}%`,
                      opacity: day.count === 0 ? 0.15 : 1,
                    }}
                    title={`${day.date}: ${day.count} conversation${day.count === 1 ? "" : "s"}`}
                  />
                ))}
              </div>
              <div className="mt-1 flex gap-1 text-xs text-[var(--color-muted)]">
                {conversations.perDay.map((day, index) => (
                  <span className="flex-1 text-center" key={day.date}>
                    {index % labelEvery === 0 ? day.date.slice(8) : ""}
                  </span>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Card title="Response times">
          {responseTimes.firstSamples === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">
              Not enough data yet — no conversation in this period has a reply
              to measure.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <Stat
                label={`typical first reply (median of ${responseTimes.firstSamples})`}
                value={formatDuration(responseTimes.firstMedianMs)}
              />
              <Stat
                label="average first reply"
                value={formatDuration(responseTimes.firstAverageMs)}
              />
              <Stat
                label={`typical reply wait (median of ${responseTimes.replySamples})`}
                value={formatDuration(responseTimes.replyMedianMs)}
              />
              <Stat
                label="average reply wait"
                value={formatDuration(responseTimes.replyAverageMs)}
              />
            </div>
          )}
          <p className="mt-3 text-sm text-[var(--color-muted)]">
            Measured from the customer&apos;s message to your reply, for
            conversations started in this period.
          </p>
        </Card>

        <Card title="AI drafts">
          <div className="grid grid-cols-2 gap-4">
            <Stat label="drafts generated" value={String(drafts.generated)} />
            <Stat label="waiting for review now" value={String(drafts.waitingNow)} />
            <Stat label="sent as-is" value={String(drafts.sentAsIs)} />
            <Stat label="edited before sending" value={String(drafts.edited)} />
            <Stat label="discarded" value={String(drafts.discarded)} />
            <Stat
              label="of decided drafts were sent"
              value={percent(drafts.acceptanceRate)}
            />
          </div>
          <p className="mt-3 text-sm text-[var(--color-muted)]">
            Draft outcomes are recorded from the day this tracking was added;
            drafts from before that are not counted.
          </p>
        </Card>

        <Card title="Team">
          {stats.assignees.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">No team members yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {stats.assignees.map((row) => (
                <li className="flex items-center justify-between gap-3" key={row.userId}>
                  <span>{row.label}</span>
                  <span className="text-[var(--color-muted)]">
                    {row.assigned} assigned · {row.resolved} resolved
                  </span>
                </li>
              ))}
              <li className="flex items-center justify-between gap-3 border-t border-[var(--color-line)] pt-2">
                <span>Unassigned</span>
                <span className="text-[var(--color-muted)]">{stats.unassigned}</span>
              </li>
            </ul>
          )}
        </Card>

        <Card title="Tags and priorities">
          <p className="mb-2 text-sm font-semibold">By tag</p>
          <BarRows
            emptyText="No tagged conversations in this period."
            rows={stats.tags}
          />
          <p className="mb-2 mt-4 text-sm font-semibold">By priority</p>
          <BarRows emptyText="No conversations in this period." rows={stats.priorities} />
        </Card>
      </div>
    </main>
  );
}
