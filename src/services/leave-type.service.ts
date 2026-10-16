import { prisma } from '@/lib/db';
import { LeaveTypeInput } from '@/schemas/leave-type.schema';

export async function getAllLeaveTypes() {
  return prisma.leaveType.findMany({
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });
}

export async function getLeaveTypeById(id: string) {
  return prisma.leaveType.findUnique({
    where: { id },
  });
}

export async function createLeaveType(input: LeaveTypeInput) {
  return prisma.leaveType.create({
    data: {
      name: input.name,
      category: input.category,
      defaultDays: input.defaultDays,
      daysDescription: input.daysDescription,
      calculationType: input.calculationType,
    },
  });
}

export async function updateLeaveType(id: string, input: Partial<LeaveTypeInput>) {
  return prisma.leaveType.update({
    where: { id },
    data: input,
  });
}

export async function deleteLeaveType(id: string) {
  return prisma.leaveType.delete({
    where: { id },
  });
}
