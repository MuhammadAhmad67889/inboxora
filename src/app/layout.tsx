import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  description:
    "Inboxora: one shared WhatsApp inbox for your business, with AI-drafted replies from your own FAQ.",
  title: "Inboxora — WhatsApp support inbox",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
