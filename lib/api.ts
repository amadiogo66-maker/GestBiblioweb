import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import type { ApiResponse } from '@/types';

export function jsonResponse<T>(body: ApiResponse<T>, status = 200): NextResponse<ApiResponse<T>> {
  return NextResponse.json(body, { status });
}

export function validationErrorResponse(error: ZodError): NextResponse<ApiResponse<never>> {
  const errors = Object.fromEntries(
    Object.entries(error.flatten().fieldErrors).filter((entry): entry is [string, string[]] => Array.isArray(entry[1]))
  );

  return jsonResponse(
    {
      success: false,
      message: 'Données invalides',
      errors,
    },
    400
  );
}

export function prismaErrorResponse(error: unknown): NextResponse<ApiResponse<never>> | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const targets = Array.isArray(error.meta?.target) ? error.meta.target.map(String) : [];
    const field = targets.includes('email') ? 'email' : targets.includes('username') ? 'username' : targets[0] ?? 'field';

    return jsonResponse(
      {
        success: false,
        message: 'Une ressource existe déjà avec ces informations',
        errors: {
          [field]: ['Cette valeur est déjà utilisée'],
        },
      },
      409
    );
  }

  return null;
}

/**
 * Utilisateur de la session relu en base, QUEL QUE SOIT son statut.
 * Réservé à /api/auth/me ; pour autoriser une action, utiliser
 * requireActiveUser() / requireStaff() de lib/authz.ts.
 */
export async function getAuthenticatedUser() {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  return prisma.user.findUnique({
    where: { id: session.user.id },
  });
}
