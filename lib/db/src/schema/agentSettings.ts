import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Behavior settings for the student housing assistant.
 * The table holds a single row (id = 1) that the admin panel edits.
 */
export const studentHousingAgentSettingsTable = pgTable(
  "student_housing_agent_settings",
  {
    id: integer("id").primaryKey(),
    persona: text("persona").notNull(),
    tone: text("tone").notNull(),
    empathyScale: integer("empathy_scale").notNull(),
    goalOrientationScale: integer("goal_orientation_scale").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export type StudentHousingAgentSettingsRow =
  typeof studentHousingAgentSettingsTable.$inferSelect;
