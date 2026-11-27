import type { RequestHandler, Response } from 'express';
import type { Database } from '../db/client';
import { findHostIdByKey } from '../repositories/hosts';
import { HttpError } from './errors';

/**
 * "Middleware" runs before a route handler. This one checks the request has
 * a valid host key in the standard place, the Authorization header:
 *
 *   Authorization: Bearer pqh_k3J9…
 *
 * and remembers which host it belongs to, so the route can use it.
 */
export function requireHost(db: Database): RequestHandler {
  return async (req, res, next) => {
    const header = req.get('authorization') ?? '';
    const [scheme, key] = header.split(' ');
    if (scheme !== 'Bearer' || !key) throw new HttpError(401, 'Missing host key');
    const hostId = await findHostIdByKey(db, key);
    if (!hostId) throw new HttpError(401, 'Unknown host key');
    res.locals.hostId = hostId;
    next();
  };
}

/** The host making this request (only valid after requireHost has run). */
export function hostIdOf(res: Response): string {
  return res.locals.hostId as string;
}
