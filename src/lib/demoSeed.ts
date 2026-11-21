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
  /** Conversation priority for the seeded chat. */
  priority?: string;
  /** Names from DEMO_TAGS to stick on the seeded chat. */
  tags?: string[];
}> = [
  {
    messages: [
      { direction: "in", minutesAgo: 180, text: "Assalam o alaikum, do you have the blue kurta in medium size?" },
      { direction: "out", minutesAgo: 175, text: "Walaikum assalam! Yes, medium is in stock. Would you like me to reserve one for you?" },
      { direction: "in", minutesAgo: 170, text: "Yes please. What is the price with delivery to Lahore?" },
    ],
    name: "Ayesha Khan (demo)",
    phone: "+92-300-0000001",
    tags: ["VIP", "Order"],
  },
  {
    messages: [
      { direction: "in", minutesAgo: 90, text: "Hi, I ordered yesterday. Can I change the delivery address?" },
      { direction: "in", minutesAgo: 89, text: "Order number is DS-1042." },
    ],
    name: "Bilal Ahmed (demo)",
    phone: "+92-300-0000002",
    // An address change is time-sensitive (before shipping), so
    // the demo shows this chat flagged high priority.
    priority: "high",
    tags: ["Order"],
  },
  {
    messages: [
      { direction: "in", minutesAgo: 30, text: "What are your shop timings on Sunday?" },
    ],
    name: "Fatima Noor (demo)",
    phone: "+92-300-0000003",
  },
];

/** Sample tags so the demo shows tag chips, the tag filter and
 * the Settings tag manager working. Colors are palette keys
 * (see TAG_COLORS in src/lib/tags.ts). */
export const DEMO_TAGS: Array<{ color: string; name: string }> = [
  { color: "purple", name: "VIP" },
  { color: "blue", name: "Order" },
  { color: "red", name: "Complaint" },
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

/** Sample quick replies so the demo shows the picker working.
 * {{name}} becomes the customer's name when inserted. */
export const DEMO_QUICK_REPLIES: Array<{ body: string; title: string }> = [
  {
    body: "Assalam o alaikum {{name}}, thank you for messaging Demo Store. How can we help you today?",
    title: "Greeting",
  },
  {
    body: "Thank you {{name}}. Your order is confirmed and will be delivered in 1-2 working days. We will message you when it is on its way.",
    title: "Order confirmed",
  },
  {
    body: "Delivery inside Lahore costs Rs 250 and takes 1-2 working days. Delivery to other cities costs Rs 350 and takes 3-4 working days.",
    title: "Delivery charges",
  },
];

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

  for (const reply of DEMO_QUICK_REPLIES) {
    const existing = await db.quickReply.findFirst({
      where: { title: reply.title, workspaceId },
    });
    if (!existing) {
      await db.quickReply.create({
        data: { body: reply.body, title: reply.title, workspaceId },
      });
    }
  }

  // Sample tags, created once. Kept in a map so the chat loop
  // below can attach them by name.
  const tagByName = new Map<string, string>();
  for (const demoTag of DEMO_TAGS) {
    const existing = await db.tag.findFirst({
      where: { name: demoTag.name, workspaceId },
    });
    const tag =
      existing ??
      (await db.tag.create({
        data: { color: demoTag.color, name: demoTag.name, workspaceId },
      }));
    tagByName.set(demoTag.name, tag.id);
  }

  for (const demo of DEMO_CONTACTS) {
    const contact = await db.contact.upsert({
      create: { isDemo: true, name: demo.name, phone: demo.phone, workspaceId },
      update: {},
      where: { workspaceId_phone: { phone: demo.phone, workspaceId } },
    });

    let conversation = await db.conversation.findFirst({
      where: { contactId: contact.id, workspaceId },
    });
    if (!conversation) {
      const first = demo.messages[0];
      const last = demo.messages[demo.messages.length - 1];
      const unread = demo.messages.filter((m) => m.direction === "in").length;
      conversation = await db.conversation.create({
        data: {
          contactId: contact.id,
          // The chat "started" when its first message arrived, so
          // createdAt never sits after lastMessageAt (the
          // analytics page buckets chats by createdAt).
          createdAt: new Date(now - first.minutesAgo * 60_000),
          isDemo: true,
          lastMessageAt: new Date(now - last.minutesAgo * 60_000),
          priority: demo.priority ?? "normal",
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
    } else if (demo.priority && conversation.priority === "normal") {
      // Re-seeding an older demo database: flag the chat, but
      // never overwrite a priority an agent chose on purpose.
      await db.conversation.update({
        data: { priority: demo.priority },
        where: { id: conversation.id },
      });
    }

    // Stick the sample tags on the chat (once each — re-seeding
    // finds the existing link and skips it).
    for (const tagName of demo.tags ?? []) {
      const tagId = tagByName.get(tagName);
      if (!tagId) continue;
      const link = await db.conversationTag.findFirst({
        where: { conversationId: conversation.id, tagId, workspaceId },
      });
      if (!link) {
        await db.conversationTag.create({
          data: { conversationId: conversation.id, tagId, workspaceId },
        });
      }
    }
  }

  // Simulated draft history so the demo analytics page shows the
  // AI-drafts card working: one draft edited before sending on
  // Ayesha's chat (which has an agent reply), one discarded on
  // Bilal's. Like the chats themselves, these are demo data and
  // the analytics page labels them as such. Seeded once — a
  // workspace that already has draft events is left alone.
  const existingEvents = await db.draftEvent.count({ where: { workspaceId } });
  if (existingEvents === 0) {
    const ayesha = await db.conversation.findFirst({
      where: { contact: { phone: "+92-300-0000001" }, workspaceId },
    });
    const bilal = await db.conversation.findFirst({
      where: { contact: { phone: "+92-300-0000002" }, workspaceId },
    });
    if (ayesha) {
      await db.draftEvent.createMany({
        data: [
          {
            aiMode: "demo",
            conversationId: ayesha.id,
            createdAt: new Date(now - 176 * 60_000),
            outcome: "generated",
            workspaceId,
          },
          {
            aiMode: "demo",
            conversationId: ayesha.id,
            createdAt: new Date(now - 175 * 60_000),
            outcome: "edited",
            workspaceId,
          },
        ],
      });
    }
    if (bilal) {
      await db.draftEvent.createMany({
        data: [
          {
            aiMode: "demo",
            conversationId: bilal.id,
            createdAt: new Date(now - 60 * 60_000),
            outcome: "generated",
            workspaceId,
          },
          {
            aiMode: "demo",
            conversationId: bilal.id,
            createdAt: new Date(now - 59 * 60_000),
            outcome: "discarded",
            workspaceId,
          },
        ],
      });
    }
  }
}
