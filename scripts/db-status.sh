#!/usr/bin/env bash
# Status kedua environment (container terpisah) + cek apakah dev masih mirror production.
set -uo pipefail

PROD_CONTAINER="${PROD_CONTAINER:-postgres}"
DEV_CONTAINER="${DEV_CONTAINER:-postgres_dev}"
PGUSER="${PGUSER:-postgres}"
PROD_DB="${PROD_DB:-besthcm_prod}"
DEV_DB="${DEV_DB:-besthcm_dev}"

qp() { docker exec "$PROD_CONTAINER" psql -U "$PGUSER" -d "$PROD_DB" -tAc "$1" 2>/dev/null; }
qd() { docker exec "$DEV_CONTAINER"  psql -U "$PGUSER" -d "$DEV_DB"  -tAc "$1" 2>/dev/null; }

printf "%-14s %-8s %-24s %-6s %-9s %-9s %-8s\n" "DATABASE" "PORT" "CONTAINER" "APP" "users" "requests" "segments"
printf "%-14s %-8s %-24s %-6s %-6s %-9s %-9s\n" "$PROD_DB" "5432" "$PROD_CONTAINER" "3000" \
  "$(qp 'SELECT count(*) FROM users;')" "$(qp 'SELECT count(*) FROM leave_requests;')" "$(qp 'SELECT count(*) FROM leave_request_segments;')"
printf "%-14s %-8s %-24s %-6s %-6s %-9s %-9s\n" "$DEV_DB" "5433" "$DEV_CONTAINER" "3005" \
  "$(qd 'SELECT count(*) FROM users;')" "$(qd 'SELECT count(*) FROM leave_requests;')" "$(qd 'SELECT count(*) FROM leave_request_segments;')"

echo
if [ "$(qp "SELECT md5(coalesce(string_agg(id::text, ',' ORDER BY id),'')) FROM leave_requests;")" = \
     "$(qd "SELECT md5(coalesce(string_agg(id::text, ',' ORDER BY id),'')) FROM leave_requests;")" ]; then
  echo "✓ dev MIRROR production (daftar pengajuan identik)"
else
  echo "✗ dev BERBEDA dari production — jalankan: npm run db:mirror"
fi
