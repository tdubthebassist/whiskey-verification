// PBKDF2-SHA256 password hashing (plan §4 pre-mortem 3, Principle 4).
//
// Canonical stored format:  pbkdf2$<iters>$<saltB64>$<hashB64>
//   - <iters>   decimal PBKDF2 iteration count (>= 100000)
//   - <saltB64> standard base64 of the per-call 16-byte random salt
//   - <hashB64> standard base64 of the 32-byte derived key
//
// This format is deliberately simple and standard so it is reproducible in
// Node (the `scripts/lib/password.js` CLI mirror in Step 8): Node's
// crypto.pbkdf2(pw, salt, iters, 32, 'sha256') over the same salt/iters yields
// the same <hashB64>, and standard base64 round-trips via Buffer.

const ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32; // 256-bit derived key

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveBits(
  password: string,
  salt: Uint8Array,
  iterations: number,
  bytes: number,
): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password) as BufferSource,
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    keyMaterial,
    bytes * 8,
  );
  return new Uint8Array(derived);
}

// Constant-time comparison to avoid leaking match length via timing.
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await deriveBits(password, salt, ITERATIONS, HASH_BYTES);
  return `pbkdf2$${ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') {
    return false;
  }

  const iterations = Number.parseInt(parts[1], 10);
  if (!Number.isInteger(iterations) || iterations < 1) {
    return false;
  }

  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = fromBase64(parts[2]);
    expected = fromBase64(parts[3]);
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) {
    return false;
  }

  const actual = await deriveBits(password, salt, iterations, expected.length);
  return timingSafeEqual(actual, expected);
}
