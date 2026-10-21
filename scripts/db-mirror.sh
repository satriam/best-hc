#!/usr/bin/env bash
# Mirror data PRODUCTION -> DEVELOPMENT (besthcm_prod -> besthcm_dev).
#
# Dev selalu berisi salinan data production, supaya bug yang muncul di dev
# benar-benar mencerminkan data asli. Jalankan setiap kali ingin menyegarkan.
#
# Pakai:
#   npm run db:mirror          # salin ulang dev dari prod (dev DIHAPUS dulu)
#   npm run db:mirror -- --keep  # salin tanpa drop (bisa bentrok kalau sudah ada)
set -euo pipefail

CONTAINER="${PG_CONTAINER:-postgres}"
PGUSER="${PGUSER:-postgres}"
PROD_DB="${PROD_DB:-besthcm_prod}"
DEV_DB="${DEV_DB:-besthcm_dev}"
KEEP=0
[ "${1:-}" = "--keep" ] && KEEP=1

cd "$(dirname "$0")/.."

echo "▸ dump $PROD_DB ..."
TMP="$(mktemp -t besthcm-mirror-XXXXXX.sql)"
trap 'rm -f "$TMP"' EXIT
docker exec "$CONTAINER" pg_dump -U "$PGUSER" -d "$PROD_DB" --no-owner --no-acl > "$TMP"
echo "  $(wc -c < "$TMP") bytes"

if [ "$KEEP" -eq 0 ]; then
  echo "▸ reset $DEV_DB ..."
  docker exec "$CONTAINER" psql -U "$PGUSER" -d postgres -q -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$DEV_DB' AND pid <> pg_backend_pid();" >/dev/null
  docker exec "$CONTAINER" psql -U "$PGUSER" -d postgres -q -c "DROP DATABASE IF EXISTS \"$DEV_DB\";"
  docker exec "$CONTAINER" psql -U "$PGUSER" -d postgres -q -c "CREATE DATABASE \"$DEV_DB\";"
fi

echo "▸ restore -> $DEV_DB ..."
docker exec -i "$CONTAINER" psql -U "$PGUSER" -d "$DEV_DB" -q < "$TMP" >/dev/null 2>&1 || true

echo "▸ verifikasi ..."
for db in "$PROD_DB" "$DEV_DB"; do
  printf "  %-14s " "$db"
  docker exec "$CONTAINER" psql -U "$PGUSER" -d "$db" -tAc \
    "SELECT 'users='||(SELECT count(*) FROM users)||' requests='||(SELECT count(*) FROM leave_requests)||' segments='||(SELECT count(*) FROM leave_request_segments);"
done
echo "✓ mirror selesai: $PROD_DB -> $DEV_DB"
