import {
  authenticate,
  AuthContext,
  AuthError,
  requireOwner,
  resolveBarScope,
  scopedTenantClient,
  ServiceClient,
} from './auth.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// Builds a ServiceClient stub whose sessions lookup resolves to `row`.
function mockClient(row: unknown, error: unknown = null): ServiceClient {
  const builder = {
    select() {
      return builder;
    },
    eq() {
      return builder;
    },
    maybeSingle() {
      return Promise.resolve({ data: row, error });
    },
  };
  return { from: () => builder };
}

function tokenRequest(token: string): Request {
  return new Request('http://localhost', {
    method: 'POST',
    headers: { 'x-session-token': token },
  });
}

const future = () => new Date(Date.now() + 60_000).toISOString();
const past = () => new Date(Date.now() - 60_000).toISOString();

Deno.test('authenticate resolves a valid session to an auth context', async () => {
  const client = mockClient({
    token: 'tok',
    expires_at: future(),
    account_id: 'acc-1',
    accounts: { id: 'acc-1', role: 'bar', bar_id: 'bar-1' },
  });

  const auth = await authenticate(tokenRequest('tok'), client);

  assert(auth.accountId === 'acc-1', 'accountId was not resolved');
  assert(auth.role === 'bar', 'role was not resolved');
  assert(auth.barId === 'bar-1', 'barId was not resolved');
});

Deno.test('authenticate rejects a missing token with 401', async () => {
  const req = new Request('http://localhost', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });

  let status = 0;
  try {
    await authenticate(req, mockClient(null));
  } catch (error) {
    assert(error instanceof AuthError, 'A non-AuthError was thrown for a missing token');
    status = (error as AuthError).status;
  }
  assert(status === 401, 'Missing token was not rejected with 401');
});

Deno.test('authenticate falls back to session_token in the JSON body (G3)', async () => {
  const req = new Request('http://localhost', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ session_token: 'tok' }),
  });
  const client = mockClient({
    token: 'tok',
    expires_at: future(),
    account_id: 'acc-1',
    accounts: { id: 'acc-1', role: 'owner', bar_id: null },
  });

  const auth = await authenticate(req, client);

  assert(auth.role === 'owner', 'Body-token fallback did not authenticate');
});

Deno.test('authenticate rejects an expired session with 401', async () => {
  const client = mockClient({
    token: 'tok',
    expires_at: past(),
    account_id: 'acc-1',
    accounts: { id: 'acc-1', role: 'bar', bar_id: 'bar-1' },
  });

  let status = 0;
  try {
    await authenticate(tokenRequest('tok'), client);
  } catch (error) {
    status = (error as AuthError).status;
  }
  assert(status === 401, 'Expired session was not rejected with 401');
});

Deno.test('authenticate rejects an unknown token with 401', async () => {
  let status = 0;
  try {
    await authenticate(tokenRequest('nope'), mockClient(null));
  } catch (error) {
    status = (error as AuthError).status;
  }
  assert(status === 401, 'Unknown token was not rejected with 401');
});

Deno.test('resolveBarScope: bar role ignores any client-supplied bar_id', () => {
  const auth: AuthContext = { accountId: 'a', role: 'bar', barId: 'bar-1' };

  assert(resolveBarScope(auth, 'bar-999') === 'bar-1', 'Bar path did not ignore supplied bar_id');
  assert(resolveBarScope(auth) === 'bar-1', 'Bar path did not return its own bar_id');
});

Deno.test('resolveBarScope: owner requires an explicit bar_id, else 403', () => {
  const auth: AuthContext = { accountId: 'a', role: 'owner', barId: null };

  assert(resolveBarScope(auth, 'bar-7') === 'bar-7', 'Owner did not receive the requested bar_id');

  let status = 0;
  try {
    resolveBarScope(auth);
  } catch (error) {
    status = (error as AuthError).status;
  }
  assert(status === 403, 'Owner without a bar_id was not rejected with 403');
});

Deno.test('requireOwner throws 403 for a bar account', () => {
  let status = 0;
  try {
    requireOwner({ accountId: 'a', role: 'bar', barId: 'bar-1' });
  } catch (error) {
    status = (error as AuthError).status;
  }
  assert(status === 403, 'Bar account was not rejected by requireOwner');
});

Deno.test('requireOwner allows an owner account', () => {
  requireOwner({ accountId: 'a', role: 'owner', barId: null });
});

// Records the calls a scoped builder makes so the emitted bar_id predicate/stamp
// can be asserted without a real Supabase client.
interface Sink {
  table?: string;
  op?: string;
  payload?: unknown;
  eqs: Array<[string, unknown]>;
}

function newSink(): Sink {
  return { eqs: [] };
}

function recordingClient(sink: Sink): ServiceClient {
  const builder = {
    select(_columns?: string) {
      sink.op = 'select';
      return builder;
    },
    insert(values: unknown) {
      sink.op = 'insert';
      sink.payload = values;
      return builder;
    },
    update(values: unknown) {
      sink.op = 'update';
      sink.payload = values;
      return builder;
    },
    delete() {
      sink.op = 'delete';
      return builder;
    },
    eq(column: string, value: unknown) {
      sink.eqs.push([column, value]);
      return builder;
    },
  };
  return {
    from(table: string) {
      sink.table = table;
      return builder;
    },
  };
}

Deno.test('scopedTenantClient refuses construction without a barId', () => {
  let threw = false;
  try {
    scopedTenantClient({ from: () => ({}) }, '');
  } catch (error) {
    threw = error instanceof AuthError;
  }
  assert(threw, 'scopedTenantClient accepted an empty barId');
});

Deno.test('scopedTenantClient select appends .eq(bar_id)', () => {
  const sink = newSink();
  scopedTenantClient(recordingClient(sink), 'bar-1').from('whiskeys').select('id');

  assert(sink.table === 'whiskeys', 'Wrong table was queried');
  assert(
    sink.eqs.some(([col, val]) => col === 'bar_id' && val === 'bar-1'),
    'select did not append the bar_id predicate',
  );
});

Deno.test('scopedTenantClient insert stamps bar_id', () => {
  const sink = newSink();
  scopedTenantClient(recordingClient(sink), 'bar-1').from('whiskeys').insert({ brand: 'x' });

  assert((sink.payload as Record<string, unknown>).bar_id === 'bar-1', 'insert did not stamp bar_id');
});

Deno.test('scopedTenantClient update scopes and strips caller bar_id', () => {
  const sink = newSink();
  scopedTenantClient(recordingClient(sink), 'bar-1')
    .from('settings')
    .update({ margin_pct: 20, bar_id: 'bar-999' });

  assert(
    (sink.payload as Record<string, unknown>).bar_id === undefined,
    'update did not strip the caller-supplied bar_id',
  );
  assert(
    sink.eqs.some(([col, val]) => col === 'bar_id' && val === 'bar-1'),
    'update did not scope to the caller bar_id',
  );
});

Deno.test('scopedTenantClient delete appends .eq(bar_id)', () => {
  const sink = newSink();
  scopedTenantClient(recordingClient(sink), 'bar-1').from('inventory_logs').delete();

  assert(
    sink.eqs.some(([col, val]) => col === 'bar_id' && val === 'bar-1'),
    'delete did not append the bar_id predicate',
  );
});

Deno.test('scopedTenantClient rejects non-tenant tables', () => {
  let threw = false;
  try {
    scopedTenantClient(recordingClient({ eqs: [] }), 'bar-1').from('accounts');
  } catch {
    threw = true;
  }
  assert(threw, 'A non-tenant table was allowed through scopedTenantClient');
});
