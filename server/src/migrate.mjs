import { runner } from 'node-pg-migrate';
import { fileURLToPath } from 'node:url';

export async function migrate(databaseUrl = process.env.DATABASE_URL, direction = 'up') {
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  await runner({ databaseUrl, dir: fileURLToPath(new URL('../migrations/', import.meta.url)), direction, migrationsTable: 'pgmigrations', count: direction === 'down' ? 1 : Infinity });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await migrate(undefined, process.argv[2] ?? 'up');
