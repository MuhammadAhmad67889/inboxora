import nodemailer from "nodemailer";

/**
 * Send a plain-text email when SMTP is configured.
 *
 * In local dev SMTP is usually unset. Instead of failing, the link
 * is printed to the server console with a clear label, so password
 * reset and invites still work end to end on a laptop. Production
 * sets the SMTP_* env vars and mail goes out for real.
 */
export async function sendMail(input: {
  subject: string;
  text: string;
  to: string;
}): Promise<{ delivered: boolean }> {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;

  if (!host || !user || !pass || !from) {
    console.log(
      `[mail:dev] SMTP not configured. Would send to ${input.to}: ${input.subject}\n${input.text}`,
    );
    return { delivered: false };
  }

  const transport = nodemailer.createTransport({
    auth: { pass, user },
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
  });
  await transport.sendMail({
    from,
    subject: input.subject,
    text: input.text,
    to: input.to,
  });
  return { delivered: true };
}

export function appUrl(path: string): string {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path}`;
}
