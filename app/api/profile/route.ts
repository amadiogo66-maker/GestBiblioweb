import { NextResponse, type NextRequest } from 'next/server';
import { getAuthenticatedUser, jsonResponse, validationErrorResponse } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { updateProfileSchema } from '@/schemas/user';

export const runtime = 'nodejs';

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return jsonResponse({ success: false, message: 'Non authentifié' }, 401);
    }

    const payload = await request.json();
    const parsed = updateProfileSchema.safeParse(payload);

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        photo: parsed.data.photo || null,
        department: parsed.data.department || null,
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
        updatedAt: true,
      },
    });

    return jsonResponse({
      success: true,
      message: 'Profil mis à jour',
      data: updatedUser,
    });
  } catch (error) {
    logger.error('Profile update failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de modifier le profil' }, 500);
  }
}

