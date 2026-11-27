import { mkdirSync } from 'node:fs';
import { createGameServer } from './createGameServer';
import { openDatabase } from './db/client';
import { seedQuestionBank } from './db/seed';
import { lanAddresses } from './lan';

const port = Number(process.env.PORT ?? 4000);
const isProduction = process.env.NODE_ENV === 'production';
const dataDir = process.env.DATA_DIR ?? './.data/pglite';
const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
  : true;

if (isProduction && corsOrigin === true) {
  console.warn('⚠️  CORS_ORIGIN is not set, so any website can connect. Set it before going live.');
}

mkdirSync(dataDir, { recursive: true });
const { db, close } = await openDatabase(dataDir);
const seeded = await seedQuestionBank(db);
if (seeded.added > 0) console.log(`📚 Added ${seeded.added} questions to the bank (from ${seeded.files.join(', ')})`);

const { httpServer, io } = createGameServer({
  db,
  corsOrigin,
  exposeLan: !isProduction,
  // Strict in production; relaxed in development so repeated test runs don't hit the limit.
  hostsPerWindow: isProduction ? 20 : 1000,
});

httpServer.listen(port, () => {
  console.log(`🎯 Game server and API ready on http://localhost:${port}`);
  for (const ip of lanAddresses()) console.log(`   On your network: http://${ip}:${port}`);
});

// Close connections and the database cleanly when stopped (Ctrl+C, or a host platform restarting us).
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`\n${signal} received, shutting down`);
    void io.close(async () => {
      await close();
      process.exit(0);
    });
  });
}
