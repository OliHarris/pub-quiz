import { timingSafeEqual } from 'node:crypto';

/**
 * Compares two secrets in constant time. A normal `===` stops at the first
 * wrong character, so an attacker could in theory guess a token one
 * character at a time by measuring how long the comparison takes.
 */
export function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
