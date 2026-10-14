'use client';

import React, { useState } from 'react';
import {
  Clock,
  Play,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Plus,
  ShieldCheck,
  Activity,
  Calendar,
} from 'lucide-react';
import { useWorkspace } from '@/components/providers/workspace-provider';

export default function AutomationPage() {
  const { currentWorkspace } = useWorkspace();

  const [jobs, setJobs] = useState([
    {
      id: 'job-1',
      name: 'Periodic Bot Gateway Health Check',
      schedule: 'Every 5 minutes',
      type: 'periodic_health_check',
      state: 'active',
      lastRun: '2 minutes ago',
      result: 'healthy',
    },
    {
      id: 'job-2',
      name: 'Orphaned Voice Session Cleanup',
      schedule: 'Every 15 minutes',
      type: 'session_cleanup',
      state: 'active',
      lastRun: '10 minutes ago',
      result: 'healthy',
    },
    {
      id: 'job-3',
      name: 'Monthly Voice Usage & Quota Audit',
      schedule: 'Daily at 00:00 UTC',
      type: 'quota_audit',
      state: 'active',
      lastRun: 'Yesterday at 00:00',
      result: 'healthy',
    },
  ]);

  const [isRunningManual, setIsRunningManual] = useState<string | null>(null);

  const handleRunNow = async (jobId: string) => {
    setIsRunningManual(jobId);
    if (!currentWorkspace) return;

    try {
      // Trigger bulk health check API for fleet
      const botsRes = await fetch(`/api/workspaces/${currentWorkspace.id}/bots`);
      if (botsRes.ok) {
        const b = await botsRes.json();
        const botIds = (b.data || []).map((bot: any) => bot.id);
        if (botIds.length > 0) {
          await fetch('/api/fleet/health-check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workspaceId: currentWorkspace.id, botIds }),
          });
        }
      }
    } catch (err) {
      console.error('Run manual job error:', err);
    } finally {
      setTimeout(() => {
        setIsRunningManual(null);
      }, 500);
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Clock className="w-6 h-6 text-primary" />
            <span>Automation Engine &amp; Background Jobs</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Controlled background tasks, periodic bot health monitors, and automatic session cleanup.
          </p>
        </div>
      </div>

      {/* AUTOMATION CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {jobs.map((job) => (
          <div key={job.id} className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4 flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between">
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {job.state}
                </span>
                <span className="text-[11px] text-muted-foreground font-mono">{job.schedule}</span>
              </div>

              <h3 className="text-sm font-bold text-foreground mt-3">{job.name}</h3>
              <div className="text-xs text-muted-foreground mt-1">
                Type: <code className="font-mono text-primary text-[11px]">{job.type}</code>
              </div>
            </div>

            <div className="pt-3 border-t border-border flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Last run: {job.lastRun}</span>
              <button
                onClick={() => handleRunNow(job.id)}
                disabled={isRunningManual === job.id}
                className="px-2.5 py-1 rounded-md bg-secondary hover:bg-secondary/80 border border-border font-medium flex items-center gap-1 transition disabled:opacity-50"
              >
                <Play className="w-3 h-3 fill-current" />
                <span>{isRunningManual === job.id ? 'Running...' : 'Run Now'}</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* SAFEGUARD NOTICE */}
      <div className="p-4 rounded-xl bg-secondary/30 border border-border text-xs text-muted-foreground space-y-1">
        <div className="font-semibold text-foreground flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>BullMQ Engine Safeguards</span>
        </div>
        <p>
          Jobs use idempotency keys for deduplication, bounded exponential backoff with jitter for retries, and are automatically cancelled if an emergency stop or worker disruption occurs.
        </p>
      </div>
    </div>
  );
}
