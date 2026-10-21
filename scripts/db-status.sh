#!/usr/bin/env bash
# Tampilkan status kedua environment + cek apakah data dev masih mirror production.
set -uo pipefail

CONTAINER="${PG_CONTAINER:-postgres}"
PGUSER="${PGUSER:-postgres}"
PROD_DB="${PROD_DB:-besthcm_prod}"
DEV_DB="${DEV_DB:-besthcm_dev}"

q() { docker exec "$CONTAINER" psql -U "$PGUSER" -d "$1" -tAc "$2"; }

printf "%-14s %-8s %-9s %-9s %-9s %-9s\n" "DATABASE" "PORT" "users" "requests" "segments" "quotas"
for db in "$PROD_DB" "$DEV_DB"; do
  port="-"
  [ "$db" = "$PROD_DB" ] && port="3000"
  [ "$db" = "$DEV_DB" ] && port="3005"
  printf "%-14s %-8s %-9s %-9s %-9s %-9s\n" "$db" "$port" \
    "$(q "$db" 'SELECT count(*) FROM users;')" \
    "$(q "$db" 'SELECT count(*) FROM leave_requests;')" \
    "$(q "$db" 'SELECT count(*) FROM leave_request_segments;')" \
    "$(q "$db" 'SELECT count(*) FROM user_leave_quotas;')"
done

echo
if [ "$(q "$PROD_DB" "SELECT md5(coalesce(string_agg(id::text, ',' ORDER BY id),'')) FROM leave_requests;")" = \
     "$(q "$DEV_DB"  "SELECT md5(coalesce(string_agg(id::text, ',' ORDER BY id),'')) FROM leave_requests;")" ]; then
  echo "✓ dev MIRROR production (daftar pengajuan identik)"
else
  echo "✗ dev BERBEDA dari production — jalankan: npm run db:mirror"
fi
