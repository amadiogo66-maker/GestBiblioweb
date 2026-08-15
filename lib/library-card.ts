import QRCode from 'qrcode';
import type { UserRole } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { generateLibraryCardNumber, generateQRCodeData } from '@/lib/utils';

export interface LibraryCardData {
  fullName: string;
  libraryCard: string;
  qrCode: string;
  role: UserRole;
  department: string | null;
  expiresAt: Date;
}

export async function ensureLibraryCard(userId: string): Promise<LibraryCardData> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      role: true,
      department: true,
      libraryCard: true,
      qrCode: true,
    },
  });

  let libraryCard = user.libraryCard;
  let qrCode = user.qrCode;

  if (!libraryCard || !qrCode) {
    libraryCard = libraryCard ?? generateLibraryCardNumber();
    qrCode = qrCode ?? (await QRCode.toDataURL(generateQRCodeData(user.id)));

    await prisma.user.update({
      where: { id: user.id },
      data: { libraryCard, qrCode },
    });
  }

  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  return {
    fullName: `${user.firstName} ${user.lastName}`,
    libraryCard,
    qrCode,
    role: user.role,
    department: user.department,
    expiresAt,
  };
}
