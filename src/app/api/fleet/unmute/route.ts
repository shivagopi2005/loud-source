import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authorizeWorkspaceMember } from '@/server/security/rbac';
import { okResponse, handleApiError } from '@/server/utils/api-response';
import { mediaGateway } from '@/server/voice/media-gateway';
import { prisma } from '@/server/db/prisma';

const FleetUnmuteSchema = z.object({
  workspaceId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { workspaceId, sessionId } = FleetUnmuteSchema.parse(body);

    await authorizeWorkspaceMember(request, workspaceId, 'voice:start');

    if (sessionId) {
      const active = mediaGateway.getSession(sessionId);
      if (active) {
        active.masterMuted = false;
        active.endpoints.forEach((w) => w.setMute(false));
      }
    } else {
      const sessions = await prisma.voiceSession.findMany({
        where: { workspace_id: workspaceId, state: 'streaming' },
      });
      for (const s of sessions) {
        const active = mediaGateway.getSession(s.id);
        if (active) {
          active.masterMuted = false;
          active.endpoints.forEach((w) => w.setMute(false));
        }
      }
    }

    return okResponse({ muted: false, workspaceId });
  } catch (err) {
    return handleApiError(err);
  }
}
