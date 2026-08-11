import { NextResponse } from 'next/server';
import { API_VERSION, APP_NAME } from '@/lib/constants';

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: API_VERSION,
    environment: process.env.NODE_ENV ?? 'development',
    app: APP_NAME,
  });
}
