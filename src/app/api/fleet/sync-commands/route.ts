import { NextRequest } from 'next/server';
import { okResponse, handleApiError } from '@/server/utils/api-response';
import { BotCommandService, PREFIX_COMMANDS } from '@/server/services/bot-command.service';
import { AuditService } from '@/server/services/audit.service';
import { prisma } from '@/server/db/prisma';

export async function POST(request: NextRequest) {
  try {
    // Purge all slash commands from Discord API across all bots in the fleet
    const purgeResult = await BotCommandService.removeAllSlashCommandsForAllBots();

    const ws = await prisma.workspace.findFirst();
    if (ws) {
      await AuditService.record({
        workspaceId: ws.id,
        action: 'fleet.purge_slash_commands',
        resourceType: 'bot',
        resourceId: 'all',
        metadata: {
          totalBots: purgeResult.totalBots,
          successfulBots: purgeResult.successfulBots,
          failedBots: purgeResult.failedBots,
          prefixCommandCount: PREFIX_COMMANDS.length,
        },
      });
    }

    return okResponse({
      message: `Successfully purged all slash commands across ${purgeResult.successfulBots} / ${purgeResult.totalBots} bots. All bots are exclusively configured for !prefix commands.`,
      commands: PREFIX_COMMANDS,
      summary: purgeResult,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function GET() {
  return okResponse({
    commands: PREFIX_COMMANDS,
    totalCommands: PREFIX_COMMANDS.length,
  });
}
