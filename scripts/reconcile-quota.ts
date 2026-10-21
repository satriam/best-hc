/**
 * Script sekali pakai: rekonsiliasi kuota cuti.
 *
 *   ./node_modules/.bin/tsx scripts/reconcile-quota.ts            # audit + perbaiki
 *   ./node_modules/.bin/tsx scripts/reconcile-quota.ts --dry-run  # audit saja
 *
 * Sumber kebenaran = `leave_request_segments` pada pengajuan APPROVED/DONE.
 * Aman dijalankan berulang (idempoten) dan seluruh perbaikan berjalan dalam
 * satu transaksi.
 */
import 'dotenv/config';
import { prisma } from '@/lib/db';
import { auditQuotaConsistency, formatReport, reconcileQuota } from '@/services/quota-reconcile.service';

function printReport(title: string, report: Awaited<ReturnType<typeof auditQuotaConsistency>>) {
  console.log(`\n=== ${title} ===`);
  for (const line of formatReport(report)) console.log(line);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const before = await auditQuotaConsistency();
  printReport(dryRun ? 'AUDIT (dry-run)' : 'SEBELUM', before);

  const result = await reconcileQuota({ dryRun, log: (line) => console.log(`  · ${line}`) });

  if (dryRun) {
    console.log('\n[dry-run] tidak ada perubahan yang ditulis.');
    return;
  }

  console.log('\n=== PERUBAHAN ===');
  const { changes } = result;
  console.log(`  user_leave_quotas diperbaiki        : ${changes.usedQuotaUpdated.length}`);
  for (const row of changes.usedQuotaUpdated) {
    console.log(`    - ${row.userName} / ${row.leaveTypeName} (${row.year}): ${row.from} → ${row.to}`);
  }
  console.log(`  leave_quotas generik diperbaiki     : ${changes.genericQuotaUpdated.length}`);
  for (const row of changes.genericQuotaUpdated) {
    console.log(`    - ${row.userName}: ${row.from} → ${row.to}`);
  }
  console.log(`  history baseline legacy ditandai    : ${changes.legacyRowsMarked.length}`);
  for (const row of changes.legacyRowsMarked) {
    console.log(`    - ${row.userName} / ${row.leaveTypeName}: ${row.historyId}`);
  }
  console.log(`  baris koreksi history dibuat        : ${changes.legacyCorrectionsCreated.length}`);
  for (const row of changes.legacyCorrectionsCreated) {
    console.log(`    - ${row.userName} / ${row.leaveTypeName}: ${row.historyId}`);
  }

  printReport('SESUDAH', result.after);

  const clean =
    result.after.usedQuotaDrift.length === 0 &&
    result.after.genericQuotaDrift.length === 0 &&
    result.after.legacyBaselineRows.length === 0;
  console.log(`\nStatus akhir: ${clean ? 'BERSIH (0 drift)' : 'MASIH ADA DRIFT'}`);
  if (!clean) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
