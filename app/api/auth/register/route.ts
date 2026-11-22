import { hash } from 'bcryptjs';
import QRCode from 'qrcode';
import { Prisma, UserStatus } from '@prisma/client';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { jsonResponse, prismaErrorResponse, validationErrorResponse } from '@/lib/api';
import { registerSchema } from '@/schemas/auth';
import { createMemberVerificationIdentifier, hashToken } from '@/lib/tokens';
import { enforceRateLimits, ipRateLimitKey } from '@/lib/rate-limit';
import { RATE_LIMITS } from '@/lib/constants';

export const runtime = 'nodejs';

const GENERIC_MESSAGE =
  "Nous n'avons pas pu vérifier votre inscription. Vérifiez vos informations ou présentez-vous à la bibliothèque.";

function createLibraryCard(): string {
  const year = new Date().getFullYear();
  const randomPart = crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase();

  return `GB-${year}-${randomPart}`;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const limited = await enforceRateLimits([
      { key: ipRateLimitKey('register', request.headers), rule: RATE_LIMITS.registerIp },
    ]);

    if (limited) {
      return limited;
    }

    const payload = await request.json();
    const parsed = registerSchema.safeParse(payload);

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    const { matricule, verificationToken, email, username, password } = parsed.data;

    const identifier = createMemberVerificationIdentifier(matricule);
    const tokenHash = hashToken(verificationToken);
    const verification = await prisma.verificationToken.findFirst({
      where: { identifier, token: tokenHash, expires: { gt: new Date() } },
    });

    if (!verification) {
      return jsonResponse({ success: false, message: GENERIC_MESSAGE }, 400);
    }

    const member = await prisma.libraryMember.findUnique({ where: { matricule } });

    if (!member || !member.inscriptionActive) {
      return jsonResponse({ success: false, message: GENERIC_MESSAGE }, 400);
    }

    const existingUserForMember = await prisma.user.findUnique({ where: { matricule }, select: { id: true } });

    if (existingUserForMember) {
      return jsonResponse({ success: false, message: GENERIC_MESSAGE }, 400);
    }

    const hashedPassword = await hash(password, 12);
    const libraryCard = createLibraryCard();
    const qrCode = await QRCode.toDataURL(libraryCard, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 256,
    });

    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email,
          username,
          password: hashedPassword,
          firstName: member.prenom,
          lastName: member.nom,
          role: member.role,
          department: member.departement,
          departmentId: member.departmentId,
          matricule: member.matricule,
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

      await tx.verificationToken.deleteMany({ where: { identifier } });
      // Prêts déjà reçus du logiciel pour ce membre, avant la création de son compte.
      await tx.loan.updateMany({
        where: { matricule: member.matricule, userId: null },
        data: { userId: createdUser.id },
      });

      return createdUser;
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
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const targets = Array.isArray(error.meta?.target) ? error.meta.target.map(String) : [];

      if (targets.includes('matricule')) {
        return jsonResponse({ success: false, message: GENERIC_MESSAGE }, 400);
      }
    }

    const prismaResponse = prismaErrorResponse(error);

    if (prismaResponse) {
      return prismaResponse;
    }

    logger.error('Registration failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de créer le compte' }, 500);
  }
}
