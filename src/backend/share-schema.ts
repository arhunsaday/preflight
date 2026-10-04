import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema.js";
export const shareRecord = sqliteTable(
  "share_record",
  {
    code: text("code").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull(),
    visibility: text("visibility").notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at"),
    resourceCount: integer("resource_count").notNull(),
  },
  (table) => [index("share_record_owner_idx").on(table.ownerId)],
);
