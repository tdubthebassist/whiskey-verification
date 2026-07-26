# Multi-Bar Conversion — Deployment & Verification Runbook

This converts the app from a single implicit bar to multi-tenant: each bar logs in with
**bar ID + password** and sees only its own data; a separate **owner** account sees all
bars as summary cards and can drill in. New bars are provisioned by CLI. The 4-digit PIN
is gone. Plan: `.omc/plans/multibar-conversion.md` · Spec: `.omc/specs/deep-interview-multi-bar-management.md`.

> ⚠️ These steps require a live Supabase project + Deno and were NOT run in the build
> environment. Run them in order against a **backup/staging DB first**.

## 0. Prerequisites
- Root `.env` with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (service-role key — never commit, never ship to the client bundle).
- Supabase CLI (`supabase`) and Deno installed. `npm install` at repo root (adds `@supabase/supabase-js`, `dotenv`).
- **Back up the database.** Migration 004 is forward-only/lossy on `settings.pin_hash` (intended).

## 1. Apply migrations (order matters)
```
supabase db push        # applies 004_multitenant.sql then 005_login_attempts.sql
```
004 does: creates `bars`/`accounts`/`sessions`; adds `bar_id` to whiskeys/settings/inventory_logs/inventory_monthly_snapshots; backfills all existing rows to the first bar `00000000-0000-0000-0000-000000000001` (slug `main`); re-keys `settings` PK to `bar_id`; drops `pin_hash`; drops+recreates the 4 DB functions with a `p_bar_id` dimension (service_role EXECUTE only); revokes anon SELECT on all 4 tenant tables and removes `whiskeys`+`inventory_logs` from `supabase_realtime`. A down-migration is included (commented) — remember it cannot restore `pin_hash`.

## 2. Deploy Edge Functions
```
supabase functions deploy login logout session bars-summary \
  list-whiskeys get-settings list-inventory-logs inventory-daily-trend public-menu \
  upsert-whiskey delete-whiskey clear-whiskeys update-settings scan-inventory \
  correct-inventory-log capture-inventory-snapshots search-price identify-bottle enrich-by-name
```
Ensure existing secrets remain set: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `SERPER_API_KEY`.

## 3. Provision accounts (CLI)
The migrated first bar has **no login account** and there is **no owner** until you create them:
```
# Give the existing (first) bar a login — attaches to the migrated data, no new bar/settings:
npm run add-bar -- --id firstbar --name "Main Bar" --pw '<password>' --bar-id 00000000-0000-0000-0000-000000000001

# Create the owner (sees all bars):
npm run add-bar -- --id owner --name Owner --pw '<password>' --owner

# Create an additional bar (creates bar + login + default settings row):
npm run add-bar -- --id secondbar --name "Second Bar" --pw '<password>' --slug second
```
New-bar default pricing: pour 29.5735ml, markup 3.0, margin 15%, rounding 1000 (matches the app's `DEFAULT_CONFIG`).

## 4. Build & deploy frontend
```
npm run build   # runs the tenant-scope lint gate, then admin build + prepare-dist
npm start        # or your Railway deploy
```
Public menu is per-bar via slug: `https://<host>/?bar=<slug>` (defaults to `main`).

## 5. MANDATORY verification gates (from plan §6 — do not skip)
Run these against staging after steps 1–3:

**a) Deno unit tests** (already written):
```
deno test supabase/functions/_shared/
```
Covers PBKDF2 hash/verify + cross-runtime format, expired-token rejection, bar-role ignores supplied bar_id, owner requires explicit bar_id.

**b) Migration-integrity** — assert on a copy of prod: row counts identical pre/post; every row `bar_id = 00000000-…-001`; no `NULL bar_id`; `pin_hash` gone; `settings` keyed by `bar_id`; both `whiskeys` and `inventory_logs` absent from `supabase_realtime`; old function overloads (`get_inventory_daily_trend(INTEGER)` etc.) gone; anon `SELECT` denied on all 4 tables.

**c) Cross-bar isolation** — provision bars A and B with distinct data. Authenticated as A, confirm via **every** read/write function (and `public-menu?bar=B`) that **no B row is ever returned or mutated**, and that A passing `bar_id=B` is ignored. Include a raw anon-key probe: direct `rest/v1/whiskeys` returns nothing.

**d) Tenant-scope lint** (runs in `npm run build`, also standalone):
```
node scripts/check-tenant-scope.js
```

## 6. Follow-ups (non-blocking, from the security review)
- Tighten CORS from `*` to the deployment origin.
- Session rotation / shorter TTL + refresh (currently fixed 7-day opaque tokens).
- Prune `login_attempts` (e.g. delete rows older than 30 days).
- Optional edge rate-limiting on the anon `public-menu`.
- Pre-existing dead code unrelated to this change: `admin/src/components/{InventoryChart,ConsumptionAnalysis}.tsx` and `admin/src/lib/supabase.ts` are unused (were already unreferenced before this change).
