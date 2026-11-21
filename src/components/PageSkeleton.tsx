/**
 * Placeholder shown while a page waits on the database.
 *
 * The free-tier database sleeps when idle and can take a few
 * seconds to wake up. Without this, the browser shows a blank
 * page for that whole time and the app looks broken. The shapes
 * below mirror the real pages (header row + list card) so the
 * layout does not jump when the content arrives.
 */
export function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <main aria-busy="true" className="mx-auto max-w-3xl px-5 py-10">
      <p className="sr-only" role="status">
        Loading…
      </p>

      {/* Header: title on the left, action buttons on the right. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="animate-pulse">
          <div className="h-8 w-48 rounded-md bg-[var(--color-line)]" />
          <div className="mt-2 h-4 w-64 rounded-md bg-[var(--color-line)]" />
        </div>
        <div className="flex gap-2">
          <div className="h-10 w-24 animate-pulse rounded-lg bg-[var(--color-line)]" />
          <div className="h-10 w-24 animate-pulse rounded-lg bg-[var(--color-line)]" />
        </div>
      </div>

      {/* List card with placeholder rows. */}
      <div className="mt-6 overflow-hidden rounded-xl border border-[var(--color-line)] bg-white">
        {Array.from({ length: rows }, (_, index) => (
          <div
            className="border-b border-[var(--color-line)] px-5 py-4 last:border-b-0"
            key={index}
          >
            <div className="flex animate-pulse items-center justify-between gap-3">
              <div>
                <div className="h-4 w-40 rounded-md bg-[var(--color-line)]" />
                <div className="mt-2 h-3 w-56 rounded-md bg-[var(--color-line)]" />
              </div>
              <div className="h-3 w-16 rounded-md bg-[var(--color-line)]" />
            </div>
          </div>
        ))}
      </div>

      <p className="mt-4 text-sm text-[var(--color-muted)]">Loading…</p>
    </main>
  );
}
