import { LandingHeaderLink, LandingHeroActions } from "@/components/LandingAuth";

// This page is static on purpose: it must never wait on the
// database (the free-tier database sleeps when idle and takes
// seconds to wake). The signed-in state is checked in the
// browser by the LandingAuth components instead.

const steps = [
  {
    body: "Customer chats arrive in one shared inbox your whole team can see, assign and resolve.",
    title: "One inbox for every chat",
  },
  {
    body: "The AI drafts a reply using only your own FAQ and business facts, and shows the entry it used.",
    title: "Drafts that cite their source",
  },
  {
    body: "Nothing sends itself. A person edits and approves every reply, and unanswered questions become tickets.",
    title: "A person approves every send",
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xl font-bold">Inboxora</p>
        <LandingHeaderLink />
      </header>

      <section className="mt-14">
        <h1 className="text-4xl font-bold leading-tight">
          Answer every WhatsApp customer faster
        </h1>
        <p className="mt-4 text-lg text-[var(--color-muted)]">
          AI-drafted replies from your own FAQ, approved by a person before
          sending.
        </p>
        <div className="mt-8 flex flex-wrap items-start gap-3">
          <LandingHeroActions />
        </div>
      </section>

      <section className="mt-16 grid gap-4 sm:grid-cols-3">
        {steps.map((step) => (
          <div
            className="rounded-xl border border-[var(--color-line)] bg-white p-5"
            key={step.title}
          >
            <h2 className="font-semibold">{step.title}</h2>
            <p className="mt-2 text-sm text-[var(--color-muted)]">{step.body}</p>
          </div>
        ))}
      </section>

      <section className="mt-10 rounded-xl border border-[var(--color-note-line)] bg-[var(--color-note)] p-6">
        <h2 className="text-xl font-semibold">Honest status: demo mode</h2>
        <p className="mt-2">
          This is a working demo. Accounts start with simulated chats, clearly
          labelled, so you can try the full flow without a WhatsApp number.
          Connecting a live number needs Meta business verification and is
          switched on separately. The demo never pretends to be a live
          WhatsApp connection.
        </p>
      </section>

      <section className="mt-10 rounded-xl border border-[var(--color-line)] bg-white p-6">
        <h2 className="text-xl font-semibold">Pricing</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="font-semibold">Free</p>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Demo mode with simulated chats. One seat. Everything in the demo
              is included.
            </p>
          </div>
          <div>
            <p className="font-semibold">Pro, $19/month</p>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Up to 3 seats, for when live WhatsApp numbers are switched on.
              Demo pricing only. There is no real billing yet.
            </p>
          </div>
        </div>
      </section>

      <footer className="mt-14 border-t border-[var(--color-line)] pt-6 text-sm text-[var(--color-muted)]">
        <p>Inboxora is in demo. Live WhatsApp numbers arrive after Meta business verification.</p>
      </footer>
    </main>
  );
}
