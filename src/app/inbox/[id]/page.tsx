import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ConversationActions } from "@/components/ConversationActions";
import { DraftPanel } from "@/components/DraftPanel";
import { MarkRead } from "@/components/MarkRead";
import { NotesPanel } from "@/components/NotesPanel";
import { ReplyBox } from "@/components/ReplyBox";
import { getConversation, listMessages } from "@/lib/inbox";
import { listNotes } from "@/lib/messaging";
import { getCurrentUser } from "@/lib/session";
import { listMembers, listWorkspacesForUser } from "@/lib/workspaces";

export const dynamic = "force-dynamic";

function formatClock(date: Date): string {
  return date.toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspaces = await listWorkspacesForUser(user.id);
  const current = workspaces[0];
  if (!current) redirect("/signup");

  // Workspace-scoped: another workspace's conversation id 404s here.
  const conversation = await getConversation(current.workspace.id, id);
  if (!conversation) notFound();

  const [messages, notes, members] = await Promise.all([
    listMessages(current.workspace.id, id),
    listNotes(current.workspace.id, id),
    listMembers(current.workspace.id),
  ]);

  // Drafts are not part of the customer-facing thread: they render
  // in the draft panel until an agent approves or discards them.
  const sentMessages = messages.filter((message) => message.status !== "draft");
  const pendingDraft = messages.find((message) => message.status === "draft");

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <MarkRead conversationId={id} workspaceId={current.workspace.id} />
      <Link className="text-sm underline" href="/inbox">
        ← Back to inbox
      </Link>
      <h1 className="mt-3 text-2xl font-bold">
        {conversation.contact.name ?? conversation.contact.phone}
        {conversation.isDemo && <span className="demo-badge ml-3">Demo</span>}
      </h1>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        {conversation.contact.phone} · {conversation.status}
        {conversation.assignee
          ? ` · assigned to ${conversation.assignee.name ?? conversation.assignee.email}`
          : " · unassigned"}
      </p>

      <ConversationActions
        assigneeId={conversation.assigneeId}
        conversationId={id}
        members={members.map((member) => member.user)}
        status={conversation.status}
        workspaceId={current.workspace.id}
      />

      <section className="mt-6 space-y-3">
        {sentMessages.map((message) => (
          <div
            className={
              message.direction === "in"
                ? "mr-auto max-w-[80%] rounded-2xl rounded-bl-sm border border-[var(--color-line)] bg-white px-4 py-3"
                : "ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-[var(--color-accent)] px-4 py-3 text-white"
            }
            key={message.id}
          >
            <p>{message.text}</p>
            <p
              className={
                message.direction === "in"
                  ? "mt-1 text-xs text-[var(--color-muted)]"
                  : "mt-1 text-xs text-white/80"
              }
            >
              {message.direction === "in" ? "Customer" : "Your team"} ·{" "}
              {formatClock(message.createdAt)}
            </p>
            {message.sourceLabel && (
              <p className="mt-1 text-xs text-white/80">
                AI draft approved by your team · Source: {message.sourceLabel}
              </p>
            )}
          </div>
        ))}
      </section>

      <DraftPanel
        conversationId={id}
        initialDraft={
          pendingDraft
            ? {
                aiMode: pendingDraft.aiMode,
                id: pendingDraft.id,
                sourceLabel: pendingDraft.sourceLabel,
                text: pendingDraft.text,
              }
            : null
        }
        workspaceId={current.workspace.id}
      />

      <ReplyBox
        conversationId={id}
        isDemo={conversation.isDemo}
        workspaceId={current.workspace.id}
      />

      <NotesPanel
        conversationId={id}
        notes={notes.map((note) => ({
          authorLabel: note.author.name ?? note.author.email,
          createdAtLabel: formatClock(note.createdAt),
          id: note.id,
          text: note.text,
        }))}
        workspaceId={current.workspace.id}
      />
    </main>
  );
}
