import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Behavior settings for the student housing assistant.
 * The table holds a single row (id = 1) that the admin panel edits.
 *
 * `empathy_examples` and `goal` are null until the admin first saves them,
 * which lets the server tell "never set" (use defaults) from "left blank".
 */
export const studentHousingAgentSettingsTable = pgTable(
  "student_housing_agent_settings",
  {
    id: integer("id").primaryKey(),
    persona: text("persona").notNull(),
    environment: text("environment"),
    tone: text("tone").notNull(),
    empathyScale: integer("empathy_scale").notNull(),
    goalOrientationScale: integer("goal_orientation_scale").notNull(),
    empathyExamples: jsonb("empathy_examples").$type<string[]>(),
    goal: text("goal"),
    conversationBehavior: text("conversation_behavior"),
    guardrails: text("guardrails"),
    handoverRules: text("handover_rules"),
    knowledgeRules: text("knowledge_rules"),
    ctaSettings: text("cta_settings"),
    feedbackSettings: text("feedback_settings"),
    integrations: jsonb("integrations").$type<Array<{ id: string; type: "api" | "mcp"; label: string; url: string }>>(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export type StudentHousingAgentSettingsRow =
  typeof studentHousingAgentSettingsTable.$inferSelect;
