import { NextResponse } from 'next/server';
import { getAuthenticatedUser, jsonResponse } from '@/lib/api';

export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  // getAuthenticatedUser ne sélectionne jamais password ni qrCode.
  const user = await getAuthenticatedUser();

  if (!user) {
    return jsonResponse({ success: false, message: 'Non authentifié' }, 401);
  }

  return jsonResponse({
    success: true,
    data: user,
  });
}
