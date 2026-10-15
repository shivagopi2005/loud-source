# 🚀 Loud Voice Studio - Production Hosting & Deployment Guide

This guide covers everything required to deploy **Loud Voice Studio & Multi-Bot Fleet Controller** to a production server (Ubuntu/Debian VPS, AWS EC2, DigitalOcean, Linode, or bare metal) for **24/7 background operation**.

---

## ⚡ 1. One-Click Setup

We have included an automated setup wizard that configures your environment, generates AES-256-GCM encryption keys, synchronizes the database, and builds the production bundle:

```bash
bash setup.sh
```

---

## 🔑 2. Discord Developer Portal Configuration

To log in via Discord with your **Developer Account** (`788970167907778562`) and control the fleet:

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Select your main Discord Application (or create one).
3. Navigate to **OAuth2** -> **General**:
   - Copy **Client ID** and paste it into `.env` as `DISCORD_CLIENT_ID`.
   - Copy **Client Secret** and paste it into `.env` as `DISCORD_CLIENT_SECRET`.
   - Under **Redirects**, add your callback URL:
     ```
     https://your-domain.com/api/auth/discord/callback
     ```
     *(Or `http://YOUR_SERVER_IP:3000/api/auth/discord/callback` if testing on a raw IP)*.
4. Navigate to **Bot** -> **Privileged Gateway Intents**:
   - Ensure the following three intents are **ENABLED** for your bots:
     - [x] **Presence Intent**
     - [x] **Server Members Intent**
     - [x] **Message Content Intent** (Required for `!play`, `!dm`, `!spam`, `!volume`, `!stop`)

---

## 🛡️ 3. Developer Account & Quick Access Migration

* **Quick Access Removed**: The mock / dev-login buttons have been removed from the `/login` page.
* **Developer Ownership**: All 27 fleet bots, profile configurations, banners, and workspace data are permanently linked to **Developer ID `788970167907778562`**.
* **Automatic Binding**: When you log in via Discord using Developer ID `788970167907778562`, the system automatically assigns you primary workspace ownership and grants supreme fleet commander privileges.

---

## ⚙️ 4. Hosting Methods (Choose One)

### Option A: Hosting with PM2 (Recommended for 24/7 Production)

PM2 keeps your server running permanently in the background, auto-restarts on unexpected crashes, and starts automatically on server reboot.

1. **Install PM2 globally**:
   ```bash
   sudo npm install -g pm2
   ```

2. **Start the studio**:
   ```bash
   pm2 start ecosystem.config.js
   ```

3. **Enable auto-start on server boot**:
   ```bash
   pm2 save
   pm2 startup
   ```

4. **Useful PM2 commands**:
   ```bash
   pm2 status                  # Check server and bot status
   pm2 logs loud-voice-studio  # View real-time live logs
   pm2 restart loud-voice-studio
   pm2 stop loud-voice-studio
   ```

---

### Option B: Hosting with Systemd (Linux Service)

If you prefer standard Linux system services:

1. **Copy the service file**:
   ```bash
   sudo cp loud-studio.service /etc/systemd/system/loud-studio.service
   ```

2. **Edit paths if necessary**:
   ```bash
   sudo nano /etc/systemd/system/loud-studio.service
   # Verify User= and WorkingDirectory= match your server's installation path
   ```

3. **Enable and start the service**:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now loud-studio
   ```

4. **Check status and logs**:
   ```bash
   sudo systemctl status loud-studio
   sudo journalctl -u loud-studio -f
   ```

---

## 🌐 5. Nginx Reverse Proxy with SSL (Optional Domain Setup)

To access your studio over a custom domain with HTTPS and WebSockets:

1. **Install Nginx & Certbot**:
   ```bash
   sudo apt update
   sudo apt install -y nginx certbot python3-certbot-nginx
   ```

2. **Create Nginx site configuration**:
   ```nginx
   # /etc/nginx/sites-available/loud-studio
   server {
       server_name your-domain.com;

       # Next.js Application & API
       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;
       }

       # High-Performance Voice Gateway WebSocket
       location /media-stream {
           proxy_pass http://127.0.0.1:3001;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
           proxy_set_header Host $host;
           proxy_read_timeout 86400s;
           proxy_send_timeout 86400s;
       }
   }
   ```

3. **Enable site and obtain free SSL certificate**:
   ```bash
   sudo ln -s /etc/nginx/sites-available/loud-studio /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   sudo certbot --nginx -d your-domain.com
   ```

---

## 🎵 6. Production Fleet Commands Summary

| Command | Usage | Description |
| :--- | :--- | :--- |
| `!play <song or link>` / `!p` | `!play despacito` | Plays high-fidelity music across all fleet bots simultaneously |
| `!pause` / `!resume` | `!pause` | Pauses or resumes playback across all bots |
| `!nowplaying` / `!np` | `!np` | Displays track title, duration, volume, and requester |
| `!volume <1-10000>` | `!volume 500` | Sets master playback volume across all bots simultaneously |
| `!dm @user {msg} .count` | `!dm @user wake up .5` | Dispatches direct messages to user from all bots |
| `!dm stop` | `!dm stop` | Halts all active direct message blasts |
| `!spam {msg} .count` | `!spam {ALERT} .10` | All bots spam message in current channel simultaneously |
| `!spam stop` | `!spam stop` | Halts all active channel spam |
| `!stop` | `!stop` | Emergency Stop: kills all voice streams and disconnects all bots |
| `!status` | `!status` | Real-time fleet health, online count, voice state, and latency |

---

## 🛡️ 7. Preventing Supabase from Going Offline / Sleeping

Supabase Free Tier databases automatically pause if they receive no queries or API calls for **7 consecutive days**. To guarantee that your database and 27 bot registrations **NEVER** pause or go offline, we have engineered a multi-layered keep-alive system:

### 1. In-App Automated Heartbeat (Built-In & Automatic)
- Whenever your server is running (via PM2, systemd, or `npm run start`), the built-in `SupabaseKeepAliveService` runs every **5 minutes**.
- It runs two simultaneous checks:
  1. A direct SQL query: `SELECT 1 as keepalive;` via Prisma to keep database connections warm.
  2. A secure HTTP API ping with your publishable key to `https://wnbxfndxmofoylnsbyao.supabase.co/auth/v1/health`.
- Status is inspectable live at: `http://localhost:3000/api/supabase/keepalive`

### 2. Standalone Keep-Alive Script
Run manually or add to system crontab:
```bash
node scripts/supabase-keepalive.js
```

### 3. Optional: Free External Cloud Ping (100% Off-Server Redundancy)
Even if your local host server or VPS is turned off for weeks, you can keep Supabase awake for free using any free uptime monitor:
1. Go to [cron-job.org](https://cron-job.org) or [uptimerobot.com](https://uptimerobot.com) (100% free).
2. Create an HTTP monitor that runs once every 24 hours (or every 6 hours):
   - **URL**: `https://wnbxfndxmofoylnsbyao.supabase.co/auth/v1/health`
   - **Header**: `apikey: sb_publishable_iWTvZCUWxTAPllyofl7a6Q_6jqAME90`
3. With this monitor active, Supabase registers daily activity from the cloud and will **NEVER pause or go to sleep**.
