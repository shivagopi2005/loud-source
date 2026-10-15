const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const envPath = path.join(__dirname, '..', '.env');
const envExamplePath = path.join(__dirname, '..', '.env.example');

function parseEnv(content) {
  const env = {};
  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  });
  return env;
}

function generateSecret(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function run() {
  console.log('====================================================');
  console.log('   LOUD VOICE STUDIO - PRODUCTION ENV GENERATOR     ');
  console.log('====================================================');

  let existing = {};
  if (fs.existsSync(envPath)) {
    existing = parseEnv(fs.readFileSync(envPath, 'utf8'));
    console.log('[+] Found existing .env file. Preserving existing credentials and database settings.');
  }

  // Preserve or generate AES-256-GCM 32-byte key (64 hex characters)
  const encryptionKey = (existing.ENCRYPTION_KEY_HEX && existing.ENCRYPTION_KEY_HEX.length === 64)
    ? existing.ENCRYPTION_KEY_HEX
    : generateSecret(32);

  // Preserve or generate JWT and Media secrets
  const jwtSecret = existing.JWT_SECRET || generateSecret(32);
  const mediaSessionSecret = existing.MEDIA_SESSION_SECRET || generateSecret(32);

  const port = process.env.PORT || existing.PORT || '3000';
  const mediaPort = process.env.MEDIA_GATEWAY_PORT || existing.MEDIA_GATEWAY_PORT || '3001';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || existing.NEXT_PUBLIC_APP_URL || `http://localhost:${port}`;
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL || existing.NEXT_PUBLIC_WS_URL || `ws://localhost:${mediaPort}`;

  const databaseUrl = process.env.DATABASE_URL || existing.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/loud_db?schema=public';
  const redisUrl = process.env.REDIS_URL || existing.REDIS_URL || 'redis://localhost:6380';

  const discordClientId = process.env.DISCORD_CLIENT_ID || existing.DISCORD_CLIENT_ID || 'YOUR_DISCORD_CLIENT_ID';
  const discordClientSecret = process.env.DISCORD_CLIENT_SECRET || existing.DISCORD_CLIENT_SECRET || 'YOUR_DISCORD_CLIENT_SECRET';
  const discordRedirectUri = process.env.DISCORD_REDIRECT_URI || existing.DISCORD_REDIRECT_URI || `${appUrl}/api/auth/discord/callback`;

  // Always protect Developer ID
  const developerId = '788970167907778562';
  const existingAdmins = (existing.ADMIN_USER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!existingAdmins.includes(developerId)) {
    existingAdmins.unshift(developerId);
  }
  const adminUserIds = existingAdmins.join(',');

  const envContent = `# ==============================================================================
# LOUD VOICE STUDIO - PRODUCTION ENVIRONMENT CONFIGURATION
# Generated At: ${new Date().toISOString()}
# ==============================================================================

# Server Environment & Host Binds
NODE_ENV=production
HOST="0.0.0.0"
PORT=${port}
MEDIA_GATEWAY_PORT=${mediaPort}
NEXT_PUBLIC_APP_URL="${appUrl}"
NEXT_PUBLIC_WS_URL="${wsUrl}"

# PostgreSQL Database (Primary Fleet Store)
DATABASE_URL="${databaseUrl}"

# Redis (Job Queue & Telemetry Broker)
REDIS_URL="${redisUrl}"

# Discord OAuth2 Application Credentials (for Developer Dashboard Login)
# Obtain from: https://discord.com/developers/applications
DISCORD_CLIENT_ID="${discordClientId}"
DISCORD_CLIENT_SECRET="${discordClientSecret}"
DISCORD_REDIRECT_URI="${discordRedirectUri}"

# Cryptographic Security & AES-256-GCM Vault Key (DO NOT LOSE THIS KEY)
ENCRYPTION_KEY_HEX="${encryptionKey}"
JWT_SECRET="${jwtSecret}"
MEDIA_SESSION_SECRET="${mediaSessionSecret}"
SESSION_COOKIE_NAME="loud_session"

# Fleet Permissions & Developer Shield
# Developer ID 788970167907778562 has supreme unrestricted fleet commander access
ADMIN_USER_IDS="${adminUserIds}"

# Fleet Operations Defaults
MAX_BOTS_PER_WORKSPACE=100
MAX_CONCURRENT_VOICE_ENDPOINTS=50
DEFAULT_DISCORD_SCOPES="bot applications.commands"
`;

  fs.writeFileSync(envPath, envContent, 'utf8');
  console.log(`[✓] Production .env file written successfully to: ${envPath}`);
  console.log(`[✓] ENCRYPTION_KEY_HEX: ${encryptionKey.slice(0, 8)}...${encryptionKey.slice(-8)} (32-byte AES-256-GCM)`);
  console.log(`[✓] Developer Admin: ${developerId}`);
}

run();
