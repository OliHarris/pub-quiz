import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/client';
import { hosts } from '../db/schema';

/**
 * Repositories are the only code that talks to the database. Routes and the
 * game server call these functions; none of them write SQL themselves.
 */

/**
 * A host key looks like "pqh_k3J9…". The prefix means a leaked key is easy to
 * spot (GitHub's secret scanning works the same way with real API keys).
 */
const KEY_PREFIX = 'pqh_';

/** SHA-256 is a one-way fingerprint: easy to compute from the key, impossible to reverse. */
function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/** Creates a host and returns their key. This is the only time the key itself exists on the server. */
export async function createHost(db: Database): Promise<{ hostId: string; hostKey: string }> {
  const hostKey = KEY_PREFIX + randomBytes(32).toString('base64url');
  const [host] = await db.insert(hosts).values({ keyHash: hashKey(hostKey) }).returning({ id: hosts.id });
  return { hostId: host!.id, hostKey };
}

/**
 * Looks a host up by key. We look up by the key's hash, never compare keys
 * directly, so there's no timing trick that leaks anything useful.
 */
export async function findHostIdByKey(db: Database, hostKey: string): Promise<string | null> {
  if (!hostKey.startsWith(KEY_PREFIX) || hostKey.length > 100) return null;
  const [host] = await db
    .select({ id: hosts.id })
    .from(hosts)
    .where(eq(hosts.keyHash, hashKey(hostKey)))
    .limit(1);
  return host?.id ?? null;
}
