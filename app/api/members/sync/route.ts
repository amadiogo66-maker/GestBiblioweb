import { timingSafeEqual } from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { membersSyncSchema, libraryMemberInputSchema } from '@/schemas/library-member';
import { jsonResponse, validationErrorResponse } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

interface RejectedMember {
  index: number;
  matricule?: string;
  reason: string;
}

function isValidApiKey(apiKey: string | null): boolean {
  const expectedApiKey = process.env.GEST_BIBLIO_API_KEY;

  if (!apiKey || !expectedApiKey) {
    return false;
  }

  const provided = Buffer.from(apiKey);
  const expected = Buffer.from(expectedApiKey);

  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function extractMatricule(raw: unknown): string | undefined {
  if (raw && typeof raw === 'object' && 'matricule' in raw && typeof (raw as { matricule: unknown }).matricule === 'string') {
    return (raw as { matricule: string }).matricule;
  }

  return undefined;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!process.env.GEST_BIBLIO_API_KEY) {
    logger.error('Gest Biblio members sync API key is not configured');
    return jsonResponse({ success: false, message: 'Synchronisation indisponible' }, 500);
  }

  if (!isValidApiKey(request.headers.get('x-api-key'))) {
    return jsonResponse({ success: false, message: 'Clé API invalide' }, 401);
  }

  try {
    const payload = await request.json();
    const parsed = membersSyncSchema.safeParse(payload);

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    let created = 0;
    let updated = 0;
    let suspended = 0;
    let reactivated = 0;
    let roleUpdated = 0;
    const rejected: RejectedMember[] = [];

    for (const [index, rawMember] of parsed.data.members.entries()) {
      const memberParsed = libraryMemberInputSchema.safeParse(rawMember);

      if (!memberParsed.success) {
        rejected.push({
          index,
          matricule: extractMatricule(rawMember),
          reason: memberParsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
        });
        continue;
      }

      const data = memberParsed.data;

      try {
        const result = await prisma.$transaction(async (tx) => {
          const existing = await tx.libraryMember.findUnique({
            where: { matricule: data.matricule },
            select: { matricule: true },
          });

          await tx.libraryMember.upsert({
            where: { matricule: data.matricule },
            create: { ...data, email: data.email || null },
            update: { ...data, email: data.email || null },
          });

          const user = await tx.user.findUnique({
            where: { matricule: data.matricule },
            select: { id: true, role: true, status: true, autoSuspendedAt: true },
          });

          let userSuspended = false;
          let userReactivated = false;
          let userRoleUpdated = false;

          if (user) {
            const update: { role?: typeof data.role; status?: 'ACTIVE' | 'SUSPENDED'; autoSuspendedAt?: Date | null } = {};
            if (user.role !== data.role) {
              update.role = data.role;
              userRoleUpdated = true;
            }

            if (!data.inscriptionActive && user.status !== 'BANNED') {
              // A manual suspension remains manual; a member becoming inactive
              // can only add the auto-suspension marker to an active account.
              if (user.status === 'ACTIVE') {
                update.status = 'SUSPENDED';
                update.autoSuspendedAt = new Date();
                userSuspended = true;
              }
            } else if (data.inscriptionActive && user.status === 'SUSPENDED' && user.autoSuspendedAt) {
              update.status = 'ACTIVE';
              update.autoSuspendedAt = null;
              userReactivated = true;
            }

            if (Object.keys(update).length > 0) {
              await tx.user.update({ where: { id: user.id }, data: update });
            }
          }

          return { existing: Boolean(existing), userSuspended, userReactivated, userRoleUpdated };
        });

        if (result.existing) {
          updated += 1;
        } else {
          created += 1;
        }
        suspended += Number(result.userSuspended);
        reactivated += Number(result.userReactivated);
        roleUpdated += Number(result.userRoleUpdated);
      } catch (error) {
        logger.error('Member upsert failed', {
          matricule: data.matricule,
          error: error instanceof Error ? error.message : 'unknown error',
        });
        rejected.push({ index, matricule: data.matricule, reason: 'Erreur interne lors de l’enregistrement' });
      }
    }

    await prisma.activityLog.create({
      data: {
        action: 'members.sync',
        ipAddress: request.headers.get('x-forwarded-for'),
        userAgent: request.headers.get('user-agent'),
        details: { created, updated, rejected: rejected.length, suspended, reactivated, roleUpdated },
      },
    });

    return jsonResponse({
      success: true,
      message: `${created} création(s), ${updated} mise(s) à jour, ${suspended} suspension(s), ${reactivated} réactivation(s), ${roleUpdated} rôle(s) mis à jour, ${rejected.length} rejet(s)`,
      data: { created, updated, suspended, reactivated, roleUpdated, rejected: rejected.length, rejectedDetails: rejected },
    });
  } catch (error) {
    logger.error('Members sync failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de synchroniser les membres' }, 500);
  }
}
