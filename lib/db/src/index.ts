import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Hosted databases close idle connections. Without a handler, the resulting
// 'error' event on an idle client is uncaught and crashes the whole server.
// The pool discards the broken client and opens a fresh one on the next query.
pool.on("error", (error) => {
  console.error("Idle database client error (the pool will reconnect):", error.message);
});
export const db = drizzle(pool, { schema });

export * from "./schema";
