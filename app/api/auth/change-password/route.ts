import { compare, hash } from 'bcryptjs';
import { NextResponse, type NextRequest } from 'next/server';
import { getAuthenticatedUser, jsonResponse, validationErrorResponse } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { changePasswordSchema } from '@/schemas/user';

export const runtime = 'nodejs';

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return jsonResponse({ success: false, message: 'Non authentifié' }, 401);
    }

    const payload = await request.json();
    const parsed = changePasswordSchema.safeParse(payload);

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    const isCurrentPasswordValid = await compare(parsed.data.currentPassword, user.password);

    if (!isCurrentPasswordValid) {
      return jsonResponse(
        {
          success: false,
          message: 'Mot de passe actuel incorrect',
          errors: { currentPassword: ['Mot de passe actuel incorrect'] },
        },
        400
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: await hash(parsed.data.newPassword, 12),
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: 'auth.change_password',
      },
    });

    return jsonResponse({ success: true, message: 'Mot de passe mis à jour' });
  } catch (error) {
    logger.error('Password change failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de modifier le mot de passe' }, 500);
  }
}

