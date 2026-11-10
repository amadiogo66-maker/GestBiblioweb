import { NextResponse, type NextRequest } from 'next/server';
import { verifyMemberSchema } from '@/schemas/auth';
import { jsonResponse, validationErrorResponse } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { createMemberVerificationIdentifier, createSecureToken, hashToken } from '@/lib/tokens';

export const runtime = 'nodejs';

const VERIFICATION_TOKEN_TTL_MS = 15 * 60 * 1000;
const GENERIC_MESSAGE =
  "Nous n'avons pas pu vérifier votre inscription. Vérifiez vos informations ou présentez-vous à la bibliothèque.";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await request.json();
    const parsed = verifyMemberSchema.safeParse(payload);

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    const { matricule, dateNaissance } = parsed.data;

    const member = await prisma.libraryMember.findUnique({
      where: { matricule },
      select: {
        matricule: true,
        nom: true,
        prenom: true,
        dateNaissance: true,
        role: true,
        departement: true,
        inscriptionActive: true,
        dateExpiration: true,
      },
    });

    const existingUser = member
      ? await prisma.user.findUnique({ where: { matricule: member.matricule }, select: { id: true } })
      : null;

    const isEligible =
      Boolean(member) &&
      member!.inscriptionActive &&
      (!member!.dateExpiration || member!.dateExpiration > new Date()) &&
      member!.dateNaissance.getTime() === dateNaissance.getTime() &&
      !existingUser;

    if (!isEligible) {
      return jsonResponse({ success: false, message: GENERIC_MESSAGE }, 400);
    }

    const verificationToken = createSecureToken();
    const identifier = createMemberVerificationIdentifier(matricule);
    const expires = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);

    await prisma.$transaction([
      prisma.verificationToken.deleteMany({ where: { identifier } }),
      prisma.verificationToken.create({
        data: { identifier, token: hashToken(verificationToken), expires },
      }),
    ]);

    return jsonResponse({
      success: true,
      message: 'Vérification réussie',
      data: {
        verificationToken,
        nom: member!.nom,
        prenom: member!.prenom,
        role: member!.role,
        departement: member!.departement,
      },
    });
  } catch (error) {
    logger.error('Member verification failed', {
      error: error instanceof Error ? error.message : 'unknown error',
    });

    return jsonResponse({ success: false, message: GENERIC_MESSAGE }, 500);
  }
}
