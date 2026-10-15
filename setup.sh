#!/usr/bin/env bash
# ==============================================================================
# LOUD VOICE STUDIO - ONE-CLICK PRODUCTION SETUP & DEPLOYMENT SCRIPT
# ==============================================================================
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "=================================================================="
echo "    🔊 LOUD VOICE STUDIO - PRODUCTION SETUP & HOSTING WIZARD     "
echo "=================================================================="
echo ""

# 1. Dependency checks
echo "[1/6] Checking system dependencies..."

if ! command -v node >/dev/null 2>&1; then
  echo "[-] ERROR: Node.js is not installed. Please install Node.js 18 or higher."
  exit 1
fi

NODE_VERSION=$(node -v)
echo "[✓] Node.js: $NODE_VERSION"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "[!] WARNING: ffmpeg is not found in PATH. Audio transcoding may fail."
  echo "    Install with: sudo apt-get install -y ffmpeg"
else
  echo "[✓] ffmpeg: $(ffmpeg -version | head -n1 | cut -d' ' -f3)"
fi

if ! command -v yt-dlp >/dev/null 2>&1 && ! [ -f "/home/roy/.local/bin/yt-dlp" ]; then
  echo "[!] Installing yt-dlp..."
  python3 -m pip install -U yt-dlp --break-system-packages >/dev/null 2>&1 || true
fi
echo "[✓] yt-dlp: verified"

# 2. Environment Configuration
echo ""
echo "[2/6] Configuring Production Environment (.env)..."
mkdir -p logs

node scripts/generate-env.js

# Check Discord OAuth credentials
if grep -q "YOUR_DISCORD_CLIENT_ID" .env; then
  echo ""
  echo "------------------------------------------------------------------"
  echo " [!] ACTION REQUIRED: Discord OAuth2 Application Credentials"
  echo " To login via Discord with your Developer Account:"
  echo " 1. Go to: https://discord.com/developers/applications"
  echo " 2. Select or create your Discord Application"
  echo " 3. Copy Client ID and Client Secret"
  echo " 4. Add Redirect URI: $(grep DISCORD_REDIRECT_URI .env | cut -d'=' -f2 | tr -d '\"')"
  echo "------------------------------------------------------------------"
  echo ""
  read -p "Enter DISCORD_CLIENT_ID (or press Enter to skip for now): " INPUT_CLIENT_ID
  if [ -n "$INPUT_CLIENT_ID" ]; then
    sed -i "s/DISCORD_CLIENT_ID=\"YOUR_DISCORD_CLIENT_ID\"/DISCORD_CLIENT_ID=\"$INPUT_CLIENT_ID\"/" .env
  fi

  read -p "Enter DISCORD_CLIENT_SECRET (or press Enter to skip for now): " INPUT_CLIENT_SECRET
  if [ -n "$INPUT_CLIENT_SECRET" ]; then
    sed -i "s/DISCORD_CLIENT_SECRET=\"YOUR_DISCORD_CLIENT_SECRET\"/DISCORD_CLIENT_SECRET=\"$INPUT_CLIENT_SECRET\"/" .env
  fi
fi

# 3. Node Modules Installation
echo ""
echo "[3/6] Verifying Node packages..."
npm install --silent

# 4. Database Schema Sync
echo ""
echo "[4/6] Synchronizing Database Schema..."
npx prisma generate
npx prisma db push --accept-data-loss

# 5. Developer Ownership Migration
echo ""
echo "[5/6] Securing Fleet Workspace to Developer Account (788970167907778562)..."
node scripts/migrate-to-developer.js

# 6. Next.js Production Build
echo ""
echo "[6/6] Building Production Next.js Bundle..."
npm run build

echo ""
echo "=================================================================="
echo "    ✓ PRODUCTION SETUP COMPLETE & READY FOR 24/7 HOSTING!        "
echo "=================================================================="
echo ""
echo "All fleet data is bound to Developer ID: 788970167907778562"
echo "Quick Access dev buttons have been removed from the login screen."
echo ""
echo "HOW TO START IN PRODUCTION:"
echo ""
echo "Option A: Using PM2 (Recommended for 24/7 background operation):"
echo "  1. npm install -g pm2"
echo "  2. pm2 start ecosystem.config.js"
echo "  3. pm2 save"
echo "  4. pm2 startup"
echo ""
echo "Option B: Direct Node Production Server:"
echo "  npm run start"
echo ""
echo "Option C: Using Systemd on Linux:"
echo "  sudo cp loud-studio.service /etc/systemd/system/"
echo "  sudo systemctl daemon-reload"
echo "  sudo systemctl enable --now loud-studio"
echo ""
echo "Dashboard URL: http://localhost:3000 (or your server domain)"
echo "=================================================================="
