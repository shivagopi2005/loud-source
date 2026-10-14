import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AuthError } from '../security/rbac';

export function okResponse<T>(data: T, status = 200, headers?: HeadersInit) {
  return NextResponse.json(
    {
      success: true,
      data,
    },
    { status, headers }
  );
}

export function errorResponse(
  code: string,
  message: string,
  status = 400,
  details?: any
) {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        details: details || null,
        timestamp: new Date().toISOString(),
      },
    },
    { status }
  );
}

export function handleApiError(err: unknown) {
  if (err instanceof AuthError) {
    return errorResponse(err.code, err.message, err.statusCode);
  }

  if (err instanceof ZodError) {
    return errorResponse(
      'VALIDATION_ERROR',
      'Request body or parameter validation failed',
      422,
      err.errors
    );
  }

  const message = err instanceof Error ? err.message : 'Internal server error';
  console.error('[API Error]:', err);
  return errorResponse('INTERNAL_SERVER_ERROR', message, 500);
}
