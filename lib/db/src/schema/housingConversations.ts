import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export type StudentHousingConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export const studentHousingConversationsTable = pgTable(
  "student_housing_conversations",
  {
    id: text("id").primaryKey(),
    messages: jsonb("messages")
      .$type<StudentHousingConversationMessage[]>()
      .notNull(),
    feedback: text("feedback"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("student_housing_conversations_updated_at_idx").on(table.updatedAt),
  ],
);

export type StudentHousingConversationRow =
  typeof studentHousingConversationsTable.$inferSelect;
