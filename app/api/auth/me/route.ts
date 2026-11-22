import { NextResponse } from 'next/server';
import { jsonResponse } from '@/lib/api';
import { requireActiveUser } from '@/lib/authz';

export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  // Compte relu en base : 401 sans aucune donnée s'il n'est pas ACTIVE ou n'existe plus.
  // Champs explicites : jamais password ni qrCode.
  const authz = await requireActiveUser();

  if (!authz.ok) {
    return authz.response;
  }

  return jsonResponse({
    success: true,
    data: authz.user,
  });
}
