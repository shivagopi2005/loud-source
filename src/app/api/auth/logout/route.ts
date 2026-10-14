import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME } from '@/server/security/jwt';
import { okResponse } from '@/server/utils/api-response';

export async function POST(request: NextRequest) {
  const response = okResponse({ loggedOut: true });
  response.cookies.delete(COOKIE_NAME);
  return response;
}
