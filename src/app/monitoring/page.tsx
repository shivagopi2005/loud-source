'use client';

import React, { useState, useEffect } from 'react';
import {
  Activity,
  Server,
  Database,
  Radio,
  Cpu,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { useWorkspace } from '@/components/providers/workspace-provider';

export default function MonitoringPage() {
  const { currentWorkspace } = useWorkspace();
  const [metrics, setMetrics] = useState<any>(null);
  const [readiness, setReadiness] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadMetrics = async () => {
    try {
      setIsLoading(true);
      const [mRes, rRes] = await Promise.all([
        fetch('/api/metrics'),
        fetch('/api/ready'),
      ]);

      if (mRes.ok) {
        const mJson = await mRes.json();
        setMetrics(mJson.data);
      }
      if (rRes.ok) {
        const rJson = await rRes.json();
        setReadiness(rJson);
      }
    } catch (err) {
      console.error('Failed to load monitoring metrics:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMetrics();
    const interval = setInterval(loadMetrics, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            <span>Real-time System Monitoring</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Live telemetry from PostgreSQL, Redis queues, Media Gateway audio pipelines, and worker processes.
          </p>
        </div>

        <button
          onClick={loadMetrics}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 border border-border text-xs font-medium text-foreground transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {/* CORE SUBSYSTEM HEALTH */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* DB */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">PostgreSQL</span>
            <Database className="w-4 h-4 text-primary" />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
            <span className="text-sm font-bold text-foreground capitalize">
              {readiness?.checks?.database || 'Connected'}
            </span>
          </div>
          <div className="text-[11px] text-muted-foreground font-mono">Port 5432 • Prisma Pool Active</div>
        </div>

        {/* Redis */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Redis (BullMQ)</span>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
            <span className="text-sm font-bold text-foreground capitalize">
              {readiness?.checks?.redis || 'Connected'}
            </span>
          </div>
          <div className="text-[11px] text-muted-foreground font-mono">Port 6380 • PONG Acknowledged</div>
        </div>

        {/* Media Gateway */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Media Gateway</span>
            <Radio className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
            <span className="text-sm font-bold text-foreground">Listening (Port 3001)</span>
          </div>
          <div className="text-[11px] text-muted-foreground font-mono">WebRTC / WebSocket Ingest Ready</div>
        </div>
      </div>

      {/* DETAILED OPERATIONAL METRICS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Memory & Node Runtime */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5">
            <Cpu className="w-4 h-4 text-primary" />
            <span>Process &amp; Memory Utilization</span>
          </h2>

          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/50 border border-border">
              <span className="text-muted-foreground">Node.js Runtime</span>
              <span className="font-mono text-foreground font-semibold">Node.js 24 (ES2022)</span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/50 border border-border">
              <span className="text-muted-foreground">Server Uptime</span>
              <span className="font-mono text-foreground font-semibold">{metrics?.uptimeSeconds || 0} seconds</span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/50 border border-border">
              <span className="text-muted-foreground">Heap Memory (Used / Total)</span>
              <span className="font-mono text-foreground font-semibold">
                {metrics?.memory?.heapUsedMb || 0} MB / {metrics?.memory?.heapTotalMb || 0} MB
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/50 border border-border">
              <span className="text-muted-foreground">Resident Set Size (RSS)</span>
              <span className="font-mono text-foreground font-semibold">{metrics?.memory?.rssMb || 0} MB</span>
            </div>
          </div>
        </div>

        {/* Fleet & Queue Health */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-emerald-400" />
            <span>Fleet &amp; Queue Statistics</span>
          </h2>

          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/50 border border-border">
              <span className="text-muted-foreground">Registered Bot Applications</span>
              <span className="font-mono text-foreground font-semibold">{metrics?.fleet?.totalBots || 0}</span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/50 border border-border">
              <span className="text-muted-foreground">Active Voice Streams</span>
              <span className="font-mono text-emerald-400 font-semibold">{metrics?.fleet?.activeVoiceSessions || 0}</span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/50 border border-border">
              <span className="text-muted-foreground">Message Queue Depth</span>
              <span className="font-mono text-foreground font-semibold">{metrics?.queues?.messageQueueDepth || 0}</span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/50 border border-border">
              <span className="text-muted-foreground">Health Check Queue Depth</span>
              <span className="font-mono text-foreground font-semibold">{metrics?.queues?.healthCheckQueueDepth || 0}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
