import { NextResponse } from 'next/server';
import { getAuthenticatedUser, jsonResponse } from '@/lib/api';

export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  const user = await getAuthenticatedUser();

  if (!user) {
    return jsonResponse({ success: false, message: 'Non authentifié' }, 401);
  }

  const { password: _password, qrCode: _qrCode, ...safeUser } = user;

  return jsonResponse({
    success: true,
    data: safeUser,
  });
}

