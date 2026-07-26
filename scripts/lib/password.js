'use strict';

// Node mirror of supabase/functions/_shared/password.ts.
//
// Canonical stored format:  pbkdf2$<iters>$<saltB64>$<hashB64>
//   - <iters>   decimal PBKDF2 iteration count (100000)
//   - <saltB64> standard base64 of the per-call 16-byte random salt
//   - <hashB64> standard base64 of the 32-byte derived key
//
// Node's crypto.pbkdf2 with 'sha256' over the same salt/iters produces the
// same derived bytes as Deno's crypto.subtle.deriveBits PBKDF2/SHA-256.
// Buffer.toString('base64') produces standard base64, identical to btoa().

const crypto = require('crypto');
const { promisify } = require('util');

const pbkdf2Async = promisify(crypto.pbkdf2);

const ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32; // 256-bit derived key

/**
 * Hash a password using PBKDF2-SHA256.
 * Output is identical to hashPassword() in _shared/password.ts.
 *
 * @param {string} password
 * @returns {Promise<string>}  "pbkdf2$100000$<saltB64>$<hashB64>"
 */
async function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_BYTES);
  const hash = await pbkdf2Async(password, salt, ITERATIONS, HASH_BYTES, 'sha256');
  const saltB64 = salt.toString('base64');
  const hashB64 = hash.toString('base64');
  return `pbkdf2$${ITERATIONS}$${saltB64}$${hashB64}`;
}

module.exports = { hashPassword };
