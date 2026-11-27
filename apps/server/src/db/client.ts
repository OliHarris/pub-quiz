import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from './schema';

/**
 * The database connection.
 *
 * We use PGlite: real PostgreSQL, compiled to run inside Node itself. There's
 * nothing to install and nothing extra to run, and tests get a fresh database in
 * memory in a fraction of a second. In milestone 3 (Docker), production moves
 * to a standalone Postgres server; the schema, migrations and queries stay the
 * same, and only this file changes.
 */
export type Database = PgliteDatabase<typeof schema>;

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

export interface DatabaseHandle {
  db: Database;
  close: () => Promise<void>;
}

/**
 * Opens the database and brings its tables up to date by running any
 * migrations it hasn't seen yet. Leave out `dataDir` for a throwaway in-memory database.
 */
export async function openDatabase(dataDir?: string): Promise<DatabaseHandle> {
  const client = new PGlite(dataDir);
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return { db, close: () => client.close() };
}
