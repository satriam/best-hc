import { PrismaClient, Role, Gender, LeaveCategory, CalculationType, LeaveStatus, QuotaHistoryType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/besthcm?schema=public';
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding database...');

  // Clean existing data
  await prisma.leaveQuotaHistory.deleteMany();
  await prisma.leaveRequestType.deleteMany();
  await prisma.leaveRequest.deleteMany();
  await prisma.leaveQuota.deleteMany();
  await prisma.leaveType.deleteMany();
  await prisma.user.deleteMany();
  await prisma.nationalHoliday.deleteMany();

  const hashedPasswordAdmin = await bcrypt.hash('admin123', 10);
  const hashedPasswordUser = await bcrypt.hash('user123', 10);

  // 1. Seed Users
  const admin = await prisma.user.create({
    data: {
      name: 'Admin HCM',
      email: 'admin@besthcm.com',
      password: hashedPasswordAdmin,
      role: Role.ADMIN,
      gender: Gender.MALE,
      quota: {
        create: {
          totalQuota: 15,
          usedQuota: 0,
        },
      },
    },
  });

  const satria = await prisma.user.create({
    data: {
      name: 'Satria',
      email: 'user1@besthcm.com',
      password: hashedPasswordUser,
      role: Role.USER,
      gender: Gender.MALE,
      quota: {
        create: {
          totalQuota: 12,
          usedQuota: 3, // 3 days used from approved request
        },
      },
    },
  });

  const budi = await prisma.user.create({
    data: {
      name: 'Budi Santoso',
      email: 'user2@besthcm.com',
      password: hashedPasswordUser,
      role: Role.USER,
      gender: Gender.MALE,
      quota: {
        create: {
          totalQuota: 12,
          usedQuota: 0,
        },
      },
    },
  });

  const siti = await prisma.user.create({
    data: {
      name: 'Siti Rahma',
      email: 'user3@besthcm.com',
      password: hashedPasswordUser,
      role: Role.USER,
      gender: Gender.FEMALE,
      quota: {
        create: {
          totalQuota: 14,
          usedQuota: 5,
        },
      },
    },
  });

  const dewi = await prisma.user.create({
    data: {
      name: 'Dewi Lestari',
      email: 'user4@besthcm.com',
      password: hashedPasswordUser,
      role: Role.USER,
      gender: Gender.FEMALE,
      quota: {
        create: {
          totalQuota: 10,
          usedQuota: 2,
        },
      },
    },
  });

  const ahmad = await prisma.user.create({
    data: {
      name: 'Ahmad Rizky',
      email: 'user5@besthcm.com',
      password: hashedPasswordUser,
      role: Role.USER,
      quota: {
        create: {
          totalQuota: 12,
          usedQuota: 4,
        },
      },
    },
  });

  // Seed Initial Quota Histories
  const users = [satria, budi, siti, dewi, ahmad, admin];
  for (const u of users) {
    const quota = await prisma.leaveQuota.findUnique({ where: { userId: u.id } });
    if (quota) {
      await prisma.leaveQuotaHistory.create({
        data: {
          userId: u.id,
          previousQuota: 0,
          changeAmount: quota.totalQuota,
          newQuota: quota.totalQuota,
          type: QuotaHistoryType.INITIAL_QUOTA,
          description: `Alokasi kuota awal tahun (${quota.totalQuota} Hari)`,
        },
      });
    }
  }

  // 2. Seed Master Data Leave Types
  const leaveTypesData = [
    // CUTI
    {
      name: 'Cuti Tahunan',
      category: LeaveCategory.CUTI,
      calculationType: CalculationType.WORKING_DAYS,
      daysDescription: 'Hari kerja',
    },
    {
      name: 'Cuti Gugur Kandungan',
      category: LeaveCategory.CUTI,
      defaultDays: 45,
      daysDescription: '45 hari kalender',
      calculationType: CalculationType.CALENDAR_DAYS,
    },
    {
      name: 'Cuti Bersalin',
      category: LeaveCategory.CUTI,
      defaultDays: 90,
      daysDescription: '3 bulan kalender',
      calculationType: CalculationType.CALENDAR_DAYS,
    },
    {
      name: 'Cuti Bersalin dengan Keadaan Khusus',
      category: LeaveCategory.CUTI,
      defaultDays: 90,
      daysDescription: '3 bulan kalender',
      calculationType: CalculationType.CALENDAR_DAYS,
    },
    {
      name: 'Cuti Melaksanakan Ibadah Wajib Keagamaan',
      category: LeaveCategory.CUTI,
      daysDescription: 'Sesuai ketentuan Agama/Pemerintah',
      calculationType: CalculationType.CALENDAR_DAYS,
    },
    {
      name: 'Pinjam Cuti',
      category: LeaveCategory.CUTI,
      calculationType: CalculationType.WORKING_DAYS,
      daysDescription: 'Hari kerja',
    },

    // IZIN MENINGGALKAN
    {
      name: 'Pernikahan Pekerja',
      category: LeaveCategory.IZIN_MENINGGALKAN,
      defaultDays: 3,
      daysDescription: '3 hari kerja',
      calculationType: CalculationType.WORKING_DAYS,
    },
    {
      name: 'Pernikahan Anak',
      category: LeaveCategory.IZIN_MENINGGALKAN,
      defaultDays: 2,
      daysDescription: '2 hari kerja',
      calculationType: CalculationType.WORKING_DAYS,
    },
    {
      name: 'Khitanan/Pembaptisan Anak',
      category: LeaveCategory.IZIN_MENINGGALKAN,
      defaultDays: 2,
      daysDescription: '2 hari kerja',
      calculationType: CalculationType.WORKING_DAYS,
    },
    {
      name: 'Istri Melahirkan/Keguguran',
      category: LeaveCategory.IZIN_MENINGGALKAN,
      defaultDays: 2,
      daysDescription: '2 hari kerja',
      calculationType: CalculationType.WORKING_DAYS,
    },
    {
      name: 'Keluarga Inti Meninggal (Suami/Istri/Orang Tua/Mertua/Anak)',
      category: LeaveCategory.IZIN_MENINGGALKAN,
      defaultDays: 2,
      daysDescription: '2 hari kerja',
      calculationType: CalculationType.WORKING_DAYS,
    },
    {
      name: 'Anggota Keluarga dalam satu rumah meninggal',
      category: LeaveCategory.IZIN_MENINGGALKAN,
      defaultDays: 1,
      daysDescription: '1 hari kerja',
      calculationType: CalculationType.WORKING_DAYS,
    },
  ];

  const createdLeaveTypes: Record<string, string> = {};
  for (const lt of leaveTypesData) {
    const created = await prisma.leaveType.create({ data: lt });
    createdLeaveTypes[lt.name] = created.id;
  }

  // 3. Seed Sample Leave Requests
  // Request 1: Satria - APPROVED (3 days Cuti Tahunan: Aug 3 to Aug 5, 2026)
  const reqSatriaApproved = await prisma.leaveRequest.create({
    data: {
      userId: satria.id,
      startDate: new Date('2026-08-03T00:00:00.000Z'), // Monday
      endDate: new Date('2026-08-05T00:00:00.000Z'),   // Wednesday (3 days)
      totalDays: 3,
      reason: 'Keperluan pribadi keluarga di kampung',
      status: LeaveStatus.APPROVED,
      adminNote: 'Disetujui oleh HR Admin',
      requestTypes: {
        create: [{ leaveTypeId: createdLeaveTypes['Cuti Tahunan'] }],
      },
    },
  });

  // Record quota history for Satria's approved request
  await prisma.leaveQuotaHistory.create({
    data: {
      userId: satria.id,
      leaveRequestId: reqSatriaApproved.id,
      previousQuota: 12,
      changeAmount: -3,
      newQuota: 9,
      type: QuotaHistoryType.LEAVE_APPROVED,
      description: 'Pengajuan cuti disetujui (Cuti Tahunan: 3 Hari)',
    },
  });

  // Request 2: Satria - ON_PROGRESS (5 days: Sept 1 to Sept 5, 2026)
  await prisma.leaveRequest.create({
    data: {
      userId: satria.id,
      startDate: new Date('2026-09-01T00:00:00.000Z'), // Tuesday
      endDate: new Date('2026-09-05T00:00:00.000Z'),   // Saturday (5 calendar days / 4 working days)
      totalDays: 5,
      reason: 'Liburan tahunan bersama keluarga',
      status: LeaveStatus.ON_PROGRESS,
      requestTypes: {
        create: [{ leaveTypeId: createdLeaveTypes['Cuti Tahunan'] }],
      },
    },
  });

  // Request 3: Satria - REJECTED
  await prisma.leaveRequest.create({
    data: {
      userId: satria.id,
      startDate: new Date('2026-07-10T00:00:00.000Z'),
      endDate: new Date('2026-07-12T00:00:00.000Z'),
      totalDays: 3,
      reason: 'Mendadak ada urusan perkuliahan',
      status: LeaveStatus.REJECTED,
      adminNote: 'Jadwal operasional tim sedang tinggi',
      requestTypes: {
        create: [{ leaveTypeId: createdLeaveTypes['Pinjam Cuti'] }],
      },
    },
  });

  // Request 4: Satria - CANCELLED (previously approved then cancelled)
  const reqSatriaCancelled = await prisma.leaveRequest.create({
    data: {
      userId: satria.id,
      startDate: new Date('2026-06-15T00:00:00.000Z'),
      endDate: new Date('2026-06-16T00:00:00.000Z'),
      totalDays: 2,
      reason: 'Pernikahan kerabat saudara',
      status: LeaveStatus.CANCELLED,
      adminNote: 'Dibatalkan atas permintaan user',
      requestTypes: {
        create: [{ leaveTypeId: createdLeaveTypes['Pernikahan Anak'] }],
      },
    },
  });

  await prisma.leaveQuotaHistory.create({
    data: {
      userId: satria.id,
      leaveRequestId: reqSatriaCancelled.id,
      previousQuota: 7,
      changeAmount: +2,
      newQuota: 9,
      type: QuotaHistoryType.LEAVE_CANCELLED,
      description: 'Pengajuan cuti yang disetujui telah dibatalkan (+2 Hari)',
    },
  });

  // Other users leave requests
  await prisma.leaveRequest.create({
    data: {
      userId: budi.id,
      startDate: new Date('2026-08-17T00:00:00.000Z'),
      endDate: new Date('2026-08-21T00:00:00.000Z'),
      totalDays: 5,
      reason: 'Acara hajatan keluarga',
      status: LeaveStatus.ON_PROGRESS,
      requestTypes: {
        create: [{ leaveTypeId: createdLeaveTypes['Cuti Tahunan'] }],
      },
    },
  });

  const reqSitiApproved = await prisma.leaveRequest.create({
    data: {
      userId: siti.id,
      startDate: new Date('2026-08-10T00:00:00.000Z'),
      endDate: new Date('2026-08-14T00:00:00.000Z'),
      totalDays: 5,
      reason: 'Istirahat dan pemulihan kesehatan',
      status: LeaveStatus.APPROVED,
      requestTypes: {
        create: [{ leaveTypeId: createdLeaveTypes['Cuti Tahunan'] }],
      },
    },
  });
  await prisma.leaveQuotaHistory.create({
    data: {
      userId: siti.id,
      leaveRequestId: reqSitiApproved.id,
      previousQuota: 14,
      changeAmount: -5,
      newQuota: 9,
      type: QuotaHistoryType.LEAVE_APPROVED,
      description: 'Pengajuan cuti disetujui (Cuti Tahunan: 5 Hari)',
    },
  });

  const reqDewiApproved = await prisma.leaveRequest.create({
    data: {
      userId: dewi.id,
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      endDate: new Date('2026-07-02T00:00:00.000Z'),
      totalDays: 2,
      reason: 'Istri mendampingi melahirkan',
      status: LeaveStatus.APPROVED,
      requestTypes: {
        create: [{ leaveTypeId: createdLeaveTypes['Istri Melahirkan/Keguguran'] }],
      },
    },
  });
  await prisma.leaveQuotaHistory.create({
    data: {
      userId: dewi.id,
      leaveRequestId: reqDewiApproved.id,
      previousQuota: 10,
      changeAmount: -2,
      newQuota: 8,
      type: QuotaHistoryType.LEAVE_APPROVED,
      description: 'Pengajuan cuti disetujui (Istri Melahirkan/Keguguran: 2 Hari)',
    },
  });

  const reqAhmadApproved = await prisma.leaveRequest.create({
    data: {
      userId: ahmad.id,
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: new Date('2026-08-04T00:00:00.000Z'),
      totalDays: 4,
      reason: 'Mudik lebaran ke kampung halaman',
      status: LeaveStatus.APPROVED,
      requestTypes: {
        create: [{ leaveTypeId: createdLeaveTypes['Cuti Tahunan'] }],
      },
    },
  });
  await prisma.leaveQuotaHistory.create({
    data: {
      userId: ahmad.id,
      leaveRequestId: reqAhmadApproved.id,
      previousQuota: 12,
      changeAmount: -4,
      newQuota: 8,
      type: QuotaHistoryType.LEAVE_APPROVED,
      description: 'Pengajuan cuti disetujui (Cuti Tahunan: 4 Hari)',
    },
  });

  // 4. Seed National Holidays (Tanggal Merah)
  const holidaysData = [
    { date: new Date('2026-01-01T00:00:00.000Z'), name: 'Tahun Baru 2026 Masehi' },
    { date: new Date('2026-01-16T00:00:00.000Z'), name: 'Isra Mikraj Nabi Muhammad SAW' },
    { date: new Date('2026-02-17T00:00:00.000Z'), name: 'Tahun Baru Imlek 2577 Kongzili' },
    { date: new Date('2026-03-19T00:00:00.000Z'), name: 'Hari Suci Nyepi (Tahun Baru Saka 1948)' },
    { date: new Date('2026-03-20T00:00:00.000Z'), name: 'Hari Raya Idul Fitri 1447 H (Hari 1)' },
    { date: new Date('2026-03-21T00:00:00.000Z'), name: 'Hari Raya Idul Fitri 1447 H (Hari 2)' },
    { date: new Date('2026-03-22T00:00:00.000Z'), name: 'Cuti Bersama Idul Fitri' },
    { date: new Date('2026-03-23T00:00:00.000Z'), name: 'Cuti Bersama Idul Fitri' },
    { date: new Date('2026-04-03T00:00:00.000Z'), name: 'Wafat Yesus Kristus (Jumat Agung)' },
    { date: new Date('2026-05-01T00:00:00.000Z'), name: 'Hari Buruh Internasional' },
    { date: new Date('2026-05-14T00:00:00.000Z'), name: 'Kenaikan Yesus Kristus' },
    { date: new Date('2026-05-27T00:00:00.000Z'), name: 'Hari Raya Idul Adha 1447 H' },
    { date: new Date('2026-05-31T00:00:00.000Z'), name: 'Hari Raya Waisak 2570 BE' },
    { date: new Date('2026-06-01T00:00:00.000Z'), name: 'Hari Lahir Pancasila' },
    { date: new Date('2026-06-16T00:00:00.000Z'), name: 'Tahun Baru Islam 1448 H' },
    { date: new Date('2026-08-17T00:00:00.000Z'), name: 'Hari Kemerdekaan Republik Indonesia' },
    { date: new Date('2026-08-25T00:00:00.000Z'), name: 'Maulid Nabi Muhammad SAW' },
    { date: new Date('2026-12-25T00:00:00.000Z'), name: 'Hari Raya Natal' },
  ];

  for (const h of holidaysData) {
    await prisma.nationalHoliday.create({ data: h });
  }

  console.log('Database seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
