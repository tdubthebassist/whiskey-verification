'use strict';

require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');
const { hashPassword } = require('./lib/password.js');

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

function getFlag(name) {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : undefined;
}

function hasFlag(name) {
  return args.includes(name);
}

const loginId = getFlag('--id');
const name    = getFlag('--name');
const pw      = getFlag('--pw');
const slug    = getFlag('--slug');
const isOwner = hasFlag('--owner');
const barId   = getFlag('--bar-id');

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

if (!loginId) { console.error('Error: --id <login_id> is required'); process.exit(1); }
if (!pw)      { console.error('Error: --pw <password> is required'); process.exit(1); }

if (!isOwner && !barId && !name) {
  console.error('Error: --name <name> is required when creating a new bar');
  process.exit(1);
}

const SUPABASE_URL              = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL)              { console.error('Error: SUPABASE_URL is not set in environment'); process.exit(1); }
if (!SUPABASE_SERVICE_ROLE_KEY) { console.error('Error: SUPABASE_SERVICE_ROLE_KEY is not set in environment'); process.exit(1); }

// ---------------------------------------------------------------------------
// Default settings — must match SETTINGS_DEFAULTS in get-settings/index.ts
// ---------------------------------------------------------------------------

const SETTINGS_DEFAULTS = {
  pour_size_ml:           29.5735,
  markup_multiplier:       3.0,
  margin_pct:              15,
  rounding_unit:           1000,
  inventory_snapshot_day:  null,
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Validate login_id uniqueness before doing any work.
  const { data: existingAccount } = await supabase
    .from('accounts')
    .select('id')
    .eq('login_id', loginId)
    .maybeSingle();

  if (existingAccount) {
    console.error(`Error: login_id "${loginId}" is already taken`);
    process.exit(1);
  }

  const passwordHash = await hashPassword(pw);

  // ------------------------------------------------------------------
  // Mode 1: --owner  →  single owner account, no bar, no settings row
  // ------------------------------------------------------------------
  if (isOwner) {
    const { data: account, error: accErr } = await supabase
      .from('accounts')
      .insert({ login_id: loginId, password_hash: passwordHash, role: 'owner', bar_id: null })
      .select('id')
      .single();

    if (accErr) {
      console.error(`Error creating owner account: ${accErr.message}`);
      process.exit(1);
    }

    console.log('Owner account created.');
    console.log(`  account_id: ${account.id}`);
    console.log(`  login_id:   ${loginId}`);
    return;
  }

  // ------------------------------------------------------------------
  // Mode 2: --bar-id <existing-uuid>  →  attach account to existing bar
  //         skip settings insert if the bar already has one
  // ------------------------------------------------------------------
  if (barId) {
    const { data: existingBar } = await supabase
      .from('bars')
      .select('id, name')
      .eq('id', barId)
      .maybeSingle();

    if (!existingBar) {
      console.error(`Error: bar with id "${barId}" does not exist`);
      process.exit(1);
    }

    const { data: account, error: accErr } = await supabase
      .from('accounts')
      .insert({ login_id: loginId, password_hash: passwordHash, role: 'bar', bar_id: barId })
      .select('id')
      .single();

    if (accErr) {
      console.error(`Error creating account: ${accErr.message}`);
      process.exit(1);
    }

    // Seed settings only if none exist yet for this bar.
    const { data: existingSettings } = await supabase
      .from('settings')
      .select('bar_id')
      .eq('bar_id', barId)
      .maybeSingle();

    if (!existingSettings) {
      const { error: settingsErr } = await supabase
        .from('settings')
        .insert({ bar_id: barId, ...SETTINGS_DEFAULTS });

      if (settingsErr) {
        console.error(`Error creating settings for bar: ${settingsErr.message}`);
        process.exit(1);
      }
      console.log(`Default settings row created for bar ${barId}.`);
    } else {
      console.log(`Settings row already exists for bar ${barId} — skipped.`);
    }

    console.log(`Account attached to existing bar "${existingBar.name}".`);
    console.log(`  account_id: ${account.id}`);
    console.log(`  login_id:   ${loginId}`);
    console.log(`  bar_id:     ${barId}`);
    return;
  }

  // ------------------------------------------------------------------
  // Mode 3 (default): create bar + settings + account atomically
  //   Insert order: bar → settings → account
  //   On any failure after bar creation, remove the bar row so we don't
  //   leave a settings-less bar behind (settings cascade-deletes with bar).
  // ------------------------------------------------------------------
  const derivedSlug = slug
    || name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  // Validate slug uniqueness before inserting.
  const { data: existingSlug } = await supabase
    .from('bars')
    .select('id')
    .eq('slug', derivedSlug)
    .maybeSingle();

  if (existingSlug) {
    console.error(
      `Error: slug "${derivedSlug}" is already taken.` +
      ` Use --slug to specify a different one.`
    );
    process.exit(1);
  }

  // 1. Insert bar.
  const { data: bar, error: barErr } = await supabase
    .from('bars')
    .insert({ name, slug: derivedSlug })
    .select('id')
    .single();

  if (barErr) {
    console.error(`Error creating bar: ${barErr.message}`);
    process.exit(1);
  }

  // 2. Insert default settings row for the new bar.
  const { error: settingsErr } = await supabase
    .from('settings')
    .insert({ bar_id: bar.id, ...SETTINGS_DEFAULTS });

  if (settingsErr) {
    await supabase.from('bars').delete().eq('id', bar.id);
    console.error(`Error creating settings: ${settingsErr.message}`);
    process.exit(1);
  }

  // 3. Insert account last.
  const { data: account, error: accErr } = await supabase
    .from('accounts')
    .insert({ login_id: loginId, password_hash: passwordHash, role: 'bar', bar_id: bar.id })
    .select('id')
    .single();

  if (accErr) {
    // Deleting the bar cascades to settings.
    await supabase.from('bars').delete().eq('id', bar.id);
    console.error(`Error creating account: ${accErr.message}`);
    process.exit(1);
  }

  console.log('Bar, account, and default settings created.');
  console.log(`  bar_id:             ${bar.id}`);
  console.log(`  slug:               ${derivedSlug}`);
  console.log(`  account_id:         ${account.id}`);
  console.log(`  login_id:           ${loginId}`);
  console.log(`  pour_size_ml:       ${SETTINGS_DEFAULTS.pour_size_ml}`);
  console.log(`  markup_multiplier:  ${SETTINGS_DEFAULTS.markup_multiplier}`);
  console.log(`  margin_pct:         ${SETTINGS_DEFAULTS.margin_pct}`);
  console.log(`  rounding_unit:      ${SETTINGS_DEFAULTS.rounding_unit}`);
  console.log(`  inventory_snapshot_day: ${SETTINGS_DEFAULTS.inventory_snapshot_day}`);
}

main().catch((err) => {
  console.error(`Unexpected error: ${err.message}`);
  process.exit(1);
});
