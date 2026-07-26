import { hashPassword, verifyPassword } from './password.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test('hashPassword/verifyPassword round-trips the correct password', async () => {
  const stored = await hashPassword('correct horse battery staple');

  assert(
    await verifyPassword('correct horse battery staple', stored),
    'The correct password did not verify',
  );
});

Deno.test('verifyPassword rejects the wrong password', async () => {
  const stored = await hashPassword('correct horse battery staple');

  assert(
    !(await verifyPassword('Correct Horse Battery Staple', stored)),
    'A wrong password was accepted',
  );
});

Deno.test('hashPassword emits the canonical pbkdf2$iters$salt$hash format', async () => {
  const stored = await hashPassword('hunter2');
  const parts = stored.split('$');

  assert(parts.length === 4, 'Stored hash did not have four segments');
  assert(parts[0] === 'pbkdf2', 'Algorithm tag was not pbkdf2');
  assert(Number.parseInt(parts[1], 10) >= 100000, 'Iteration count was below 100000');
  assert(atob(parts[2]).length === 16, 'Salt was not 16 bytes');
  assert(atob(parts[3]).length === 32, 'Derived hash was not 32 bytes');
});

Deno.test('hashPassword uses a fresh random salt per call', async () => {
  const a = await hashPassword('same-password');
  const b = await hashPassword('same-password');

  assert(a !== b, 'Two hashes of the same password were identical (salt not random)');
});

Deno.test('verifyPassword returns false on a malformed stored string', async () => {
  assert(!(await verifyPassword('x', 'not-a-valid-format')), 'Malformed hash was accepted');
  assert(!(await verifyPassword('x', 'sha256$1$aa$bb')), 'Wrong algorithm tag was accepted');
});
