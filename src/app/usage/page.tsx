'use client';

import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Bot,
  Mic,
  MessageSquare,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { useWorkspace } from '@/components/providers/workspace-provider';

export default function UsageAndBillingPage() {
  const { currentWorkspace } = useWorkspace();
  const [usageData, setUsageData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadUsage() {
      if (!currentWorkspace) return;
      try {
        setIsLoading(true);
        const res = await fetch(`/api/usage?workspaceId=${currentWorkspace.id}`);
        if (res.ok) {
          const json = await res.json();
          if (json.data) setUsageData(json.data);
        }
      } catch (err) {
        console.error('Failed to load usage:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadUsage();
  }, [currentWorkspace]);

  const botPercentage = usageData
    ? Math.min(100, Math.round((usageData.currentUsage.registeredBots / usageData.quotas.maxBots) * 100))
    : 0;

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-primary" />
            <span>Usage Quotas &amp; Subscription</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Enforced workspace capacity limits and voice streaming resource allocation.
          </p>
        </div>
      </div>

      {/* PLAN CARD */}
      <div className="bg-gradient-to-r from-primary/10 via-card to-card border border-primary/30 rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">Current Workspace Plan</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30 uppercase">
              {currentWorkspace?.planId || 'PRO'}
            </span>
          </div>
          <h2 className="text-xl font-extrabold text-foreground mt-1">Professional Voice Studio Tier</h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-md">
            Dedicated multi-bot voice routing, bounded job queues, and WebRTC media streaming for production Discord communities.
          </p>
        </div>

        <button className="flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-md transition">
          <Sparkles className="w-4 h-4" />
          <span>Manage Plan &amp; Quotas</span>
        </button>
      </div>

      {/* QUOTAS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Bot Quota */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Bot Applications</span>
            <Bot className="w-4 h-4 text-primary" />
          </div>

          <div className="text-2xl font-extrabold text-foreground">
            {usageData?.currentUsage.registeredBots || 0} / {usageData?.quotas.maxBots || 25}
          </div>

          <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${botPercentage}%` }}></div>
          </div>
          <div className="text-[11px] text-muted-foreground flex justify-between">
            <span>{botPercentage}% utilized</span>
            <span>Capacity: {usageData?.quotas.maxBots || 25} bots</span>
          </div>
        </div>

        {/* Voice Endpoints Quota */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Concurrent Voice Channels</span>
            <Mic className="w-4 h-4 text-emerald-400" />
          </div>

          <div className="text-2xl font-extrabold text-foreground">
            Up to {usageData?.quotas.maxVoiceEndpoints || 10}
          </div>

          <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-emerald-400 rounded-full" style={{ width: '40%' }}></div>
          </div>
          <div className="text-[11px] text-muted-foreground flex justify-between">
            <span>Parallel streams</span>
            <span>Independent volume &amp; mute</span>
          </div>
        </div>

        {/* Voice Seconds / Hours */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Monthly Streaming Cap</span>
            <CreditCard className="w-4 h-4 text-amber-400" />
          </div>

          <div className="text-2xl font-extrabold text-foreground">
            {usageData?.quotas.maxMonthlyVoiceHours || 500} Hours
          </div>

          <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-amber-400 rounded-full" style={{ width: '15%' }}></div>
          </div>
          <div className="text-[11px] text-muted-foreground flex justify-between">
            <span>Billing cycle: Current month</span>
            <span>High availability SLA</span>
          </div>
        </div>
      </div>
    </div>
  );
}
