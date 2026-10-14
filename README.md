# LOUD: Multi-Bot Voice Studio & Discord Control Center

**Version:** 1.0  
**Stack:** Node.js 24, TypeScript, Next.js 15, PostgreSQL (Prisma), Redis (BullMQ), Discord.js v14, @discordjs/voice, Web Audio API, WebSockets.

---

## 1. Overview & Architecture

Loud Voice Studio is a production SaaS platform and Discord control center that allows authenticated operators to:
- Authenticate via Discord OAuth2.
- Manage multi-tenant workspaces with Role-Based Access Control (Owner, Administrator, Operator, Viewer).
- Register and verify official Discord bot applications without exposing credentials to frontend JavaScript.
- Verify server (guild) memberships and configure voice/text destinations.
- Capture browser microphone audio in real time via the Web Audio API (with noise suppression, high-pass filter, dynamics compressor, and live VU meters).
- Broadcast live audio to multiple Discord voice channels simultaneously via dedicated media gateway WebSocket streaming and `@discordjs/voice`.
- Send controlled single test messages and fleet announcements with deduplication and bounded retries.
- Instantly trigger an **Emergency Stop** that tears down all active audio transmissions and bot voice connections.
- Inspect persistent audit logs with correlation IDs, real-time system metrics, and queue telemetry.

### Architecture Diagram

```
Browser / Dashboard (Web Audio API)
      |
      +---- Discord OAuth2 (/api/auth/discord)
      |
      +---- Authenticated REST API (/api/*)
      |         |
      |         +---- PostgreSQL (Prisma ORM)
      |         +---- Encrypted Secret Store (AES-256-GCM)
      |         +---- Redis / BullMQ (Message & Health Queues)
      |         +---- Server-Sent Events (/api/realtime/events)
      |
Microphone Stream (16-bit PCM / 48kHz)
      |
  [WebSocket]
      v
Media Gateway Manager (Port 3001)
      |
      +---- Master Audio Processing (Gain, Limiter, RMS / VU Peak Meter)
      |
      +---- Voice Worker A (Discord.js Voice AudioPlayer) ----> Discord Voice Channel #1
      +---- Voice Worker B (Discord.js Voice AudioPlayer) ----> Discord Voice Channel #2
      +---- Voice Worker N (Discord.js Voice AudioPlayer) ----> Discord Voice Channel #N
```

---

## 2. Security & Compliance Contract

1. **Zero Credential Exposure**: Bot tokens submitted during registration are verified via Discord's REST API and encrypted at rest with **AES-256-GCM** using a 32-byte secret key and 12-byte initialization vector (IV). Raw tokens are never logged, never returned in API responses, and never stored in browser storage.
2. **Server-Side Authorization**: Every state-changing API request verifies user session tokens, workspace membership, and user role (`owner`, `administrator`, `operator`, `viewer`) in backend middleware.
3. **Audio Privacy & Explicit Action**: Microphone capture requires explicit user initiation. Transmission never auto-starts on page load or after a restart.
4. **Emergency Stop**: One-click emergency halt available across all dashboard pages that terminates browser media streams, destroys Discord voice connections, and broadcasts state to all subscribers.
5. **No Self-Bots or Flooding**: Works strictly with official Discord bot applications and respects Discord platform policies and rate limits.

---

## 3. Getting Started

### Prerequisites

- Node.js 24+
- Docker & Docker Compose
- PostgreSQL (or via Docker on port 5432)
- Redis (or via Docker on port 6380)

### 1. Clone & Install Dependencies

```bash
npm install
```

### 2. Environment Configuration

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Ensure the following variables are configured:

```env
NODE_ENV=development
PORT=3000
MEDIA_GATEWAY_PORT=3001
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/loud_db?schema=public"
REDIS_URL="redis://localhost:6380"
ENCRYPTION_KEY_HEX="b85786ad7a0600558236013b8efd6c986dabb285e93670f5fbd39c2796fefb22"
JWT_SECRET="670667582994bc94bbea4bff75861c8300762c252c491c477e2a2564cd0bdb34"
MEDIA_SESSION_SECRET="7f82b79a1f298414ab9f738491cbe480a789123456789abcdef0123456789abc"
```

### 3. Start Database & Queues

```bash
docker-compose up -d
```

### 4. Push Schema & Seed Test Data

```bash
npx prisma generate
npx prisma db push
npm run db:seed
```

### 5. Start Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000). You can log in using Discord OAuth2 or click **"Enter as Studio Commander (Quick Access)"** for instant testing.

---

## 4. Running Tests

Loud includes comprehensive unit and integration test suites covering encryption, JWT verification, role-based authorization, Discord REST APIs, multi-output voice lifecycle, emergency stop, and message job cancellation:

```bash
npm test
```

---

## 5. API Reference Summary

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/me` | Current user profile and workspace roles |
| `POST` | `/api/auth/dev-login` | Quick developer login |
| `POST` | `/api/auth/logout` | Clear session cookie |
| `GET` | `/api/workspaces` | List accessible workspaces |
| `POST` | `/api/workspaces` | Create new workspace |
| `GET` | `/api/workspaces/:id/bots` | List registered bots in workspace |
| `POST` | `/api/workspaces/:id/bots` | Register new bot (validates token & encrypts) |
| `POST` | `/api/bots/:id/health-check` | Run bounded health check |
| `POST` | `/api/bots/:id/rotate-credential` | Rotate bot token securely |
| `POST` | `/api/guilds/verify` | Verify bot membership in a Discord server |
| `GET` | `/api/guilds/:id/channels` | Query live channels and permission diagnostics |
| `POST` | `/api/channel-configs` | Save voice or text channel destination |
| `POST` | `/api/voice-sessions` | Create voice session & issue media token |
| `POST` | `/api/voice-sessions/:id/start` | Start live transmission to Discord voice |
| `POST` | `/api/voice-sessions/:id/stop` | Stop session gracefully |
| `POST` | `/api/voice-sessions/:id/emergency-stop` | Global emergency halt |
| `POST` | `/api/messages/test` | Send single verified test message |
| `POST` | `/api/announcements` | Queue fleet announcement in BullMQ |
| `GET` | `/api/audit-events` | Query security audit trail |
| `GET` | `/api/metrics` | Operational CPU, memory, and queue telemetry |
| `GET` | `/api/ready` | Readiness probe (checks DB & Redis) |
