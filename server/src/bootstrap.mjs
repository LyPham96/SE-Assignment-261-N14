import { runner } from "node-pg-migrate";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { migrate } from "./migrate.mjs";
import { createPool } from "./db.mjs";
import { seed } from "./seed.mjs";

// Migrations need a direct connection: node-pg-migrate uses a session advisory lock.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
await runner({
  databaseUrl,
  dir: fileURLToPath(new URL("../migrations/", import.meta.url)),
  direction: "up",
  count: Infinity,
  migrationsTable: "pgmigrations",
});
await migrate(databaseUrl);
const pool = createPool(databaseUrl);
try {
  await seed(pool);
} finally {
  await pool.end();
}
const result = spawnSync(
  process.execPath,
  [fileURLToPath(new URL("../dist/seed.js", import.meta.url))],
  { stdio: "inherit", env: process.env, windowsHide: true },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(
  "Database ready: migrations and demo accounts/resources initialized.",
);
