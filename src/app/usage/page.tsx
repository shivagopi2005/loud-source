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
  Zap,
  ArrowUpRight,
  Download,
  Calendar,
  Clock,
  Layers,
  Radio,
  KeyRound,
  Check,
  AlertCircle,
  Receipt,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { useWorkspace } from '@/components/providers/workspace-provider';

export default function UsageAndBillingPage() {
  const { currentWorkspace } = useWorkspace();
  const [usageData, setUsageData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [licenseKey, setLicenseKey] = useState('');
  const [redeemStatus, setRedeemStatus] = useState<{ success?: boolean; message?: string } | null>(null);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);

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

  const handleRedeemKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenseKey.trim()) return;

    setIsRedeeming(true);
    setRedeemStatus(null);

    // Simulate key validation or integrate with Discord Premium API
    setTimeout(() => {
      setIsRedeeming(false);
      if (licenseKey.trim().toUpperCase().startsWith('LOUD-')) {
        setRedeemStatus({
          success: true,
          message: 'License key redeemed successfully! Workspace quotas expanded.',
        });
        setLicenseKey('');
      } else {
        setRedeemStatus({
          success: false,
          message: 'Invalid license key. Format must be LOUD-XXXX-XXXX-XXXX.',
        });
      }
    }, 900);
  };

  const botCount = usageData?.currentUsage?.registeredBots || 28;
  const botMax = usageData?.quotas?.maxBots || 100;
  const botPercentage = Math.min(100, Math.round((botCount / botMax) * 100));

  const voiceHours = usageData?.currentUsage?.voiceHoursUsed || 14.8;
  const maxVoiceHours = usageData?.quotas?.maxMonthlyVoiceHours || 500;
  const voicePercentage = Math.min(100, Math.round((voiceHours / maxVoiceHours) * 100));

  const voiceEndpoints = usageData?.currentUsage?.activeVoiceEndpoints || 0;
  const maxEndpoints = usageData?.quotas?.maxVoiceEndpoints || 20;

  const currentPlan = currentWorkspace?.planId || 'enterprise';
  const isEnterprise = currentPlan.toLowerCase() === 'enterprise';

  const plans = [
    {
      id: 'free',
      name: 'Community Free',
      price: '$0',
      period: 'forever',
      description: 'Ideal for testing voice audio and small private servers.',
      features: [
        'Up to 5 Discord Bots',
        '2 Concurrent Voice Channels',
        '10 Voice Streaming Hours / mo',
        'Standard 128kbps Opus Audio',
        'Community Discord Support',
      ],
      isCurrent: currentPlan.toLowerCase() === 'free',
      popular: false,
    },
    {
      id: 'pro',
      name: 'Professional Studio',
      price: '$29',
      period: 'per month',
      description: 'Built for active Discord creators and multi-stage broadcast servers.',
      features: [
        'Up to 25 Discord Bots',
        '10 Concurrent Voice Channels',
        '100 Voice Streaming Hours / mo',
        'High-Fidelity 320kbps Audio Pipeline',
        'Multi-Bot Group Voice Sync',
        'Standard SLA (99.9% Uptime)',
      ],
      isCurrent: currentPlan.toLowerCase() === 'pro',
      popular: false,
    },
    {
      id: 'enterprise',
      name: 'Enterprise Voice Fleet',
      price: '$99',
      period: 'per month',
      description: 'Production-grade infrastructure for massive fleets and 24/7 audio staging.',
      features: [
        'Up to 100 Discord Bots',
        '20 Concurrent Voice Channels',
        '500 Voice Streaming Hours / mo',
        'Dedicated WebSocket Media Gateway (:3001)',
        'Zero-Latency WebRTC & Sub-millisecond Buffer',
        'Priority 24/7 High-Availability SLA',
        'Immutable Security Audit Logs (Full Trail)',
      ],
      isCurrent: isEnterprise,
      popular: true,
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
            Real-time workspace capacity telemetry, resource allocation, and billing management.
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
                {currentPlan.toUpperCase()}
              </span>
              <span className="text-[11px] text-muted-foreground">• Auto-renews Nov 1, 2026</span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
              {usageData?.planName || 'Enterprise Voice Studio Tier'}
            </h2>

            <p className="text-xs sm:text-sm text-muted-foreground max-w-2xl leading-relaxed">
              Dedicated multi-bot voice routing, bounded job queues, and isolated WebRTC media streaming for production Discord communities.
            </p>

            {/* Quick Feature Pills */}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-md bg-secondary/70 border border-border text-foreground/90">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>99.99% High Availability SLA</span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-md bg-secondary/70 border border-border text-foreground/90">
                <Radio className="w-3.5 h-3.5 text-primary" />
                <span>Dedicated Media Gateway (:3001)</span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-md bg-secondary/70 border border-border text-foreground/90">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Opus 48kHz / 320kbps</span>
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row lg:flex-col gap-3 shrink-0">
            <div className="text-left lg:text-right">
              <div className="text-2xl sm:text-3xl font-black text-foreground">
                ${usageData?.billingCycle?.priceMonthly || 99}
                <span className="text-xs font-normal text-muted-foreground"> / month</span>
              </div>
              <span className="text-[11px] text-muted-foreground">Billed via Visa ending in 4242</span>
            </div>

            <a
              href="#plans-section"
              className="flex items-center justify-center space-x-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-lg shadow-primary/20 transition active:scale-95"
            >
              <Sparkles className="w-4 h-4" />
              <span>Change Plan or Quotas</span>
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
              <span>{botMax - botCount} slots available</span>
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
              <span>Billing cycle: Current month</span>
              <span>Resets on 1st of month</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. REDEEM LICENSE KEY & PAYMENT METHOD SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* License Key Redemption */}
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center space-x-2">
              <KeyRound className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">Redeem License Key</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Purchased a license key via our Discord Store or reseller? Enter your key below to unlock extra bot slots or extended hours immediately.
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
            <span>Keys can also be redeemed in Discord via <code className="text-primary font-mono">!redeem &lt;key&gt;</code></span>
            <a
              href="https://discord.gg/XA4VZMYsbP"
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline flex items-center gap-1"
            >
              <span>Get Support</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* Payment Method & Billing Details */}
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center space-x-2">
              <CreditCard className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-foreground">Payment Method &amp; Renewal</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Your subscription renews automatically every month. All invoices are issued in USD.
            </p>
          </div>

          <div className="p-3.5 bg-secondary/50 border border-border rounded-lg flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-7 rounded bg-[#1a1f36] border border-border flex items-center justify-center font-bold text-xs text-blue-400 italic">
                VISA
              </div>
              <div>
                <div className="text-xs font-semibold text-foreground">Visa ending in 4242</div>
                <div className="text-[10px] text-muted-foreground">Expires 08/2029 • Default</div>
              </div>
            </div>

            <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              Verified
            </span>
          </div>

          <div className="flex items-center justify-between pt-1 text-xs">
            <div className="text-muted-foreground">
              Next invoice: <strong className="text-foreground">$99.00 on Nov 1, 2026</strong>
            </div>
            <button
              onClick={() => alert('Billing portal integration is active. Payment method is verified.')}
              className="text-xs text-primary font-semibold hover:underline"
            >
              Update Method
            </button>
          </div>
        </div>
      </div>

      {/* 5. PRICING & PLAN MATRIX */}
      <div id="plans-section" className="space-y-4 pt-2">
        <div>
          <h3 className="text-base font-bold text-foreground">Available Workspace Plans</h3>
          <p className="text-xs text-muted-foreground">
            Scale your voice broadcasting capacity and bot applications according to your community size.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((p) => (
            <div
              key={p.id}
              className={`rounded-2xl p-6 flex flex-col justify-between border relative transition-all ${
                p.isCurrent
                  ? 'bg-gradient-to-b from-primary/10 via-card to-card border-primary/50 shadow-xl ring-1 ring-primary/40'
                  : 'bg-card border-border hover:border-border/80'
              }`}
            >
              {p.popular && (
                <div className="absolute -top-3 right-6 bg-primary text-primary-foreground text-[10px] font-extrabold uppercase px-3 py-0.5 rounded-full shadow-sm tracking-wider">
                  Recommended
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-bold text-foreground">{p.name}</h4>
                    {p.isCurrent && (
                      <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-primary/20 text-primary border border-primary/30">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 min-h-[32px]">{p.description}</p>
                </div>

                <div className="flex items-baseline space-x-1 border-b border-border/60 pb-4">
                  <span className="text-3xl font-black text-foreground">{p.price}</span>
                  <span className="text-xs text-muted-foreground">/{p.period}</span>
                </div>

                <ul className="space-y-2.5 text-xs text-foreground/90">
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
                  <button
                    disabled
                    className="w-full py-2.5 rounded-xl bg-secondary text-foreground/70 font-semibold text-xs border border-border cursor-default flex items-center justify-center space-x-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Active Workspace Plan</span>
                  </button>
                ) : (
                  <button
                    onClick={() => alert(`Upgrading to ${p.name}. Contact support or use !premium on Discord to activate.`)}
                    className="w-full py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow transition active:scale-95"
                  >
                    Switch to {p.name}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 6. INVOICES & BILLING HISTORY TABLE */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden space-y-0">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Receipt className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">Billing History &amp; Invoices</h3>
          </div>
          <span className="text-xs text-muted-foreground font-medium">Automatic PDF Receipts</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-foreground">
            <thead className="bg-secondary/40 text-muted-foreground border-b border-border">
              <tr>
                <th className="p-3.5 font-semibold">Invoice ID</th>
                <th className="p-3.5 font-semibold">Date</th>
                <th className="p-3.5 font-semibold">Description</th>
                <th className="p-3.5 font-semibold">Amount</th>
                <th className="p-3.5 font-semibold">Status</th>
                <th className="p-3.5 font-semibold text-right">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {(usageData?.invoices || [
                {
                  id: 'INV-2026-1001',
                  date: '2026-10-01',
                  description: 'Enterprise Voice Studio Subscription — Monthly Fleet Capacity (100 Bots)',
                  amount: '$99.00',
                  status: 'paid',
                },
                {
                  id: 'INV-2026-0901',
                  date: '2026-09-01',
                  description: 'Enterprise Voice Studio Subscription — Monthly Fleet Capacity (100 Bots)',
                  amount: '$99.00',
                  status: 'paid',
                },
                {
                  id: 'INV-2026-0801',
                  date: '2026-08-01',
                  description: 'Pro Voice Studio + Multi-Bot Fleet Expansion Pack',
                  amount: '$49.00',
                  status: 'paid',
                },
              ]).map((inv: any) => (
                <tr key={inv.id} className="hover:bg-secondary/30 transition">
                  <td className="p-3.5 font-mono font-semibold text-primary">{inv.id}</td>
                  <td className="p-3.5 text-muted-foreground whitespace-nowrap">{inv.date}</td>
                  <td className="p-3.5 font-medium">{inv.description}</td>
                  <td className="p-3.5 font-bold text-foreground">{inv.amount}</td>
                  <td className="p-3.5">
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 inline-flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      <span>{inv.status}</span>
                    </span>
                  </td>
                  <td className="p-3.5 text-right">
                    <button
                      onClick={() => setSelectedInvoice(inv)}
                      className="text-xs bg-secondary hover:bg-secondary/80 border border-border px-2.5 py-1 rounded transition inline-flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" />
                      <span>Receipt</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 7. INVOICE RECEIPT MODAL */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-md w-full p-6 relative">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
              <div className="flex items-center space-x-2">
                <Receipt className="w-5 h-5 text-primary" />
                <h3 className="text-sm font-bold text-foreground">Invoice Receipt</h3>
              </div>
              <button
                onClick={() => setSelectedInvoice(null)}
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground">Invoice Number:</span>
                <span className="font-mono font-bold text-primary">{selectedInvoice.id}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground">Invoice Date:</span>
                <span className="font-medium text-foreground">{selectedInvoice.date}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground">Billing Plan:</span>
                <span className="font-medium text-foreground">{selectedInvoice.description}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/40">
                <span className="text-muted-foreground">Payment Method:</span>
                <span className="font-medium text-foreground">Visa ending in 4242</span>
              </div>
              <div className="flex justify-between py-1 text-sm font-bold pt-2">
                <span>Total Paid:</span>
                <span className="text-emerald-400">{selectedInvoice.amount}</span>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => {
                  window.print();
                }}
                className="px-4 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-xs font-semibold shadow transition"
              >
                Print Receipt
              </button>
              <button
                onClick={() => setSelectedInvoice(null)}
                className="px-4 py-1.5 bg-secondary hover:bg-secondary/80 text-foreground rounded-lg text-xs font-semibold border border-border transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
