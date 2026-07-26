// Shared server-side auth + tenant-scoping helpers (plan §5 Step 2, Decision A2/B1).
//
// Isolation is enforced HERE, in the service-role function layer — never trusted
// from the client. Every function:
//   1. authenticate(req, serviceClient)      -> validates the opaque session token
//   2. resolveBarScope(auth, requestedBarId) -> derives the effective bar_id
//   3. scopedTenantClient(serviceClient, barId) -> the ONLY sanctioned way to touch
//      a tenant table; it pre-binds bar_id so a tenant query cannot be built unscoped.

// Minimal structural type for the parts of the Supabase client we use, so this
// module does not take a hard type dependency on the remote SDK typings.
// deno-lint-ignore no-explicit-any
export interface ServiceClient {
  from(table: string): any;
}

export type Role = 'bar' | 'owner';

export interface AuthContext {
  accountId: string;
  role: Role;
  barId: string | null;
}

// Typed error carrying the HTTP status callers should return (401/403/…).
export class AuthError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

const TENANT_TABLES = new Set([
  'whiskeys',
  'settings',
  'inventory_logs',
  'inventory_monthly_snapshots',
]);

// Reads the session token from the `x-session-token` header. Per plan follow-up
// G3, if the header is absent it falls back to a `session_token` field in the
// JSON body (the request is cloned so the caller can still read its own body).
async function extractSessionToken(req: Request): Promise<string | null> {
  const header = req.headers.get('x-session-token');
  if (header && header.trim()) {
    return header.trim();
  }

  try {
    const body = await req.clone().json();
    if (
      body
      && typeof body === 'object'
      && typeof (body as Record<string, unknown>).session_token === 'string'
    ) {
      const token = ((body as Record<string, unknown>).session_token as string).trim();
      if (token) {
        return token;
      }
    }
  } catch {
    // No/invalid JSON body — treat as no token.
  }

  return null;
}

// Validates the session token by DB lookup (never self-verifying), joining
// sessions -> accounts and rejecting missing/expired sessions with AuthError(401).
export async function authenticate(
  req: Request,
  serviceClient: ServiceClient,
): Promise<AuthContext> {
  const token = await extractSessionToken(req);
  if (!token) {
    throw new AuthError('Missing session token', 401);
  }

  const { data, error } = await serviceClient
    .from('sessions')
    .select('token, expires_at, account_id, accounts(id, role, bar_id)')
    .eq('token', token)
    .maybeSingle();

  if (error) {
    throw new AuthError('Session lookup failed', 500);
  }
  if (!data) {
    throw new AuthError('Invalid session', 401);
  }

  const expiresAt = new Date(data.expires_at).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new AuthError('Session expired', 401);
  }

  // The to-one relation may arrive as an object or a single-element array.
  const accountRaw = Array.isArray(data.accounts) ? data.accounts[0] : data.accounts;
  if (!accountRaw) {
    throw new AuthError('Invalid session', 401);
  }
  const account = accountRaw as { id: string; role: Role; bar_id: string | null };
  if (account.role !== 'bar' && account.role !== 'owner') {
    throw new AuthError('Invalid account role', 401);
  }

  return {
    accountId: account.id,
    role: account.role,
    barId: account.bar_id ?? null,
  };
}

// Derives the effective bar_id. On the bar path any client-supplied bar id is
// IGNORED (never trust the client). On the owner path an explicit bar id is
// required, otherwise AuthError(403).
export function resolveBarScope(auth: AuthContext, requestedBarId?: string): string {
  if (auth.role === 'bar') {
    if (!auth.barId) {
      throw new AuthError('Bar account is not attached to a bar', 500);
    }
    return auth.barId;
  }

  // owner
  if (!requestedBarId || !requestedBarId.trim()) {
    throw new AuthError('Owner must specify a bar_id', 403);
  }
  return requestedBarId.trim();
}

export function requireOwner(auth: AuthContext): void {
  if (auth.role !== 'owner') {
    throw new AuthError('Owner access required', 403);
  }
}

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

function stamp(barId: string, values: Row | Row[]): Row | Row[] {
  return Array.isArray(values)
    ? values.map((value) => ({ ...value, bar_id: barId }))
    : { ...values, bar_id: barId };
}

// scopedTenantClient — the structural tenancy choke point (plan Principle 2, C3).
//
// Usage: scopedTenantClient(serviceClient, barId).from('whiskeys') instead of
// serviceClient.from('whiskeys'). Every builder it emits pre-binds bar_id:
//   - select / update / delete automatically append .eq('bar_id', barId)
//   - insert / upsert automatically stamp bar_id onto each row (a caller-supplied
//     bar_id on insert/update is overwritten/ignored, never trusted)
// so a tenant-table query CANNOT be constructed without a scope. The returned
// builders are the real PostgREST builders, so callers keep chaining normally
// (.eq('id', id), .select(), .single(), .order(), await, …).
//
// GUARANTEES:
//   - refuses construction without a non-empty barId
//   - only the 4 tenant tables are reachable through it; any other table throws
//   - the bar_id predicate/stamp is applied unconditionally on the first call
//
// LIMITS (documented honestly):
//   - it guards PostgREST table access only, NOT rpc()/raw SQL — bar-scoped RPCs
//     must still be passed the bar_id argument explicitly (see the DB functions)
//   - for upsert, callers MUST include bar_id in the conflict target
//     (onConflict: 'bar_id') so the merge stays within the bar
//   - it is a compile/lint-time discipline aid, not an RLS backstop; RLS deny-all
//     only guards a leaked anon key on PostgREST (plan §4.2), not a function bug
export function scopedTenantClient(serviceClient: ServiceClient, barId: string) {
  if (typeof barId !== 'string' || !barId.trim()) {
    throw new AuthError('scopedTenantClient requires a barId', 500);
  }
  const scope = barId.trim();

  return {
    from(table: string) {
      if (!TENANT_TABLES.has(table)) {
        throw new Error(
          `scopedTenantClient only scopes tenant tables (${
            [...TENANT_TABLES].join(', ')
          }); "${table}" is not one of them`,
        );
      }
      const base = serviceClient.from(table);
      return {
        // deno-lint-ignore no-explicit-any
        select(columns?: string, options?: any) {
          return base.select(columns, options).eq('bar_id', scope);
        },
        insert(values: Row | Row[]) {
          return base.insert(stamp(scope, values));
        },
        update(values: Row) {
          // Strip any caller-supplied bar_id so the scope cannot be moved.
          const { bar_id: _ignored, ...rest } = values ?? {};
          return base.update(rest).eq('bar_id', scope);
        },
        // deno-lint-ignore no-explicit-any
        upsert(values: Row | Row[], options?: any) {
          return base.upsert(stamp(scope, values), options);
        },
        // deno-lint-ignore no-explicit-any
        delete(options?: any) {
          return base.delete(options).eq('bar_id', scope);
        },
      };
    },
  };
}
