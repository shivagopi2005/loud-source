import { NextRequest } from 'next/server';
import { authorizeWorkspaceMember } from '@/server/security/rbac';
import { realtimeBroadcaster } from '@/server/realtime/events';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get('workspaceId');

  if (!workspaceId) {
    return new Response('workspaceId required', { status: 400 });
  }

  try {
    await authorizeWorkspaceMember(request, workspaceId);
  } catch (err: any) {
    return new Response(err.message || 'Unauthorized', { status: 401 });
  }

  // Create SSE stream
  const responseStream = new TransformStream();
  const writer = responseStream.writable.getWriter();
  const encoder = new TextEncoder();

  // Send initial connected event
  writer.write(
    encoder.encode(`event: connected\ndata: ${JSON.stringify({ workspaceId, connected: true })}\n\n`)
  );

  // Subscribe to workspace broadcaster
  const unsubscribe = realtimeBroadcaster.subscribe(workspaceId, (event) => {
    try {
      writer.write(
        encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`)
      );
    } catch {
      unsubscribe();
    }
  });

  // Keepalive heartbeat timer
  const interval = setInterval(() => {
    try {
      writer.write(
        encoder.encode(`event: ping\ndata: ${JSON.stringify({ time: Date.now() })}\n\n`)
      );
    } catch {
      clearInterval(interval);
      unsubscribe();
    }
  }, 15000);

  request.signal.addEventListener('abort', () => {
    clearInterval(interval);
    unsubscribe();
    try {
      writer.close();
    } catch {}
  });

  return new Response(responseStream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
