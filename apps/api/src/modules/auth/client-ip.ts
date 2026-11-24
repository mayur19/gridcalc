import { isIPv4, isIPv6 } from 'node:net';

/**
 * Normalizes a client address into a rate-limit key:
 *  - IPv4-mapped IPv6 (::ffff:203.0.113.7) becomes the IPv4 address
 *  - other IPv6 addresses collapse to their /64 prefix, since one subscriber usually
 *    controls a whole /64 and could otherwise rotate addresses to evade limits
 */
export function normalizeIp(address: string): string {
  const trimmed = address.trim().toLowerCase();
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(trimmed);
  if (mapped && isIPv4(mapped[1] as string)) return mapped[1] as string;
  if (isIPv4(trimmed)) return trimmed;
  if (!isIPv6(trimmed)) return trimmed;
  const hextets = expandIPv6(trimmed.split('%')[0] as string);
  return `${hextets.slice(0, 4).join(':')}::/64`;
}

function expandIPv6(address: string): string[] {
  const [head = '', tail] = address.split('::') as [string, string | undefined];
  const left = head === '' ? [] : head.split(':');
  const right = tail === undefined || tail === '' ? [] : tail.split(':');
  // An embedded IPv4 tail occupies two hextets.
  const last = right.length > 0 ? right : left;
  const lastPart = last[last.length - 1];
  if (lastPart !== undefined && lastPart.includes('.')) {
    const octets = lastPart.split('.').map(Number) as [number, number, number, number];
    last.splice(
      last.length - 1,
      1,
      ((octets[0] << 8) | octets[1]).toString(16),
      ((octets[2] << 8) | octets[3]).toString(16),
    );
  }
  const missing = tail === undefined ? 0 : 8 - left.length - right.length;
  return [...left, ...Array<string>(missing).fill('0'), ...right].map((h) =>
    (parseInt(h, 16) || 0).toString(16),
  );
}
