#!/usr/bin/env bash
# Mirror data PRODUCTION -> DEVELOPMENT (lintas container).
#
#   PROD: container `postgres`               port 5432  database besthcm_prod
#   DEV : container `postgres_dev`   port 5433  database besthcm_dev
#
# Dev selalu berisi salinan data production, supaya bug di dev mencerminkan
# data asli. Jalankan setiap kali ingin menyegarkan.
#
# Pakai:
#   npm run db:mirror
set -euo pipefail

PROD_CONTAINER="${PROD_CONTAINER:-postgres}"
DEV_CONTAINER="${DEV_CONTAINER:-postgres_dev}"
PGUSER="${PGUSER:-postgres}"
PROD_DB="${PROD_DB:-besthcm_prod}"
DEV_DB="${DEV_DB:-besthcm_dev}"

cd "$(dirname "$0")/.."

echo "▸ dump $PROD_DB dari container '$PROD_CONTAINER' ..."
TMP="$(mktemp -t besthcm-mirror-XXXXXX.sql)"
trap 'rm -f "$TMP"' EXIT
docker exec "$PROD_CONTAINER" pg_dump -U "$PGUSER" -d "$PROD_DB" --no-owner --no-acl > "$TMP"
echo "  $(wc -c < "$TMP") bytes"

echo "▸ reset $DEV_DB di container '$DEV_CONTAINER' ..."
docker exec "$DEV_CONTAINER" psql -U "$PGUSER" -d postgres -q -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$DEV_DB' AND pid <> pg_backend_pid();" >/dev/null
docker exec "$DEV_CONTAINER" psql -U "$PGUSER" -d postgres -q -c "DROP DATABASE IF EXISTS \"$DEV_DB\";"
docker exec "$DEV_CONTAINER" psql -U "$PGUSER" -d postgres -q -c "CREATE DATABASE \"$DEV_DB\";"

echo "▸ restore -> $DEV_DB ..."
docker exec -i "$DEV_CONTAINER" psql -U "$PGUSER" -d "$DEV_DB" -q < "$TMP" >/dev/null 2>&1 || true

echo "▸ verifikasi ..."
printf "  %-26s " "prod ($PROD_CONTAINER)"
docker exec "$PROD_CONTAINER" psql -U "$PGUSER" -d "$PROD_DB" -tAc \
  "SELECT 'users='||(SELECT count(*) FROM users)||' requests='||(SELECT count(*) FROM leave_requests)||' segments='||(SELECT count(*) FROM leave_request_segments);"
printf "  %-26s " "dev ($DEV_CONTAINER)"
docker exec "$DEV_CONTAINER" psql -U "$PGUSER" -d "$DEV_DB" -tAc \
  "SELECT 'users='||(SELECT count(*) FROM users)||' requests='||(SELECT count(*) FROM leave_requests)||' segments='||(SELECT count(*) FROM leave_request_segments);"
echo "✓ mirror selesai"
