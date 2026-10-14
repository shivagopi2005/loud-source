'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bot,
  Mic,
  Activity,
  Layers,
  ShieldCheck,
  AlertOctagon,
  ArrowRight,
  TrendingUp,
  Server,
  Clock,
  Radio,
} from 'lucide-react';
import { useWorkspace } from '@/components/providers/workspace-provider';

export default function DashboardOverviewPage() {
  const router = useRouter();
  const { currentWorkspace, triggerEmergencyStop, activeVoiceSession } = useWorkspace();

  const [metrics, setMetrics] = useState<{
    totalBots: number;
    onlineBots: number;
    degradedBots: number;
    activeSessions: number;
    messageQueueDepth: number;
    healthQueueDepth: number;
  }>({
    totalBots: 0,
    onlineBots: 0,
    degradedBots: 0,
    activeSessions: 0,
    messageQueueDepth: 0,
    healthQueueDepth: 0,
  });

  const [recentAudits, setRecentAudits] = useState<any[]>([]);
  const [bots, setBots] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadDashboardData = async () => {
    if (!currentWorkspace) return;
    try {
      setIsLoading(true);

      const [metricsRes, botsRes, auditsRes] = await Promise.all([
        fetch('/api/metrics'),
        fetch(`/api/workspaces/${currentWorkspace.id}/bots`),
        fetch(`/api/audit-events?workspaceId=${currentWorkspace.id}`),
      ]);

      if (metricsRes.ok) {
        const m = await metricsRes.json();
        if (m.data) {
          setMetrics({
            totalBots: m.data.fleet.totalBots,
            onlineBots: m.data.fleet.onlineBots,
            degradedBots: m.data.fleet.degradedBots,
            activeSessions: m.data.fleet.activeVoiceSessions,
            messageQueueDepth: m.data.queues.messageQueueDepth,
            healthQueueDepth: m.data.queues.healthCheckQueueDepth,
          });
        }
      }

      if (botsRes.ok) {
        const b = await botsRes.json();
        if (b.data) setBots(b.data);
      }

      if (auditsRes.ok) {
        const a = await auditsRes.json();
        if (a.data) setRecentAudits(a.data.slice(0, 6));
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(loadDashboardData, 10000);
    return () => clearInterval(interval);
  }, [currentWorkspace]);

  return (
    <div className="space-y-8">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            Control Operations Overview
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
              {currentWorkspace?.name || 'Loading Workspace...'}
            </span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Real-time status of authorized Discord bot fleet, voice routing, and message delivery.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => router.push('/voice')}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-md transition"
          >
            <Mic className="w-4 h-4" />
            <span>Launch Live Studio</span>
          </button>
          <button
            onClick={() => router.push('/bots?action=new')}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground font-medium text-xs border border-border transition"
          >
            <Bot className="w-4 h-4" />
            <span>Register Bot</span>
          </button>
        </div>
      </div>

      {/* ACTIVE VOICE SESSION ALERT BANNER (If session running) */}
      {activeVoiceSession && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950/40 via-card to-card border border-emerald-500/30 flex items-center justify-between shadow-xl">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="text-sm font-bold text-foreground flex items-center gap-2">
                Active Live Voice Session In Progress
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 uppercase">
                  Streaming
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                Session ID: <code className="font-mono text-emerald-300">{activeVoiceSession.sessionId}</code>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => router.push('/voice')}
              className="text-xs bg-secondary hover:bg-secondary/80 px-3 py-1.5 rounded-lg border border-border transition"
            >
              Open Mixer
            </button>
            <button
              onClick={triggerEmergencyStop}
              className="text-xs bg-destructive hover:bg-destructive/90 text-white font-bold px-3 py-1.5 rounded-lg shadow-md transition flex items-center gap-1.5"
            >
              <AlertOctagon className="w-3.5 h-3.5" />
              <span>Halt Audio</span>
            </button>
          </div>
        </div>
      )}

      {/* METRICS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="p-5 rounded-xl bg-card border border-border shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Fleet Bots</span>
            <div className="p-2 rounded-lg bg-secondary text-primary">
              <Bot className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-extrabold tracking-tight text-foreground">
              {metrics.totalBots}
            </div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
              <span className="text-emerald-400 font-semibold">{metrics.onlineBots} ready</span>
              <span>•</span>
              <span className={metrics.degradedBots > 0 ? 'text-destructive font-semibold' : 'text-muted-foreground'}>
                {metrics.degradedBots} degraded
              </span>
            </div>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="p-5 rounded-xl bg-card border border-border shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Voice Sessions</span>
            <div className="p-2 rounded-lg bg-secondary text-emerald-400">
              <Mic className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-extrabold tracking-tight text-foreground">
              {metrics.activeSessions}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Active real-time audio streams
            </div>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="p-5 rounded-xl bg-card border border-border shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Queue Depth</span>
            <div className="p-2 rounded-lg bg-secondary text-amber-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-extrabold tracking-tight text-foreground">
              {metrics.messageQueueDepth}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Pending async messages & jobs
            </div>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="p-5 rounded-xl bg-card border border-border shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">System State</span>
            <div className="p-2 rounded-lg bg-secondary text-emerald-400">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-xl font-bold tracking-tight text-emerald-400 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
              Operational
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              WebRTC Gateway + Redis Active
            </div>
          </div>
        </div>
      </div>

      {/* DUAL SECTION: FLEET SNAPSHOT & RECENT AUDIT TRAIL */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Registered Bot Fleet Status */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-foreground">Bot Fleet Snapshot</h2>
              <p className="text-xs text-muted-foreground">Authorized Discord bot instances ready for deployment.</p>
            </div>
            <button
              onClick={() => router.push('/bots')}
              className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
            >
              <span>Manage fleet</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-border/40">
            {bots.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No Discord bots registered yet. Click &quot;Register Bot&quot; to add your first application.
              </div>
            ) : (
              bots.map((bot) => (
                <div key={bot.id} className="py-3.5 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center text-foreground font-bold text-xs border border-border">
                      <Bot className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">{bot.displayName}</div>
                      <div className="text-xs text-muted-foreground font-mono">
                        App ID: {bot.applicationId} • {bot.operationalRole || 'Voice Operator'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                        bot.status === 'ready' || bot.status === 'connected'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : bot.status === 'disabled'
                          ? 'bg-secondary text-muted-foreground border-border'
                          : 'bg-destructive/10 text-destructive border-destructive/20'
                      }`}
                    >
                      {bot.status}
                    </span>
                    <button
                      onClick={() => router.push(`/bots/${bot.id}`)}
                      className="text-xs bg-secondary hover:bg-secondary/80 border border-border px-2.5 py-1 rounded-md transition"
                    >
                      Details
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Security Audit Events Log */}
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-foreground">Recent Audit Events</h2>
                <p className="text-xs text-muted-foreground">Immutable operational log.</p>
              </div>
              <button
                onClick={() => router.push('/audit')}
                className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
              >
                <span>Full log</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-3">
              {recentAudits.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  No recorded operations yet.
                </div>
              ) : (
                recentAudits.map((event) => (
                  <div key={event.id} className="p-2.5 rounded-lg bg-secondary/40 border border-border/40 text-xs">
                    <div className="flex items-center justify-between font-medium">
                      <span className="text-foreground">{event.action}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                          event.result === 'success'
                            ? 'text-emerald-400 bg-emerald-500/10'
                            : 'text-destructive bg-destructive/10'
                        }`}
                      >
                        {event.result}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1 flex items-center justify-between">
                      <span>By {event.actorName || 'System'}</span>
                      <span>{new Date(event.createdAt).toLocaleTimeString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
