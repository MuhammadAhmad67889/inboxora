/**
 * Quick-reply text helpers. Pure functions with no database
 * imports, so the client-side reply box can use them directly.
 *
 * A quick reply body may contain {{name}}. When an agent inserts
 * the reply, the placeholder becomes the customer's name. The
 * text only lands in the draft box — a person still reviews it
 * and presses Send.
 */

/** Matches {{name}} with any spacing or casing, e.g. {{ name }}. */
const NAME_PLACEHOLDER = /\{\{\s*name\s*\}\}/gi;

/** Replace {{name}} placeholders with the customer's name. When
 * the contact has no name saved, "there" keeps greetings like
 * "Hi {{name}}," reading naturally. */
export function fillQuickReply(
  body: string,
  contactName: string | null | undefined,
): string {
  const name = contactName?.trim() ? contactName.trim() : "there";
  return body.replace(NAME_PLACEHOLDER, name);
}

/** Put a quick reply into the draft box. An empty draft becomes
 * the reply; a draft with text keeps it and the reply goes on a
 * new line below, so inserting never destroys typing. */
export function appendQuickReply(currentText: string, filledBody: string): string {
  const current = currentText.trimEnd();
  if (!current) return filledBody;
  return `${current}\n${filledBody}`;
}
