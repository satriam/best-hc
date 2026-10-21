-- CreateTable
CREATE TABLE "leave_request_segments" (
    "id" TEXT NOT NULL,
    "leaveRequestId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "totalDays" INTEGER NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_request_segments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leave_request_segments_leaveRequestId_idx" ON "leave_request_segments"("leaveRequestId");

-- AddForeignKey
ALTER TABLE "leave_request_segments" ADD CONSTRAINT "leave_request_segments_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "leave_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_request_segments" ADD CONSTRAINT "leave_request_segments_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: setiap pengajuan lama (yang belum punya segment) menjadi TEPAT satu
-- segment dengan rentang & total hari yang sama seperti envelope-nya, memakai
-- jenis cuti PERTAMA pada tabel pivot leave_request_types (urutan createdAt).
-- Bila sebuah pengajuan lama tidak punya pivot sama sekali, dipakai jenis cuti
-- paling awal yang tersedia agar FK leaveTypeId tetap terpenuhi.
-- Idempoten: hanya mengisi pengajuan yang belum punya segment.
INSERT INTO "leave_request_segments" (
    "id",
    "leaveRequestId",
    "leaveTypeId",
    "startDate",
    "endDate",
    "totalDays",
    "order",
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    lr."id",
    COALESCE(
        (
            SELECT rt."leaveTypeId"
            FROM "leave_request_types" rt
            WHERE rt."leaveRequestId" = lr."id"
            ORDER BY rt."createdAt" ASC, rt."id" ASC
            LIMIT 1
        ),
        (
            SELECT lt."id"
            FROM "leave_types" lt
            ORDER BY lt."createdAt" ASC, lt."id" ASC
            LIMIT 1
        )
    ),
    lr."startDate",
    lr."endDate",
    lr."totalDays",
    0,
    NOW(),
    NOW()
FROM "leave_requests" lr
WHERE NOT EXISTS (
    SELECT 1 FROM "leave_request_segments" s WHERE s."leaveRequestId" = lr."id"
)
AND EXISTS (
    SELECT 1 FROM "leave_types" lt2
);
