#!/usr/bin/env bash
# Hapus DATA TESTING dari database, tanpa menyentuh konfigurasi.
#
# DIHAPUS  : semua pengajuan cuti + segmen + jenis-per-pengajuan + riwayat kuota
#            yang menempel pada pengajuan (LEAVE_APPROVED, dll). usedQuota direset 0.
# DISIMPAN : users, leave_types, user_leave_quotas (total kuota), leave_quotas,
#            national_holidays, dan riwayat konfigurasi (INITIAL_QUOTA,
#            ADMIN_MANUAL_ADJUSTMENT, ANNUAL_RESET).
#
# Pakai:
#   bash scripts/clean-test-data.sh                 # target besthcm_prod
#   DB=besthcm_dev bash scripts/clean-test-data.sh  # target dev
#   bash scripts/clean-test-data.sh --yes           # tanpa konfirmasi
set -euo pipefail

CONTAINER="${PG_CONTAINER:-postgres}"
PGUSER="${PGUSER:-postgres}"
DB="${DB:-${PROD_DB:-besthcm_prod}}"
ASSUME_YES=0
[ "${1:-}" = "--yes" ] && ASSUME_YES=1

q() { docker exec "$CONTAINER" psql -U "$PGUSER" -d "$DB" -tAc "$1"; }

echo "▸ target database: $DB"
echo "  sebelum: users=$(q 'SELECT count(*) FROM users;') \
requests=$(q 'SELECT count(*) FROM leave_requests;') \
segments=$(q 'SELECT count(*) FROM leave_request_segments;') \
history=$(q 'SELECT count(*) FROM leave_quota_histories;')"

if [ "$ASSUME_YES" -eq 0 ]; then
  read -r -p "  Hapus semua data pengajuan cuti di $DB? (ketik YA) " ans
  [ "$ans" = "YA" ] || { echo "dibatalkan"; exit 1; }
fi

docker exec -i "$CONTAINER" psql -U "$PGUSER" -d "$DB" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;

-- 1. Riwayat kuota yang lahir dari pengajuan (bukan konfigurasi kuota).
DELETE FROM leave_quota_histories
WHERE type IN ('LEAVE_APPROVED','LEAVE_CANCELLED','LEAVE_REJECTED_AFTER_APPROVAL',
               'LEAVE_DAYS_UPDATED','BORROWED_QUOTA_DEDUCTION');

-- 2. Pengajuan + anak-anaknya (segmen & jenis ikut terhapus via cascade,
--    tapi dihapus eksplisit supaya urutannya pasti).
DELETE FROM leave_request_segments;
DELETE FROM leave_request_types;
DELETE FROM leave_requests;

-- 3. Reset pemakaian kuota (jatah/total tetap).
UPDATE user_leave_quotas SET "usedQuota" = 0, "borrowedQuota" = 0;
UPDATE leave_quotas      SET "usedQuota" = 0;

COMMIT;
SQL

echo "  sesudah: users=$(q 'SELECT count(*) FROM users;') \
requests=$(q 'SELECT count(*) FROM leave_requests;') \
segments=$(q 'SELECT count(*) FROM leave_request_segments;') \
history=$(q 'SELECT count(*) FROM leave_quota_histories;')"
echo "✓ data testing dihapus dari $DB (konfigurasi kuota, user, jenis cuti, hari libur tetap utuh)"
