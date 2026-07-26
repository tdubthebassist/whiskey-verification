#!/usr/bin/env bash
#
# Cross-bar isolation gate (plan §6, MANDATORY). Run against STAGING after:
#   1. migrations 004 + 005 applied
#   2. functions deployed
#   3. two bars provisioned WITH DISTINCT DATA and an owner account
#
# Requires: curl, jq. Configure via env vars, then run: bash scripts/test-isolation.sh
#
#   SUPABASE_URL      https://<ref>.supabase.co
#   ANON_KEY          the project anon (publishable) key
#   BAR_A_ID/BAR_A_PW login_id + password for bar A
#   BAR_B_ID/BAR_B_PW login_id + password for bar B
#   OWNER_ID/OWNER_PW login_id + password for the owner
#   SLUG_A/SLUG_B     the public-menu slugs for bar A and bar B
#
# Every check prints PASS/FAIL. Exit code is non-zero if any FAIL.

set -uo pipefail
: "${SUPABASE_URL:?set SUPABASE_URL}" "${ANON_KEY:?set ANON_KEY}"
: "${BAR_A_ID:?}" "${BAR_A_PW:?}" "${BAR_B_ID:?}" "${BAR_B_PW:?}" "${OWNER_ID:?}" "${OWNER_PW:?}"
: "${SLUG_A:?}" "${SLUG_B:?}"

FN="$SUPABASE_URL/functions/v1"
REST="$SUPABASE_URL/rest/v1"
fails=0
pass() { echo "  ✓ PASS: $1"; }
fail() { echo "  ✗ FAIL: $1"; fails=$((fails+1)); }

# call <fn> <token-or-empty> <json-body>
call() { curl -s -X POST "$FN/$1" -H "Authorization: Bearer $ANON_KEY" \
  ${2:+-H "x-session-token: $2"} -H "Content-Type: application/json" -d "$3"; }

login() { call login "" "{\"login_id\":\"$1\",\"password\":\"$2\"}"; }

echo "== Logging in =="
TA=$(login "$BAR_A_ID" "$BAR_A_PW" | jq -r '.token // empty')
TB=$(login "$BAR_B_ID" "$BAR_B_PW" | jq -r '.token // empty')
TO=$(login "$OWNER_ID" "$OWNER_PW" | jq -r '.token // empty')
[ -n "$TA" ] && pass "bar A login" || fail "bar A login (no token)"
[ -n "$TB" ] && pass "bar B login" || fail "bar B login (no token)"
[ -n "$TO" ] && pass "owner login" || fail "owner login (no token)"

echo "== 1. Each bar sees only its own whiskeys =="
A_IDS=$(call list-whiskeys "$TA" '{}' | jq -S '[.whiskeys[].id]|sort')
B_IDS=$(call list-whiskeys "$TB" '{}' | jq -S '[.whiskeys[].id]|sort')
echo "    A ids: $A_IDS"; echo "    B ids: $B_IDS"
OVERLAP=$(jq -n --argjson a "$A_IDS" --argjson b "$B_IDS" '$a - ($a - $b) | length')
[ "$OVERLAP" = "0" ] && pass "A and B whiskey id sets are disjoint" \
  || fail "A and B share $OVERLAP whiskey id(s) — LEAK"

echo "== 2. Bar A supplying bar_id=B is IGNORED (still gets A) =="
BID_B=$(call bars-summary "$TO" '{}' | jq -r --arg s "$SLUG_B" '.bars[] | select(.name!=null) | .bar_id' | head -1)
A_WITH_B=$(call list-whiskeys "$TA" "{\"bar_id\":\"$BID_B\"}" | jq -S '[.whiskeys[].id]|sort')
[ "$A_WITH_B" = "$A_IDS" ] && pass "client-supplied bar_id ignored on bar path" \
  || fail "bar A got different rows when passing bar_id=B — client bar_id TRUSTED (LEAK)"

echo "== 3. Owner-only endpoint: bar token → 403, owner → 200 =="
CODE_BAR=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$FN/bars-summary" \
  -H "Authorization: Bearer $ANON_KEY" -H "x-session-token: $TA" -H "Content-Type: application/json" -d '{}')
[ "$CODE_BAR" = "403" ] && pass "bar token → 403 on bars-summary" || fail "bar token got $CODE_BAR on bars-summary (expect 403)"
N_BARS=$(call bars-summary "$TO" '{}' | jq '.bars | length')
[ "${N_BARS:-0}" -ge 2 ] && pass "owner sees $N_BARS bars" || fail "owner bars-summary returned ${N_BARS:-0} (expect >=2)"

echo "== 4. Public menu is per-bar (anon), and disjoint across slugs =="
PM_A=$(curl -s "$FN/public-menu?bar=$SLUG_A" -H "Authorization: Bearer $ANON_KEY" | jq -S '[.whiskeys[].id]|sort')
PM_B=$(curl -s "$FN/public-menu?bar=$SLUG_B" -H "Authorization: Bearer $ANON_KEY" | jq -S '[.whiskeys[].id]|sort')
PM_OVERLAP=$(jq -n --argjson a "$PM_A" --argjson b "$PM_B" '$a - ($a - $b) | length')
[ "$PM_OVERLAP" = "0" ] && pass "public menus for A and B are disjoint" || fail "public menus share $PM_OVERLAP id(s) — LEAK"

echo "== 5. Raw anon PostgREST probe returns nothing (SELECT revoked) =="
RAW=$(curl -s "$REST/whiskeys?select=id&limit=5" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY")
RAW_N=$(echo "$RAW" | jq 'if type=="array" then length else 0 end' 2>/dev/null || echo 0)
[ "${RAW_N:-0}" = "0" ] && pass "raw anon read of whiskeys denied/empty" || fail "raw anon read returned $RAW_N rows — anon lockdown FAILED"

echo
if [ "$fails" -eq 0 ]; then echo "✅ ALL ISOLATION CHECKS PASSED"; exit 0
else echo "❌ $fails ISOLATION CHECK(S) FAILED"; exit 1; fi
