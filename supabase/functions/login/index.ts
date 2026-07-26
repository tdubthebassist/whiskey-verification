import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { hashPassword, verifyPassword } from '../_shared/password.ts';
import { corsHeaders, handlePreflight } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Rate-limit / lockout policy (mirrors the removed PIN 3-fail/30s cooldown).
// 3+ consecutive recent failures within the window locks the login_id out.
const LOCKOUT_THRESHOLD = 3;
const LOCKOUT_WINDOW_MS = 30_000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// IP-based throttle: many failures from one IP (across any login_id) within the
// window lock that IP out, defeating login_id rotation.
const IP_FAIL_THRESHOLD = 10;
const IP_WINDOW_MS = 60_000;

// Precomputed at cold start so an unknown login_id still runs a full PBKDF2
// verify — removes the timing side-channel that would reveal account existence.
const DUMMY_HASH = await hashPassword('login-timing-equalization');

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Opaque session token: 32 cryptographically-random bytes, hex-encoded.
function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// deno-lint-ignore no-explicit-any
async function isLockedOut(supabase: any, loginId: string): Promise<boolean> {
  // Newest attempts first; count the leading run of consecutive failures.
  const { data, error } = await supabase
    .from('login_attempts')
    .select('succeeded, attempted_at')
    .eq('login_id', loginId)
    .order('attempted_at', { ascending: false })
    .limit(LOCKOUT_THRESHOLD);

  if (error || !data || data.length < LOCKOUT_THRESHOLD) {
    return false;
  }

  const newest = new Date(data[0].attempted_at).getTime();
  const withinWindow = Number.isFinite(newest)
    && (Date.now() - newest) <= LOCKOUT_WINDOW_MS;
  const allFailed = data.every((row: { succeeded: boolean }) => !row.succeeded);

  return withinWindow && allFailed;
}

function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown';
}

// deno-lint-ignore no-explicit-any
async function isIpThrottled(supabase: any, ip: string): Promise<boolean> {
  if (ip === 'unknown') return false;
  const since = new Date(Date.now() - IP_WINDOW_MS).toISOString();
  const { count, error } = await supabase
    .from('login_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('ip', ip)
    .eq('succeeded', false)
    .gte('attempted_at', since);
  if (error) return false;
  return (count ?? 0) >= IP_FAIL_THRESHOLD;
}

serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    const { login_id, password } = await req.json();

    if (typeof login_id !== 'string' || typeof password !== 'string' || !login_id || !password) {
      return json({ error: 'login_id and password are required' }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const ip = clientIp(req);

    if (await isLockedOut(supabase, login_id) || await isIpThrottled(supabase, ip)) {
      return json({ error: 'Too many failed attempts, try again shortly' }, 429);
    }

    const { data: account } = await supabase
      .from('accounts')
      .select('id, login_id, password_hash, role, bar_id')
      .eq('login_id', login_id)
      .maybeSingle();

    // Always run a full PBKDF2 verify (dummy hash when the account is unknown)
    // so response timing does not reveal whether login_id exists.
    const passwordOk = await verifyPassword(password, account?.password_hash ?? DUMMY_HASH);
    const ok = passwordOk && account !== null;

    if (!ok) {
      await supabase
        .from('login_attempts')
        .insert({ login_id, ip, succeeded: false });
      return json({ error: 'Invalid credentials' }, 401);
    }

    await supabase
      .from('login_attempts')
      .insert({ login_id, ip, succeeded: true });

    const token = generateToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

    const { error: sessionError } = await supabase
      .from('sessions')
      .insert({
        token,
        account_id: account.id,
        role: account.role,
        bar_id: account.bar_id,
        expires_at: expiresAt,
      });

    if (sessionError) throw sessionError;

    let barName: string | null = null;
    if (account.bar_id) {
      const { data: bar } = await supabase
        .from('bars')
        .select('name')
        .eq('id', account.bar_id)
        .maybeSingle();
      barName = bar?.name ?? null;
    }

    return json({
      token,
      role: account.role,
      bar_id: account.bar_id,
      bar_name: barName,
      expires_at: expiresAt,
    });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
