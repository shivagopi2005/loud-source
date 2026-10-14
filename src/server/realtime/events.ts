export interface RealtimeEvent {
  type: string;
  workspaceId: string;
  data: any;
  timestamp: string;
}

type EventListener = (event: RealtimeEvent) => void;

class RealtimeBroadcaster {
  private static instance: RealtimeBroadcaster;
  private listenersByWorkspace = new Map<string, Set<EventListener>>();

  public static getInstance(): RealtimeBroadcaster {
    if (!RealtimeBroadcaster.instance) {
      RealtimeBroadcaster.instance = new RealtimeBroadcaster();
    }
    return RealtimeBroadcaster.instance;
  }

  /**
   * Subscribe to real-time events for a workspace.
   */
  public subscribe(workspaceId: string, listener: EventListener): () => void {
    if (!this.listenersByWorkspace.has(workspaceId)) {
      this.listenersByWorkspace.set(workspaceId, new Set());
    }
    this.listenersByWorkspace.get(workspaceId)!.add(listener);

    return () => {
      const set = this.listenersByWorkspace.get(workspaceId);
      if (set) {
        set.delete(listener);
        if (set.size === 0) {
          this.listenersByWorkspace.delete(workspaceId);
        }
      }
    };
  }

  /**
   * Broadcast an event strictly to subscribers of the specified workspace.
   */
  public broadcast(workspaceId: string, type: string, data: any): void {
    const event: RealtimeEvent = {
      type,
      workspaceId,
      data,
      timestamp: new Date().toISOString(),
    };

    const listeners = this.listenersByWorkspace.get(workspaceId);
    if (listeners) {
      listeners.forEach((fn) => {
        try {
          fn(event);
        } catch (err) {
          console.error('[RealtimeBroadcaster] Error in event listener:', err);
        }
      });
    }
  }
}

export const realtimeBroadcaster = RealtimeBroadcaster.getInstance();
