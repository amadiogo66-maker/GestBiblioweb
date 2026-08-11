import { hash } from 'bcryptjs';
import QRCode from 'qrcode';
import { UserStatus } from '@prisma/client';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { jsonResponse, prismaErrorResponse, validationErrorResponse } from '@/lib/api';
import { registerSchema } from '@/schemas/auth';

export const runtime = 'nodejs';

function createLibraryCard(): string {
  const year = new Date().getFullYear();
  const randomPart = crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase();

  return `GB-${year}-${randomPart}`;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await request.json();
    const parsed = registerSchema.safeParse(payload);

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    const { confirmPassword: _confirmPassword, password, ...data } = parsed.data;
    const hashedPassword = await hash(password, 12);
    const libraryCard = createLibraryCard();
    const qrCode = await QRCode.toDataURL(libraryCard, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 256,
    });

    const user = await prisma.user.create({
      data: {
        ...data,
        password: hashedPassword,
        status: UserStatus.ACTIVE,
        libraryCard,
        qrCode,
      },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        photo: true,
        libraryCard: true,
        department: true,
        createdAt: true,
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: 'auth.register',
        ipAddress: request.headers.get('x-forwarded-for'),
        userAgent: request.headers.get('user-agent'),
      },
    });

    return jsonResponse(
      {
        success: true,
        message: 'Compte créé. Vous pouvez maintenant vous connecter.',
        data: user,
      },
      201
    );
  } catch (error) {
    const prismaResponse = prismaErrorResponse(error);

    if (prismaResponse) {
      return prismaResponse;
    }

    logger.error('Registration failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de créer le compte' }, 500);
  }
}
