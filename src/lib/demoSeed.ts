import type { PrismaClient } from "@prisma/client";

/**
 * Demo seed data: a fictional shop ("Demo Store") with simulated
 * WhatsApp customers. Every row is flagged isDemo so the UI can
 * label it, and the demo never pretends to be a live connection.
 *
 * Idempotent: running it twice for the same workspace does not
 * duplicate rows (contacts are unique per workspace+phone, and the
 * seed checks before creating conversations).
 */

const DEMO_CONTACTS: Array<{
  messages: Array<{ direction: "in" | "out"; minutesAgo: number; text: string }>;
  name: string;
  phone: string;
}> = [
  {
    messages: [
      { direction: "in", minutesAgo: 180, text: "Assalam o alaikum, do you have the blue kurta in medium size?" },
      { direction: "out", minutesAgo: 175, text: "Walaikum assalam! Yes, medium is in stock. Would you like me to reserve one for you?" },
      { direction: "in", minutesAgo: 170, text: "Yes please. What is the price with delivery to Lahore?" },
    ],
    name: "Ayesha Khan (demo)",
    phone: "+92-300-0000001",
  },
  {
    messages: [
      { direction: "in", minutesAgo: 90, text: "Hi, I ordered yesterday. Can I change the delivery address?" },
      { direction: "in", minutesAgo: 89, text: "Order number is DS-1042." },
    ],
    name: "Bilal Ahmed (demo)",
    phone: "+92-300-0000002",
  },
  {
    messages: [
      { direction: "in", minutesAgo: 30, text: "What are your shop timings on Sunday?" },
    ],
    name: "Fatima Noor (demo)",
    phone: "+92-300-0000003",
  },
];

export const DEMO_KNOWLEDGE: Array<{ content: string; title: string }> = [
  {
    content:
      "Demo Store is open Monday to Saturday, 10am to 9pm. On Sunday we open at 2pm and close at 9pm.",
    title: "Shop timings",
  },
  {
    content:
      "Delivery inside Lahore costs Rs 250 and takes 1-2 working days. Delivery to other cities in Pakistan costs Rs 350 and takes 3-4 working days.",
    title: "Delivery charges",
  },
  {
    content:
      "You can change your delivery address free of charge before your order is shipped. Send us your order number and the new address.",
    title: "Change delivery address",
  },
  {
    content:
      "We accept cash on delivery and bank transfer. Cash on delivery is available across Pakistan.",
    title: "Payment methods",
  },
  {
    content:
      "You can return an unused item within 7 days of delivery for a full refund. Send us your order number to start a return.",
    title: "Return policy",
  },
];

/** Demo business facts. Kept consistent with the FAQ entries above
 * so the AI never sees two different answers to the same question. */
export const DEMO_PROFILE = {
  address: "Main Boulevard, Gulberg, Lahore",
  businessName: "Demo Store",
  hours: "Monday to Saturday, 10am to 9pm. Sunday 2pm to 9pm.",
  policies: "Returns within 7 days. Cash on delivery available.",
};

export async function seedDemoData(
  workspaceId: string,
  db: PrismaClient,
): Promise<void> {
  const now = Date.now();

  for (const entry of DEMO_KNOWLEDGE) {
    const existing = await db.knowledgeEntry.findFirst({
      where: { title: entry.title, workspaceId },
    });
    if (!existing) {
      await db.knowledgeEntry.create({
        data: { content: entry.content, title: entry.title, workspaceId },
      });
    }
  }

  const existingProfile = await db.businessProfile.findUnique({
    where: { workspaceId },
  });
  if (!existingProfile) {
    await db.businessProfile.create({ data: { ...DEMO_PROFILE, workspaceId } });
  }

  for (const demo of DEMO_CONTACTS) {
    const contact = await db.contact.upsert({
      create: { isDemo: true, name: demo.name, phone: demo.phone, workspaceId },
      update: {},
      where: { workspaceId_phone: { phone: demo.phone, workspaceId } },
    });

    const existingChat = await db.conversation.findFirst({
      where: { contactId: contact.id, workspaceId },
    });
    if (existingChat) continue;

    const last = demo.messages[demo.messages.length - 1];
    const unread = demo.messages.filter((m) => m.direction === "in").length;
    const conversation = await db.conversation.create({
      data: {
        contactId: contact.id,
        isDemo: true,
        lastMessageAt: new Date(now - last.minutesAgo * 60_000),
        status: "open",
        unreadCount: unread,
        workspaceId,
      },
    });

    for (const message of demo.messages) {
      await db.message.create({
        data: {
          authorType: message.direction === "in" ? "customer" : "agent",
          conversationId: conversation.id,
          createdAt: new Date(now - message.minutesAgo * 60_000),
          direction: message.direction,
          isDemo: true,
          status: "sent",
          text: message.text,
          workspaceId,
        },
      });
    }
  }
}
