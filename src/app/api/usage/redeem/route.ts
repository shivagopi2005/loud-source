import { NextRequest } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { getAuthenticatedUser } from '@/server/security/rbac';
import { PremiumService } from '@/server/services/premium.service';
import { okResponse, handleApiError, errorResponse } from '@/server/utils/api-response';

export async function POST(request: NextRequest) {
  try {
    const session = getAuthenticatedUser(request);
    const body = await request.json();
    const code = body?.code?.trim();

    if (!code) {
      return errorResponse('KEY_REQUIRED', 'Please enter a valid license key.', 400);
    }

    // Retrieve user record to get Discord Snowflake ID
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
    });

    if (!user) {
      return errorResponse('USER_NOT_FOUND', 'User session not found.', 404);
    }

    // Redeem key via real cryptographic check against the license_keys table
    const result = await PremiumService.redeemLicenseKey(code, user.discord_id);

    if (!result.success) {
      return errorResponse('REDEMPTION_FAILED', result.message, 400);
    }

    // If workspaceId was provided, synchronize workspace capacity
    const workspaceId = body?.workspaceId;
    if (workspaceId) {
      try {
        await prisma.workspace.update({
          where: { id: workspaceId },
          data: { plan_id: 'enterprise' },
        });
      } catch (wsErr) {
        console.warn('[UsageRedeem] Workspace plan sync notice:', wsErr);
      }
    }

    return okResponse({
      success: true,
      message: result.message,
      durationDays: result.durationDays,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
