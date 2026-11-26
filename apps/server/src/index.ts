import { createGameServer } from './createGameServer';
import { lanAddresses } from './lan';

const port = Number(process.env.PORT ?? 4000);
const isProduction = process.env.NODE_ENV === 'production';
const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
  : true;

if (isProduction && corsOrigin === true) {
  console.warn('⚠️  CORS_ORIGIN is not set, so any website can connect. Set it before going live.');
}

const { httpServer, io } = createGameServer({ corsOrigin, exposeLan: !isProduction });

httpServer.listen(port, () => {
  console.log(`🎯 Game server ready on http://localhost:${port}`);
  for (const ip of lanAddresses()) console.log(`   On your network: http://${ip}:${port}`);
});

// Close connections cleanly when stopped (Ctrl+C, or a host platform restarting us).
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`\n${signal} received, shutting down`);
    void io.close(() => process.exit(0));
  });
}
