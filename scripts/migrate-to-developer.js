const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DEVELOPER_ID = process.env.DEVELOPER_ID || '788970167907778562';

async function migrate() {
  console.log(`[Developer Migration] Securing all fleet data to Developer Account (${DEVELOPER_ID})...`);

  // 1. Find or create the developer user
  let devUser = await prisma.user.findUnique({
    where: { discord_id: DEVELOPER_ID },
  });

  if (!devUser) {
    devUser = await prisma.user.create({
      data: {
        discord_id: DEVELOPER_ID,
        username: 'Developer',
        status: 'active',
      },
    });
    console.log(`[Developer Migration] Created developer user record: ${devUser.id}`);
  } else {
    console.log(`[Developer Migration] Found existing developer record: ${devUser.id}`);
  }

  // 2. Find all workspaces
  const workspaces = await prisma.workspace.findMany({
    include: { bots: true },
  });

  if (workspaces.length === 0) {
    console.log('[Developer Migration] No existing workspaces found. Creating primary workspace...');
    const ws = await prisma.workspace.create({
      data: {
        owner_user_id: devUser.id,
        name: 'Studio Prime Fleet',
        plan_id: 'enterprise',
      },
    });
    workspaces.push(ws);
  }

  for (const ws of workspaces) {
    console.log(`[Developer Migration] Assigning workspace "${ws.name}" (${ws.id}, ${ws.bots?.length || 0} bots) to developer...`);
    await prisma.workspace.update({
      where: { id: ws.id },
      data: { owner_user_id: devUser.id },
    });

    // Ensure developer has 'owner' membership role
    await prisma.workspaceMember.upsert({
      where: {
        workspace_id_user_id: {
          workspace_id: ws.id,
          user_id: devUser.id,
        },
      },
      update: { role: 'owner' },
      create: {
        workspace_id: ws.id,
        user_id: devUser.id,
        role: 'owner',
      },
    });

    // Clean up any old mock/quick access user memberships
    await prisma.workspaceMember.deleteMany({
      where: {
        workspace_id: ws.id,
        user: { discord_id: '112233445566778899' },
      },
    });
  }

  // Clean up old mock user if present
  try {
    await prisma.user.deleteMany({
      where: { discord_id: '112233445566778899' },
    });
  } catch {}

  const finalCheck = await prisma.user.findUnique({
    where: { discord_id: DEVELOPER_ID },
    include: {
      workspaces_owned: { include: { bots: true } },
      memberships: { include: { workspace: true } },
    },
  });

  console.log(`[Developer Migration] Success! Developer ${DEVELOPER_ID} owns:`);
  finalCheck?.workspaces_owned.forEach((w) => {
    console.log(`  - Workspace: "${w.name}" (${w.id}) | Bots: ${w.bots.length}`);
  });
}

migrate()
  .catch((err) => {
    console.error('[Developer Migration] Error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
