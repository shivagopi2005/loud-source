import { prisma } from './prisma';
import { encryptSecret } from '../security/encryption';

async function main() {
  console.log('Seeding Multi-Bot Voice Studio database...');

  // 1. Create or upsert default user
  const user = await prisma.user.upsert({
    where: { discord_id: '112233445566778899' },
    update: {},
    create: {
      discord_id: '112233445566778899',
      username: 'StudioCommander',
      avatar_url: 'https://cdn.discordapp.com/embed/avatars/0.png',
      status: 'active',
    },
  });

  // 2. Create or upsert workspace
  let workspace = await prisma.workspace.findFirst({
    where: { owner_user_id: user.id },
  });

  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: {
        owner_user_id: user.id,
        name: 'Studio Prime Fleet',
        plan_id: 'pro',
        status: 'active',
      },
    });
  }

  // 3. Ensure membership
  await prisma.workspaceMember.upsert({
    where: {
      workspace_id_user_id: {
        workspace_id: workspace.id,
        user_id: user.id,
      },
    },
    update: { role: 'owner' },
    create: {
      workspace_id: workspace.id,
      user_id: user.id,
      role: 'owner',
    },
  });

  // 4. Create Bot 1 (Voice Bot)
  const bot1 = await prisma.botApplication.upsert({
    where: {
      workspace_id_application_id: {
        workspace_id: workspace.id,
        application_id: '990000000000000001',
      },
    },
    update: {},
    create: {
      workspace_id: workspace.id,
      application_id: '990000000000000001',
      display_name: 'Studio Voice Bot Alpha',
      verified_bot_user_id: '990000000000000001',
      status: 'ready',
      operational_role: 'voice_operator',
      tags: ['voice', 'primary', 'studio'],
      last_health_check_at: new Date(),
    },
  });

  // Encrypt token for Bot 1
  const token1Encrypted = encryptSecret('mock_bot_token_alpha_1234567890abcdef');
  await prisma.botCredential.create({
    data: {
      bot_id: bot1.id,
      secret_reference: token1Encrypted,
      credential_version: 1,
      status: 'active',
    },
  });

  // 5. Create Bot 2 (Fleet Announcer & Backup Voice Bot)
  const bot2 = await prisma.botApplication.upsert({
    where: {
      workspace_id_application_id: {
        workspace_id: workspace.id,
        application_id: '990000000000000002',
      },
    },
    update: {},
    create: {
      workspace_id: workspace.id,
      application_id: '990000000000000002',
      display_name: 'Fleet Announcer & Voice Beta',
      verified_bot_user_id: '990000000000000002',
      status: 'ready',
      operational_role: 'announcer',
      tags: ['announcements', 'voice_backup', 'fleet'],
      last_health_check_at: new Date(),
    },
  });

  // Encrypt token for Bot 2
  const token2Encrypted = encryptSecret('mock_bot_token_beta_9876543210fedcba');
  await prisma.botCredential.create({
    data: {
      bot_id: bot2.id,
      secret_reference: token2Encrypted,
      credential_version: 1,
      status: 'active',
    },
  });

  // 6. Create Guild Connection
  const guild = await prisma.guildConnection.upsert({
    where: {
      workspace_id_guild_id: {
        workspace_id: workspace.id,
        guild_id: '888888888888888888',
      },
    },
    update: {},
    create: {
      workspace_id: workspace.id,
      guild_id: '888888888888888888',
      display_name: 'Official Production Community Guild',
      verification_status: 'verified',
      verified_at: new Date(),
    },
  });

  // Link bots to guild
  await prisma.botGuildAccess.upsert({
    where: {
      bot_id_guild_connection_id: {
        bot_id: bot1.id,
        guild_connection_id: guild.id,
      },
    },
    update: {},
    create: {
      bot_id: bot1.id,
      guild_connection_id: guild.id,
      status: 'active',
      permissions_snapshot: '3148800',
      last_verified_at: new Date(),
    },
  });

  await prisma.botGuildAccess.upsert({
    where: {
      bot_id_guild_connection_id: {
        bot_id: bot2.id,
        guild_connection_id: guild.id,
      },
    },
    update: {},
    create: {
      bot_id: bot2.id,
      guild_connection_id: guild.id,
      status: 'active',
      permissions_snapshot: '3148800',
      last_verified_at: new Date(),
    },
  });

  // 7. Create Channel Configurations
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
      update: {},
      create: {
        workspace_id: workspace.id,
        guild_connection_id: guild.id,
        channel_id: ch.channel_id,
        channel_type: ch.channel_type,
        purpose: ch.purpose,
        display_name: ch.display_name,
        status: 'active',
      },
    });
  }

  // 8. Create Bot Group
  const group = await prisma.botGroup.upsert({
    where: {
      workspace_id_name: {
        workspace_id: workspace.id,
        name: 'Voice Studio Fleet',
      },
    },
    update: {},
    create: {
      workspace_id: workspace.id,
      name: 'Voice Studio Fleet',
      description: 'Primary bots allocated for live microphone streaming',
    },
  });

  await prisma.botGroupMember.upsert({
    where: {
      group_id_bot_id: {
        group_id: group.id,
        bot_id: bot1.id,
      },
    },
    update: {},
    create: {
      group_id: group.id,
      bot_id: bot1.id,
    },
  });

  // 9. Initial Audit Record
  await prisma.auditEvent.create({
    data: {
      workspace_id: workspace.id,
      actor_user_id: user.id,
      actor_type: 'user',
      action: 'workspace.init',
      resource_type: 'workspace',
      resource_id: workspace.id,
      result: 'success',
      metadata: { seed: true, note: 'Initialized Studio Fleet workspace' },
    },
  });

  console.log('Seeding completed successfully!');
  console.log(`User ID: ${user.id}`);
  console.log(`Workspace ID: ${workspace.id}`);
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
