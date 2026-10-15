const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('[Seed Guild] Finding primary workspace...');
  const ws = await prisma.workspace.findFirst({
    include: { bots: true },
  });

  if (!ws) {
    console.error('No workspace found!');
    process.exit(1);
  }

  console.log(`[Seed Guild] Found workspace "${ws.name}" (${ws.id}) with ${ws.bots.length} bot(s).`);

  // Upsert a test guild
  const guild = await prisma.guildConnection.upsert({
    where: {
      workspace_id_guild_id: {
        workspace_id: ws.id,
        guild_id: '888888888888888888',
      },
    },
    update: {
      display_name: 'Studio Community Guild',
      verification_status: 'verified',
    },
    create: {
      workspace_id: ws.id,
      guild_id: '888888888888888888',
      display_name: 'Studio Community Guild',
      verification_status: 'verified',
      verified_at: new Date(),
    },
  });

  console.log(`[Seed Guild] Guild connection ready: ${guild.id}`);

  // Link all bots to guild
  for (const bot of ws.bots) {
    await prisma.botGuildAccess.upsert({
      where: {
        bot_id_guild_connection_id: {
          bot_id: bot.id,
          guild_connection_id: guild.id,
        },
      },
      update: {
        status: 'active',
      },
      create: {
        bot_id: bot.id,
        guild_connection_id: guild.id,
        status: 'active',
        permissions_snapshot: '3148800',
        last_verified_at: new Date(),
      },
    });
  }
  console.log(`[Seed Guild] Linked ${ws.bots.length} bots to guild.`);

  // Create Channel Configurations (Voice 1, Voice 2, Text 1, Announcement 1)
  const channels = [
    {
      channel_id: '100000000000000001',
      channel_type: 2, // Voice
      purpose: 'voice_streaming',
      display_name: 'Studio Voice Stage 1',
    },
    {
      channel_id: '100000000000000002',
      channel_type: 13, // Stage Voice
      purpose: 'voice_streaming',
      display_name: 'Main Auditorium Stage',
    },
    {
      channel_id: '100000000000000003',
      channel_type: 0, // Text
      purpose: 'text_testing',
      display_name: 'bot-testing-lab',
    },
    {
      channel_id: '100000000000000004',
      channel_type: 5, // Announcement
      purpose: 'announcements',
      display_name: 'studio-announcements',
    },
  ];

  for (const ch of channels) {
    await prisma.channelConfig.upsert({
      where: {
        guild_connection_id_channel_id: {
          guild_connection_id: guild.id,
          channel_id: ch.channel_id,
        },
      },
      update: {
        channel_type: ch.channel_type,
        purpose: ch.purpose,
        display_name: ch.display_name,
        status: 'active',
      },
      create: {
        workspace_id: ws.id,
        guild_connection_id: guild.id,
        channel_id: ch.channel_id,
        channel_type: ch.channel_type,
        purpose: ch.purpose,
        display_name: ch.display_name,
        status: 'active',
      },
    });
  }

  console.log('[Seed Guild] Seeded channel configurations successfully.');
}

main()
  .catch((e) => {
    console.error('[Seed Guild] Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
