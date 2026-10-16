'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  CreditCard,
  Bot,
  Mic,
  MessageSquare,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  Zap,
  Download,
  Calendar,
  Clock,
  Layers,
  Radio,
  KeyRound,
  Check,
  AlertCircle,
  Receipt,
  ExternalLink,
  Crown,
  Volume2,
} from 'lucide-react';
import { useWorkspace } from '@/components/providers/workspace-provider';

export default function UsageAndBillingPage() {
  const { currentWorkspace } = useWorkspace();
  const [usageData, setUsageData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [licenseKey, setLicenseKey] = useState('');
  const [redeemStatus, setRedeemStatus] = useState<{ success?: boolean; message?: string } | null>(null);
  const [isRedeeming, setIsRedeeming] = useState(false);

  const loadUsage = useCallback(async () => {
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
  }, [currentWorkspace]);

  useEffect(() => {
    loadUsage();
  }, [loadUsage]);

  const handleRedeemKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = licenseKey.trim().toUpperCase();
    if (!trimmed) return;

    setIsRedeeming(true);
    setRedeemStatus(null);

    try {
      const res = await fetch('/api/usage/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: trimmed,
          workspaceId: currentWorkspace?.id,
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setRedeemStatus({
          success: true,
          message: json.data?.message || 'License key redeemed successfully!',
        });
        setLicenseKey('');
        await loadUsage();
      } else {
        setRedeemStatus({
          success: false,
          message: json.error?.message || json.message || 'Invalid or already redeemed license key code.',
        });
      }
    } catch (err: any) {
      setRedeemStatus({
        success: false,
        message: err.message || 'Failed to communicate with redemption server.',
      });
    } finally {
      setIsRedeeming(false);
    }
  };

  const userTier = usageData?.userTier;
  const isDeveloper = userTier?.isDeveloper || userTier?.tier === 'developer';

  // Effective plan determined by API telemetry, userTier, or workspace context
  const rawPlan = (usageData?.plan || userTier?.tier || currentWorkspace?.planId || 'trial').toLowerCase();
  const currentPlan = isDeveloper ? 'developer' : rawPlan;

  const isEnterprise = currentPlan === 'enterprise' || isDeveloper;
  const isPro = (currentPlan === 'pro' || currentPlan === 'premium') && !isDeveloper;
  const isCommunity = currentPlan === 'community' && !isDeveloper;
  const isTrial = (currentPlan === 'trial' || currentPlan === 'free') && !isDeveloper && !isPro && !isEnterprise && !isCommunity;

  const botCount = usageData?.currentUsage?.registeredBots || 0;
  const botMax = usageData?.quotas?.maxBots || (isDeveloper || isEnterprise ? 100 : isPro ? 25 : 5);
  const botPercentage = Math.min(100, Math.round((botCount / (botMax || 1)) * 100));

  const voiceHours = usageData?.currentUsage?.voiceHoursUsed || 0;
  const maxVoiceHours = usageData?.quotas?.maxMonthlyVoiceHours || (isDeveloper || isEnterprise ? 500 : isPro ? 100 : isCommunity ? 30 : 10);
  const voicePercentage = Math.min(100, Math.round((voiceHours / (maxVoiceHours || 1)) * 100));

  const maxEndpoints = usageData?.quotas?.maxVoiceEndpoints || (isDeveloper ? 50 : isEnterprise ? 20 : isPro ? 10 : isCommunity ? 3 : 2);

  const plans = [
    {
      id: 'trial',
      name: 'Community Trial',
      price: '₹0',
      description: 'Free trial for members who log into the website. Includes 10 fleet command uses.',
      features: [
        '5 Developer Fleet Bots',
        '10 Total Fleet Command Uses',
        'Max .5 Spam & .5 DM',
        'Standard 128kbps Opus Audio',
        'Website Login Activation',
      ],
      isCurrent: isTrial,
      popular: false,
    },
    {
      id: 'community',
      name: 'Community Plan',
      price: '₹29',
      description: 'Full permanent access for small servers and active communities.',
      features: [
        'Up to 5 Discord Fleet Bots',
        'Unlimited Fleet Command Uses',
        'Max .5 Spam & .5 DM',
        'Standard 128kbps Opus Audio',
        'Community Discord Support',
      ],
      isCurrent: isCommunity,
      popular: isCommunity,
    },
    {
      id: 'pro',
      name: 'Professional Studio',
      price: '₹99',
      description: 'Built for active Discord creators and multi-stage broadcast communities.',
      features: [
        'Up to 25 Discord Fleet Bots',
        '10,000% Volume Overdrive',
        'Max .50 Spam & .50 DM',
        'High-Fidelity 320kbps Audio Pipeline',
        '24/7 Voice Channel Stay',
        'Multi-Bot Group Voice Sync',
      ],
      isCurrent: isPro,
      popular: isPro,
    },
    {
      id: 'enterprise',
      name: 'Enterprise Fleet',
      price: '₹299',
      description: 'Production-grade infrastructure for massive fleets and 24/7 audio staging.',
      features: [
        'Up to 100 Discord Fleet Bots',
        'Dedicated WebSocket Media Gateway (:3001)',
        'Max .999 Spam & .999 DM',
        'High-Fidelity 320kbps Audio Pipeline',
        '24/7 Priority Voice Stay',
        'Priority 24/7 High-Availability SLA',
      ],
      isCurrent: isEnterprise,
      popular: isEnterprise,
    },
  ];

  return (
    <div className="space-y-8">
      {/* 1. HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <CreditCard className="w-6 h-6 text-primary" />
            <span>Usage Quotas &amp; Subscription</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Real-time workspace capacity telemetry, license key redemption, and verified resource allocation.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Active Subscription</span>
          </span>
        </div>
      </div>

      {/* 2. MAIN PLAN OVERVIEW BANNER */}
      <div className="relative overflow-hidden bg-gradient-to-r from-[#1e1738] via-[#161324] to-[#12101c] border border-primary/30 rounded-2xl p-6 sm:p-7 shadow-xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                Current Workspace Plan
              </span>
              <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30 uppercase tracking-wide">
                {isDeveloper ? 'DEVELOPER' : isEnterprise ? 'ENTERPRISE' : isPro ? 'PRO STUDIO' : isCommunity ? 'COMMUNITY' : 'TRIAL'}
              </span>
              <span className="text-[11px] text-muted-foreground">
                • {isDeveloper ? 'Developer Tier (Lifetime)' : isEnterprise ? 'Enterprise Fleet Activated (₹299)' : isPro ? 'Professional Studio Activated (₹99)' : isCommunity ? 'Community Plan Activated (₹29)' : 'Community Trial (₹0)'}
              </span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
              {usageData?.planName || (isDeveloper ? 'Developer Supreme Fleet' : isEnterprise ? 'Enterprise Voice Fleet' : isPro ? 'Professional Studio' : isCommunity ? 'Community Plan' : 'Community Trial')}
            </h2>

            <p className="text-xs sm:text-sm text-muted-foreground max-w-2xl leading-relaxed">
              {isDeveloper
                ? 'Unrestricted supreme access across all 27+ bots and all workspaces with zero limitations.'
                : isEnterprise
                ? 'Dedicated multi-bot voice routing, dedicated WebSocket media gateway (:3001), and priority 24/7 stay.'
                : isPro
                ? 'High-fidelity 320kbps audio pipeline, 10,000% volume overdrive, 24/7 voice stay, and up to 25 bots.'
                : isCommunity
                ? 'Standard 128kbps audio pipeline, 5 fleet bots, and unlimited command invocations.'
                : '10 total fleet command uses with up to 5 developer fleet worker bots.'}
            </p>

            {/* Quick Feature Pills */}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-md bg-secondary/70 border border-border text-foreground/90">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>{isEnterprise || isDeveloper ? '99.99% High Availability SLA' : isPro ? 'Priority Support SLA' : 'Standard SLA'}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-md bg-secondary/70 border border-border text-foreground/90">
                <Radio className="w-3.5 h-3.5 text-primary" />
                <span>{isEnterprise || isDeveloper ? 'Dedicated Media Gateway (:3001)' : isPro ? '320kbps Studio Pipeline' : 'Shared Gateway'}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-md bg-secondary/70 border border-border text-foreground/90">
                <Volume2 className="w-3.5 h-3.5 text-purple-400" />
                <span>{isPro || isEnterprise || isDeveloper ? '10,000% Volume Overdrive' : '200% Volume Limit'}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-md bg-secondary/70 border border-border text-foreground/90">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>{isPro || isEnterprise || isDeveloper ? 'Opus 48kHz / 320kbps' : 'Opus 48kHz / 128kbps'}</span>
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row lg:flex-col gap-3 shrink-0">
            <div className="text-left lg:text-right">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Activation Method
              </div>
              <div className="text-sm font-bold text-foreground">
                Discord License Key
              </div>
              <span className="text-[11px] text-emerald-400 font-medium">Verified Active</span>
            </div>

            <a
              href="#redeem-section"
              className="flex items-center justify-center space-x-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-lg shadow-primary/20 transition active:scale-95"
            >
              <KeyRound className="w-4 h-4" />
              <span>Redeem License Key</span>
            </a>
          </div>
        </div>
      </div>

      {/* 3. CORE RESOURCE QUOTA GAUGES */}
      <div>
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
          <Layers className="w-4 h-4" />
          <span>Real-Time Resource Telemetry</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Bot Applications */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Bot Applications</span>
              <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <Bot className="w-4 h-4" />
              </div>
            </div>

            <div className="flex items-baseline justify-between">
              <div className="text-2xl sm:text-3xl font-extrabold text-foreground">
                {botCount} <span className="text-sm font-semibold text-muted-foreground">/ {botMax}</span>
              </div>
              <span className="text-xs font-bold text-primary">{botPercentage}%</span>
            </div>

            <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${botPercentage}%` }}
              />
            </div>

            <div className="text-[11px] text-muted-foreground flex justify-between pt-1">
              <span>{Math.max(0, botMax - botCount)} slots available</span>
              <span>Capacity: {botMax} bots</span>
            </div>
          </div>

          {/* Concurrent Voice Channels */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Concurrent Voice Channels</span>
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <Mic className="w-4 h-4" />
              </div>
            </div>

            <div className="flex items-baseline justify-between">
              <div className="text-2xl sm:text-3xl font-extrabold text-foreground">
                Up to {maxEndpoints} <span className="text-xs font-semibold text-muted-foreground">parallel</span>
              </div>
              <span className="text-xs font-semibold text-emerald-400">Ready</span>
            </div>

            <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-emerald-400 rounded-full" style={{ width: '40%' }} />
            </div>

            <div className="text-[11px] text-muted-foreground flex justify-between pt-1">
              <span>Zero-latency WebRTC streams</span>
              <span>Independent volume &amp; mute</span>
            </div>
          </div>

          {/* Monthly Streaming Cap */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Monthly Streaming Cap</span>
              <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
                <Clock className="w-4 h-4" />
              </div>
            </div>

            <div className="flex items-baseline justify-between">
              <div className="text-2xl sm:text-3xl font-extrabold text-foreground">
                {voiceHours} <span className="text-sm font-semibold text-muted-foreground">/ {maxVoiceHours} Hours</span>
              </div>
              <span className="text-xs font-bold text-amber-400">{voicePercentage}%</span>
            </div>

            <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-400 rounded-full transition-all duration-500"
                style={{ width: `${Math.max(5, voicePercentage)}%` }}
              />
            </div>

            <div className="text-[11px] text-muted-foreground flex justify-between pt-1">
              <span>Real-time voice telemetry</span>
              <span>Reset schedule: Monthly</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. REDEEM LICENSE KEY & REAL ACCOUNT TIER SECTION */}
      <div id="redeem-section" className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Real License Key Redemption Form */}
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center space-x-2">
              <KeyRound className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">Redeem License Key</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Have a license key generated by the developer? Enter your unique key below to immediately activate your account tier and expand fleet quotas.
            </p>
          </div>

          <form onSubmit={handleRedeemKey} className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value)}
                placeholder="LOUD-XXXX-XXXX-XXXX"
                className="flex-1 bg-secondary/70 border border-border rounded-lg px-3 py-2 text-xs font-mono uppercase text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition"
              />
              <button
                type="submit"
                disabled={isRedeeming || !licenseKey.trim()}
                className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold rounded-lg shadow-sm transition active:scale-95 disabled:opacity-50"
              >
                {isRedeeming ? 'Redeeming...' : 'Redeem Key'}
              </button>
            </div>

            {redeemStatus && (
              <div
                className={`p-2.5 rounded-lg text-xs flex items-center space-x-2 border ${
                  redeemStatus.success
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-destructive/10 text-destructive border-destructive/20'
                }`}
              >
                {redeemStatus.success ? (
                  <Check className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>{redeemStatus.message}</span>
              </div>
            )}
          </form>

          <div className="text-[11px] text-muted-foreground border-t border-border/50 pt-2 flex items-center justify-between">
            <span>Keys can also be redeemed in Discord via <code className="text-primary font-mono">!premium redeem &lt;key&gt;</code></span>
            <a
              href="https://discord.gg/XA4VZMYsbP"
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline flex items-center gap-1"
            >
              <span>Support Server</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* Real User Account Tier & Discord Activation Details */}
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center space-x-2">
              {isDeveloper ? (
                <Crown className="w-4 h-4 text-amber-400" />
              ) : (
                <Sparkles className="w-4 h-4 text-primary" />
              )}
              <h3 className="text-sm font-bold text-foreground">User Account Tier</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Account privileges are verified directly from the database and bound to your Discord identity.
            </p>
          </div>

          <div className="p-4 bg-secondary/50 border border-border rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Account Status</span>
              <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {userTier?.tier?.toUpperCase() || 'FREE'} TIER
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Max Fleet Bots</span>
              <strong className="text-foreground">{userTier?.maxBots || 5} Bots</strong>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Audio Overdrive Volume</span>
              <strong className="text-foreground">{userTier?.maxVolume || 200}%</strong>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Max Blast Count</span>
              <strong className="text-foreground">
                {userTier?.maxSpamCount === 'infinite' || isDeveloper
                  ? 'infinite Messages'
                  : `${userTier?.maxSpamCount || 5} Messages`}
              </strong>
            </div>

            <div className="flex items-center justify-between text-xs pt-1 border-t border-border/40">
              <span className="text-muted-foreground">Tier Expiration</span>
              <strong className="text-primary">
                {isDeveloper
                  ? 'Lifetime Access (Developer)'
                  : userTier?.expiresAt
                  ? new Date(userTier.expiresAt).toLocaleDateString()
                  : userTier?.tier && userTier.tier !== 'trial'
                  ? 'Lifetime Access'
                  : 'Active Community Trial'}
              </strong>
            </div>
          </div>

          <div className="text-[11px] text-muted-foreground flex items-center justify-between">
            <span>No credit card required. Upgrades are managed via Discord.</span>
          </div>
        </div>
      </div>

      {/* 5. PRICING & PLAN COMPARISON MATRIX */}
      <div className="space-y-4 pt-2">
        <div>
          <h3 className="text-base font-bold text-foreground">Workspace Plan Features</h3>
          <p className="text-xs text-muted-foreground">
            Capacity breakdown across available multi-bot voice studio tiers.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {plans.map((p) => (
            <div
              key={p.id}
              className={`rounded-2xl p-5 flex flex-col justify-between border relative transition-all ${
                p.isCurrent
                  ? 'bg-gradient-to-b from-primary/10 via-card to-card border-primary/50 shadow-xl ring-1 ring-primary/40'
                  : 'bg-card border-border hover:border-border/80'
              }`}
            >
              {p.popular && (
                <div className="absolute -top-3 right-5 bg-primary text-primary-foreground text-[10px] font-extrabold uppercase px-3 py-0.5 rounded-full shadow-sm tracking-wider">
                  Active Workspace Tier
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-foreground">{p.name}</h4>
                    {p.isCurrent && (
                      <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-primary/20 text-primary border border-primary/30">
                        Current
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-xl font-extrabold text-foreground">{p.price}</span>
                    {p.price !== '₹0' && (
                      <span className="text-[11px] text-muted-foreground font-medium">/ mo</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5 min-h-[32px]">{p.description}</p>
                </div>

                <ul className="space-y-2.5 text-xs text-foreground/90 border-t border-border/60 pt-4">
                  {p.features.map((feat, idx) => (
                    <li key={idx} className="flex items-start space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-6">
                {p.isCurrent ? (
                  <div className="w-full py-2.5 rounded-xl bg-secondary text-foreground/80 font-semibold text-xs border border-border flex items-center justify-center space-x-1.5 cursor-default">
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Active Workspace Tier</span>
                  </div>
                ) : (
                  <a
                    href="#redeem-section"
                    className="w-full py-2.5 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-xs border border-border transition flex items-center justify-center space-x-1.5"
                  >
                    <span>Upgrade via License Key</span>
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 6. REAL LICENSE KEY ACTIVATION HISTORY TABLE */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden space-y-0">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Receipt className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">License Key Activation History</h3>
          </div>
          <span className="text-xs text-muted-foreground font-medium">Real-Time Database Records</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-foreground">
            <thead className="bg-secondary/40 text-muted-foreground border-b border-border">
              <tr>
                <th className="p-3.5 font-semibold">License Code</th>
                <th className="p-3.5 font-semibold">Tier</th>
                <th className="p-3.5 font-semibold">Duration</th>
                <th className="p-3.5 font-semibold">Redemption Date</th>
                <th className="p-3.5 font-semibold text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {usageData?.redemptions && usageData.redemptions.length > 0 ? (
                usageData.redemptions.map((redemption: any) => (
                  <tr key={redemption.id} className="hover:bg-secondary/30 transition">
                    <td className="p-3.5 font-mono font-semibold text-primary">{redemption.code}</td>
                    <td className="p-3.5 font-medium uppercase">{redemption.tier}</td>
                    <td className="p-3.5 text-muted-foreground">{redemption.duration}</td>
                    <td className="p-3.5 text-muted-foreground">{redemption.redeemedAt}</td>
                    <td className="p-3.5 text-right">
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 inline-flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        <span>Active</span>
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center space-y-1">
                      <KeyRound className="w-7 h-7 text-muted-foreground/40 mb-1" />
                      <p className="font-semibold text-foreground">No license keys redeemed yet</p>
                      <p className="text-xs text-muted-foreground">
                        When you receive a key generated by the developer, enter it above or in Discord via <code className="text-primary font-mono">!premium redeem</code>.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
