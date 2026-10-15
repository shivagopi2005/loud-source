import 'dotenv/config';
import http from 'http';
import next from 'next';
import { mediaGateway } from './voice/media-gateway';
import { startWorkers } from './jobs/worker';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOST || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);
const mediaPort = parseInt(process.env.MEDIA_GATEWAY_PORT || '3001', 10);

process.on('uncaughtException', (err: any) => {
  if (
    err?.code === 'ERR_SOCKET_DGRAM_NOT_RUNNING' ||
    err?.message?.includes('socket closed') ||
    err?.message?.includes('Cannot perform IP discovery')
  ) {
    console.warn('[UDP Socket Warning (Ignored)]:', err.message);
    return;
  }
  console.error('[Server Uncaught Exception]:', err);
});

process.on('unhandledRejection', (reason: any) => {
  if (
    reason?.code === 'ERR_SOCKET_DGRAM_NOT_RUNNING' ||
    reason?.message?.includes('socket closed') ||
    reason?.message?.includes('Cannot perform IP discovery')
  ) {
    console.warn('[UDP Rejection Warning (Ignored)]:', reason.message);
    return;
  }
  console.warn('[Server Unhandled Rejection]:', reason?.message || reason);
});

async function bootstrap() {
  console.log(`[Bootstrap] Starting Multi-Bot Voice Studio (Node.js ${process.version})...`);

  // 1. Prepare Next.js app
  const app = next({ dev, hostname, port, dir: process.cwd() });
  const handle = app.getRequestHandler();
  await app.prepare();

  // 2. Create HTTP server for Next.js
  const server = http.createServer(async (req, res) => {
    try {
      await handle(req, res);
    } catch (err) {
      console.error('[HTTP Error]:', err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  });

  server.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });

  // 3. Attach Media Gateway WebSocket server
  // We can attach to a dedicated port or the main server
  try {
    mediaGateway.attachServer(mediaPort);
    console.log(`> Media Gateway listening on ws://${hostname}:${mediaPort}`);
  } catch (err) {
    console.warn(`[MediaGateway] Port ${mediaPort} bind error:`, err);
  }

  // 4. Start BullMQ background workers
  try {
    const { messageWorker, healthWorker } = startWorkers();
    console.log(`> BullMQ workers initialized successfully`);

    const cleanup = async () => {
      console.log('Shutting down gracefully...');
      await messageWorker.close();
      await healthWorker.close();
      server.close();
      process.exit(0);
    };

    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);
  } catch (err: any) {
    console.warn('[Workers] Worker startup warning:', err.message);
  }

  // 5. Connect all ready bots to Discord Gateway (brings bots ONLINE)
  try {
    const { FleetGatewayService } = await import('./services/fleet-gateway.service');
    await FleetGatewayService.autoConnectAll();
  } catch (err: any) {
    console.warn('[FleetGateway] Auto-connect startup warning:', err.message);
  }
}

bootstrap().catch((err) => {
  console.error('[Fatal Error during startup]:', err);
  process.exit(1);
});
