"use client";

import { useEffect } from "react";

/** Fire-and-forget: opening a conversation marks it read. Failures are
 * ignored — the unread badge is a convenience, not critical state. */
export function MarkRead({
  conversationId,
  workspaceId,
}: {
  conversationId: string;
  workspaceId: string;
}) {
  useEffect(() => {
    fetch(`/api/inbox/${conversationId}/read`, {
      body: JSON.stringify({ workspaceId }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).catch(() => undefined);
  }, [conversationId, workspaceId]);

  return null;
}
