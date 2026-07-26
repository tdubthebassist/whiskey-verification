#!/usr/bin/env node
/*
 * CI lint gate (consensus §C3 / plan §4.2): fail the build if any Edge Function
 * accesses a tenant table through a RAW service-role client instead of the
 * scoped wrapper. Service-role bypasses RLS, so a forgotten `bar_id` filter is a
 * cross-bar leak. The only defensible raw tenant access is:
 *   - via `scopedTenantClient(...)` (a variable conventionally named `sc`), OR
 *   - an explicitly allow-listed file that is reviewed to be safe by construction
 *     (owner cross-bar aggregation; anon public menu scoped by resolved slug).
 *
 * Usage: node scripts/check-tenant-scope.js   (exit 1 on violation)
 */
const fs = require('fs');
const path = require('path');

const FUNCTIONS_DIR = path.join(__dirname, '..', 'supabase', 'functions');
const TENANT_TABLES = ['whiskeys', 'settings', 'inventory_logs', 'inventory_monthly_snapshots'];

// Files reviewed to be safe with a raw client (they filter by a server-resolved
// bar_id and never trust a client-supplied one). Keep this list SHORT and audited.
const ALLOWLIST = new Set([
  'bars-summary/index.ts', // owner-only (requireOwner); aggregates across all bars by design
  'public-menu/index.ts',  // anon; resolves ?bar=<slug> -> bars.id, then .eq('bar_id', id)
]);

// Matches `<receiver>.from('<tenant>')` and captures the receiver token.
const tenantFromRe = new RegExp(
  String.raw`(\w+)\s*\.\s*from\(\s*['"](` + TENANT_TABLES.join('|') + String.raw`)['"]`,
  'g',
);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '_shared') continue; // the wrapper itself legitimately touches tenant tables
      out.push(...walk(full));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('_test.ts')) {
      out.push(full);
    }
  }
  return out;
}

const violations = [];
for (const file of walk(FUNCTIONS_DIR)) {
  const rel = path.relative(FUNCTIONS_DIR, file).split(path.sep).join('/');
  if (ALLOWLIST.has(rel)) continue;
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split('\n');
  let m;
  while ((m = tenantFromRe.exec(src)) !== null) {
    const receiver = m[1];
    // `sc` (or any name containing "scoped") is the scoped wrapper — allowed.
    if (receiver === 'sc' || /scoped/i.test(receiver)) continue;
    const lineNo = src.slice(0, m.index).split('\n').length;
    violations.push({ rel, lineNo, text: lines[lineNo - 1].trim(), table: m[2], receiver });
  }
}

if (violations.length > 0) {
  console.error('\n✗ tenant-scope lint FAILED — raw (unscoped) tenant-table access found:\n');
  for (const v of violations) {
    console.error(`  supabase/functions/${v.rel}:${v.lineNo}  ${v.receiver}.from('${v.table}')`);
    console.error(`      ${v.text}`);
  }
  console.error(
    `\nUse scopedTenantClient(serviceClient, barId) (conventionally \`sc\`) so bar_id is bound automatically,\n` +
    `or add the file to the audited ALLOWLIST in scripts/check-tenant-scope.js if it is safe by construction.\n`,
  );
  process.exit(1);
}

console.log('✓ tenant-scope lint passed — no unscoped tenant-table access in Edge Functions.');
