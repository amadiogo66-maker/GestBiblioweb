import { NextResponse, type NextRequest } from 'next/server';
import { membersSyncSchema, libraryMemberInputSchema } from '@/schemas/library-member';
import { jsonResponse, validationErrorResponse } from '@/lib/api';
import { rejectInvalidApiKey } from '@/lib/api-key';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { UnresolvedDepartments, loadDepartmentIndex, lookupDepartmentId } from '@/lib/departments';
import { BODY_LIMITS } from '@/lib/constants';
import { payloadTooLargeResponse, readJsonBody } from '@/lib/json-body';
import { getClientIp } from '@/lib/client-ip';

export const runtime = 'nodejs';

interface RejectedMember {
  index: number;
  matricule?: string;
  reason: string;
}

function extractMatricule(raw: unknown): string | undefined {
  if (raw && typeof raw === 'object' && 'matricule' in raw && typeof (raw as { matricule: unknown }).matricule === 'string') {
    return (raw as { matricule: string }).matricule;
  }

  return undefined;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rejectedKey = rejectInvalidApiKey(request, 'Gest Biblio members sync API key is not configured');

  if (rejectedKey) {
    return rejectedKey;
  }

  try {
    const payload = await readJsonBody(request, BODY_LIMITS.sync);
    const parsed = membersSyncSchema.safeParse(payload);

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    let created = 0;
    let updated = 0;
    let suspended = 0;
    let reactivated = 0;
    let roleUpdated = 0;
    let userDepartmentsUpdated = 0;
    const rejected: RejectedMember[] = [];
    // Index des départements officiels chargé UNE fois pour tout le lot.
    const departmentIndex = await loadDepartmentIndex(prisma);
    const unresolvedDepartments = new UnresolvedDepartments<'matricule'>();

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
            select: { matricule: true, departement: true },
          });

          // Le texte reste la source : departmentId est recalculé à chaque
          // synchronisation à partir du texte effectif (reçu, ou conservé en base
          // si le champ est absent de la requête).
          const departementReceived = data.departement !== undefined;
          const departementText = departementReceived ? data.departement ?? null : existing?.departement ?? null;
          const departmentId = lookupDepartmentId(departmentIndex, departementText);
          const unresolvedValue =
            departementReceived && !departmentId && departementText?.trim() ? departementText : null;

          await tx.libraryMember.upsert({
            where: { matricule: data.matricule },
            create: { ...data, email: data.email || null, departmentId },
            update: { ...data, email: data.email || null, departmentId },
          });

          const user = await tx.user.findUnique({
            where: { matricule: data.matricule },
            select: { id: true, role: true, status: true, autoSuspendedAt: true, department: true, departmentId: true },
          });

          let userSuspended = false;
          let userReactivated = false;
          let userRoleUpdated = false;
          let userDepartmentUpdated = false;

          if (user) {
            const update: {
              role?: typeof data.role;
              status?: 'ACTIVE' | 'SUSPENDED';
              autoSuspendedAt?: Date | null;
              department?: string | null;
              departmentId?: string | null;
            } = {};

            // Le département du profil vient de la bibliothèque : il suit le
            // membre (texte et identifiant), y compris un retour à null.
            if (user.department !== departementText || user.departmentId !== departmentId) {
              update.department = departementText;
              update.departmentId = departmentId;
              userDepartmentUpdated = true;
            }

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

          return {
            existing: Boolean(existing),
            userSuspended,
            userReactivated,
            userRoleUpdated,
            userDepartmentUpdated,
            unresolvedValue,
          };
        });

        if (result.existing) {
          updated += 1;
        } else {
          created += 1;
        }
        suspended += Number(result.userSuspended);
        reactivated += Number(result.userReactivated);
        roleUpdated += Number(result.userRoleUpdated);
        userDepartmentsUpdated += Number(result.userDepartmentUpdated);

        // Signalé seulement après un enregistrement réussi : le membre est accepté.
        if (result.unresolvedValue) {
          unresolvedDepartments.add({ matricule: data.matricule, value: result.unresolvedValue });
        }
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
        ipAddress: getClientIp(request.headers),
        userAgent: request.headers.get('user-agent'),
        details: {
          created,
          updated,
          rejected: rejected.length,
          suspended,
          reactivated,
          roleUpdated,
          unresolvedDepartments: unresolvedDepartments.count,
          userDepartmentsUpdated,
        },
      },
    });

    return jsonResponse({
      success: true,
      message: `${created} création(s), ${updated} mise(s) à jour, ${suspended} suspension(s), ${reactivated} réactivation(s), ${roleUpdated} rôle(s) mis à jour, ${rejected.length} rejet(s)`,
      data: {
        created,
        updated,
        suspended,
        reactivated,
        roleUpdated,
        rejected: rejected.length,
        rejectedDetails: rejected,
        // Champs ajoutés (optionnels pour les appelants existants).
        unresolvedDepartments: unresolvedDepartments.count,
        unresolvedDetails: unresolvedDepartments.details,
      },
    });
  } catch (error) {
    const tooLarge = payloadTooLargeResponse(error);

    if (tooLarge) {
      return tooLarge;
    }

    logger.error('Members sync failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de synchroniser les membres' }, 500);
  }
}
