import { networkInterfaces } from 'node:os';

/**
 * This computer's addresses on the local network (e.g. 192.168.1.23).
 * Phones can't reach "localhost" (that means the phone itself), so the TV
 * screen uses one of these to build the QR code during development.
 */
export function lanAddresses(): string[] {
  const isHomeNetwork = (ip: string) => ip.startsWith('192.168.') || ip.startsWith('10.');
  return Object.values(networkInterfaces())
    .flat()
    .filter((info) => info !== undefined && info.family === 'IPv4' && !info.internal)
    .map((info) => info!.address)
    .sort((a, b) => Number(isHomeNetwork(b)) - Number(isHomeNetwork(a)));
}
