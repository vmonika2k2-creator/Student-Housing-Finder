import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const studentHousingApiKeysTable = pgTable(
  "student_housing_api_keys",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    label: text("label").notNull(),
    encryptedValue: text("encrypted_value").notNull(),
    iv: text("iv").notNull(),
    authTag: text("auth_tag").notNull(),
    isActive: boolean("is_active").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    lastError: text("last_error"),
  },
  (table) => [
    uniqueIndex("student_housing_api_keys_one_active_per_provider")
      .on(table.provider)
      .where(sql`${table.isActive} = true`),
    index("student_housing_api_keys_created_at_idx").on(table.createdAt),
  ],
);

export type StudentHousingApiKeyRow =
  typeof studentHousingApiKeysTable.$inferSelect;
