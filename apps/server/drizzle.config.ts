import { defineConfig } from 'drizzle-kit';

/**
 * Settings for drizzle-kit, the command-line tool that:
 *  - `npm run db:generate`: compares schema.ts with the last migration and writes the SQL to get from one to the other
 *  - `npm run db:studio`: opens a web page for browsing the data (stop the server first)
 */
export default defineConfig({
  dialect: 'postgresql',
  driver: 'pglite',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATA_DIR ?? './.data/pglite' },
});
