import { desc, eq } from "drizzle-orm";
import { db, studentHousingConversationsTable } from "@workspace/db";
import type { StudentHousingConversationMessage } from "@workspace/db";

export type ConversationInput = {
  id: string;
  history: StudentHousingConversationMessage[];
  userMessage: string;
  assistantMessage: string;
};

export function isConversationFarewell(message: string): boolean {
  const normalized = message
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[.!?\s🙏😊👋❤️]+$/gu, "")
    .trim();
  return /^(?:(?:ok(?:ay|ey) )?(?:thanks?|thank ?you(?: so much)?)(?: (?:bye|goodbye))?|(?:bye|goodbye|good bye)|(?:that's|that is) (?:it|all)(?: (?:thanks?|thank you))?|nothing else|no more|i'm done|i am done|end (?:the )?chat|end (?:the )?conversation|finish conversation|is that it)$/.test(normalized);
}

export function getStudentName(messages: StudentHousingConversationMessage[]): string | null {
  for (const message of messages) {
    if (message.role !== "user") continue;
    const match = message.content.match(/\bmy name is\s+([\p{L}][\p{L}'-]{0,39})/iu);
    if (match) return match[1];
  }
  return null;
}

export async function saveHousingConversation(input: ConversationInput): Promise<void> {
  const [existing] = await db
    .select({ messages: studentHousingConversationsTable.messages })
    .from(studentHousingConversationsTable)
    .where(eq(studentHousingConversationsTable.id, input.id));
  const initialMessages = existing ? [] : input.history;
  const messages: StudentHousingConversationMessage[] = [
    ...(existing?.messages ?? initialMessages),
    { role: "user", content: input.userMessage },
    { role: "assistant", content: input.assistantMessage },
  ].slice(-500);

  await db
    .insert(studentHousingConversationsTable)
    .values({ id: input.id, messages })
    .onConflictDoUpdate({
      target: studentHousingConversationsTable.id,
      set: { messages, updatedAt: new Date() },
    });
}

export async function listHousingConversations(limit = 200) {
  return db
    .select()
    .from(studentHousingConversationsTable)
    .orderBy(desc(studentHousingConversationsTable.updatedAt))
    .limit(limit);
}

export async function getHousingConversation(id: string) {
  const [row] = await db
    .select()
    .from(studentHousingConversationsTable)
    .where(eq(studentHousingConversationsTable.id, id))
    .limit(1);
  return row ?? null;
}

export async function saveConversationFeedback(id: string, feedback: string): Promise<boolean> {
  const rows = await db
    .update(studentHousingConversationsTable)
    .set({ feedback, updatedAt: new Date() })
    .where(eq(studentHousingConversationsTable.id, id))
    .returning({ id: studentHousingConversationsTable.id });
  return rows.length > 0;
}
