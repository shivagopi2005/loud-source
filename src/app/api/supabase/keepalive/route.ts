import { NextResponse } from 'next/server';
import { SupabaseKeepAliveService } from '@/server/services/supabase-keepalive.service';

export async function GET() {
  const result = await SupabaseKeepAliveService.pingOnce();
  const status = SupabaseKeepAliveService.getStatus();

  return NextResponse.json(
    {
      success: result.success,
      ping: result,
      diagnostics: status,
    },
    { status: result.success ? 200 : 503 }
  );
}

export async function POST() {
  const result = await SupabaseKeepAliveService.pingOnce();
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}
