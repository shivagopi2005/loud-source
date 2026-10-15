'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
  UserCircle,
  Plus,
} from 'lucide-react';
import { useWorkspace } from '@/components/providers/workspace-provider';
import { getCachedData, setCachedData } from '@/lib/client-cache';

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

    // Instant cache hydration: zero waiting for page switch
    const cacheKeyMetrics = 'dashboard:metrics';
    const cacheKeyBots = `workspace:${currentWorkspace.id}:bots`;
    const cacheKeyAudits = `workspace:${currentWorkspace.id}:audits`;

    const cachedMetrics = getCachedData<any>(cacheKeyMetrics);
    const cachedBots = getCachedData<any>(cacheKeyBots);
    const cachedAudits = getCachedData<any>(cacheKeyAudits);

    if (cachedMetrics) setMetrics(cachedMetrics);
    if (cachedBots) setBots(cachedBots);
    if (cachedAudits) setRecentAudits(cachedAudits);
    if (cachedMetrics || cachedBots) {
      setIsLoading(false);
    }

    try {
      const [metricsRes, botsRes, auditsRes] = await Promise.all([
        fetch('/api/metrics'),
        fetch(`/api/workspaces/${currentWorkspace.id}/bots`),
        fetch(`/api/audit-events?workspaceId=${currentWorkspace.id}`),
      ]);

      if (metricsRes.ok) {
        const m = await metricsRes.json();
        if (m.data) {
          const newMetrics = {
            totalBots: m.data.fleet.totalBots,
            onlineBots: m.data.fleet.onlineBots,
            degradedBots: m.data.fleet.degradedBots,
            activeSessions: m.data.fleet.activeVoiceSessions,
            messageQueueDepth: m.data.queues.messageQueueDepth,
            healthQueueDepth: m.data.queues.healthCheckQueueDepth,
          };
          setMetrics(newMetrics);
          setCachedData(cacheKeyMetrics, newMetrics, 15000);
        }
      }

      if (botsRes.ok) {
        const b = await botsRes.json();
        if (b.data) {
          setBots(b.data);
          setCachedData(cacheKeyBots, b.data, 15000);
        }
      }

      if (auditsRes.ok) {
        const a = await auditsRes.json();
        if (a.data) {
          const sliceAudits = a.data.slice(0, 6);
          setRecentAudits(sliceAudits);
          setCachedData(cacheKeyAudits, sliceAudits, 15000);
        }
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
    <div className="space-y-6">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-border">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <span>Fleet Operations Overview</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-secondary text-foreground border border-border">
              {currentWorkspace?.name || 'Loading...'}
            </span>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Operational status of authorized Discord bots, voice gateways, and messaging queues.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <Link
            href="/profiles"
            prefetch={true}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-secondary hover:bg-secondary/80 text-foreground font-medium text-xs border border-border transition"
          >
            <UserCircle className="w-3.5 h-3.5 text-muted-foreground" />
            <span>Bot Profiles</span>
          </Link>
          <Link
            href="/voice"
            prefetch={true}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-sm transition"
          >
            <Mic className="w-3.5 h-3.5" />
            <span>Voice Studio</span>
          </Link>
          <Link
            href="/bots?action=new"
            prefetch={true}
            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-md bg-secondary hover:bg-secondary/80 text-foreground font-medium text-xs border border-border transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Bot</span>
          </Link>
        </div>
      </div>

      {/* ACTIVE VOICE SESSION ALERT BANNER */}
      {activeVoiceSession && (
        <div className="p-3.5 rounded-lg bg-card border border-emerald-500/40 flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-md bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Radio className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-foreground flex items-center gap-2">
                Live Voice Session Active
                <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 uppercase">
                  Broadcasting
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground font-mono">
                Session ID: {activeVoiceSession.sessionId}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => router.push('/voice')}
              className="text-xs bg-secondary hover:bg-secondary/80 px-2.5 py-1 rounded-md border border-border transition font-medium"
            >
              Open Studio
            </button>
            <button
              onClick={triggerEmergencyStop}
              className="text-xs bg-destructive hover:bg-destructive/90 text-white font-semibold px-2.5 py-1 rounded-md shadow-sm transition flex items-center gap-1.5"
            >
              <AlertOctagon className="w-3.5 h-3.5" />
              <span>Halt Audio</span>
            </button>
          </div>
        </div>
      )}

      {/* METRICS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Metric 1: Fleet Bots */}
        <div className="p-4 rounded-lg bg-card border border-border flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Fleet Bots</span>
            <div className="p-1.5 rounded-md bg-secondary text-primary">
              <Bot className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {metrics.totalBots}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
              <span className="text-emerald-400 font-medium">{metrics.onlineBots} connected</span>
              <span>•</span>
              <span className={metrics.degradedBots > 0 ? 'text-destructive font-medium' : 'text-muted-foreground'}>
                {metrics.degradedBots} degraded
              </span>
            </div>
          </div>
        </div>

        {/* Metric 2: Voice Sessions */}
        <div className="p-4 rounded-lg bg-card border border-border flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Voice Sessions</span>
            <div className="p-1.5 rounded-md bg-secondary text-emerald-400">
              <Mic className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {metrics.activeSessions}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Active real-time audio channels
            </div>
          </div>
        </div>

        {/* Metric 3: Message Queue */}
        <div className="p-4 rounded-lg bg-card border border-border flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Queue Backlog</span>
            <div className="p-1.5 rounded-md bg-secondary text-amber-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {metrics.messageQueueDepth}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Pending async messages & jobs
            </div>
          </div>
        </div>

        {/* Metric 4: Health */}
        <div className="p-4 rounded-lg bg-card border border-border flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-semibold uppercase tracking-wider">System State</span>
            <div className="p-1.5 rounded-md bg-secondary text-emerald-400">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-base font-semibold text-emerald-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              All Systems Operational
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Discord Gateway + Voice Workers
            </div>
          </div>
        </div>
      </div>

      {/* DUAL SECTION: FLEET SNAPSHOT & RECENT AUDIT TRAIL */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Registered Bot Fleet Status */}
        <div className="lg:col-span-2 bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-border/80">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Registered Bot Fleet</h2>
              <p className="text-[11px] text-muted-foreground">Discord bot applications assigned to this workspace.</p>
            </div>
            <button
              onClick={() => router.push('/bots')}
              className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
            >
              <span>View all bots</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-border/60">
            {bots.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                No Discord bots registered yet. Click &quot;Add Bot&quot; above to import your tokens.
              </div>
            ) : (
              bots.slice(0, 5).map((bot) => (
                <div key={bot.id} className="py-2.5 flex items-center justify-between">
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-foreground font-bold text-xs border border-border shrink-0">
                      <Bot className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-foreground truncate">{bot.displayName}</div>
                      <div className="text-[11px] text-muted-foreground font-mono truncate">
                        ID: {bot.applicationId} • {bot.operationalRole || 'Voice Operator'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
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
                      className="text-xs bg-secondary hover:bg-secondary/80 border border-border px-2 py-1 rounded transition"
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
        <div className="bg-card border border-border rounded-lg p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-border/80">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Recent Audit Events</h2>
                <p className="text-[11px] text-muted-foreground">Immutable operations trail.</p>
              </div>
              <button
                onClick={() => router.push('/audit')}
                className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
              >
                <span>Full log</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-2">
              {recentAudits.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  No recorded operations yet.
                </div>
              ) : (
                recentAudits.map((event) => (
                  <div key={event.id} className="p-2 rounded bg-secondary/40 border border-border/60 text-xs">
                    <div className="flex items-center justify-between font-medium">
                      <span className="text-foreground truncate">{event.action}</span>
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
                      <span>{event.actorName || 'System'}</span>
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
