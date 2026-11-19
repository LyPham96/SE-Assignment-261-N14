import { runner } from 'node-pg-migrate';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function migrate(databaseUrl = process.env.M1_M2_DATABASE_URL, direction = 'up') {
  if (!databaseUrl) throw new Error('M1_M2_DATABASE_URL is required');
  await runner({ databaseUrl, dir: fileURLToPath(new URL('../migrations-m1-m2/', import.meta.url)), direction, migrationsTable: 'pgmigrations', count: direction === 'down' ? 1 : Infinity });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await migrate(undefined, process.argv[2] ?? 'up');
