import cors from 'cors';
import express from 'express';
import type { Database } from '../db/client';
import { lanAddresses } from '../lan';
import { errorHandler, notFoundHandler } from './errors';
import { apiRoutes } from './routes';

export interface ApiOptions {
  db: Database;
  corsOrigin: string[] | true;
  exposeLan: boolean;
  /** Live room count for /health, provided by the game server. */
  roomCount: () => number;
  /** How many hosts one IP address may create per 15 minutes. */
  hostsPerWindow?: number;
}

/**
 * The HTTP side of the server, built with Express. It shares a port with the
 * WebSocket side: one Node process, one port, two ways in.
 */
export function createApiApp({ db, corsOrigin, exposeLan, roomCount, hostsPerWindow }: ApiOptions) {
  const app = express();
  app.disable('x-powered-by'); // don't advertise which framework we run
  // CORS: which websites' JavaScript may call this API from the browser.
  app.use(cors({ origin: corsOrigin }));
  // Parse JSON request bodies, refusing anything huge.
  app.use(express.json({ limit: '200kb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, rooms: roomCount() });
  });
  if (exposeLan) {
    app.get('/lan', (_req, res) => {
      res.json({ addresses: lanAddresses() });
    });
  }

  app.use('/api', apiRoutes(db, { hostsPerWindow }));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
