'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Bot,
  Plus,
  Search,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ExternalLink,
  Shield,
  Activity,
  RotateCw,
  Sliders,
  X,
  Layers,
  Sparkles,
  Check,
} from 'lucide-react';
import { useWorkspace } from '@/components/providers/workspace-provider';

function BotFleetContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentWorkspace } = useWorkspace();

  const [bots, setBots] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);

  // Registration Modal Mode: 'single' | 'bulk'
  const [registerMode, setRegisterMode] = useState<'single' | 'bulk'>('single');

  // Single Bot Form State
  const [formData, setFormData] = useState({
    botToken: '',
    applicationId: '',
    displayName: '',
    operationalRole: 'voice_operator',
    tags: 'voice, studio',
  });
  const [isResolvingToken, setIsResolvingToken] = useState(false);
  const [tokenResolvedBot, setTokenResolvedBot] = useState<{
    username: string;
    applicationId: string;
    avatarUrl: string | null;
  } | null>(null);

  // Bulk Bot Form State
  const [bulkTokensInput, setBulkTokensInput] = useState('');
  const [bulkRole, setBulkRole] = useState('voice_operator');
  const [bulkTags, setBulkTags] = useState('voice, fleet');
  const [bulkResult, setBulkResult] = useState<{
    totalSubmitted: number;
    successful: number;
    failed: number;
    addedBots: any[];
    errors: any[];
  } | null>(null);

  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (searchParams.get('action') === 'new') {
      setIsRegisterOpen(true);
    }
  }, [searchParams]);

  const loadBots = async () => {
    if (!currentWorkspace) return;
    try {
      setIsLoading(true);
      const res = await fetch(`/api/workspaces/${currentWorkspace.id}/bots`);
      if (res.ok) {
        const json = await res.json();
        if (json.data) setBots(json.data);
      }
    } catch (err) {
      console.error('Failed to load bots:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBots();
  }, [currentWorkspace]);

  // Client-side quick decode of Discord Application ID from Token
  const tryClientDecodeAppId = (token: string): string | null => {
    try {
      const segment = token.trim().split('.')[0];
      if (!segment) return null;
      const decoded = atob(segment);
      if (/^\d{17,20}$/.test(decoded)) {
        return decoded;
      }
    } catch {}
    return null;
  };

  // Auto-resolve bot info when token changes
  const handleTokenChange = async (token: string) => {
    const trimmed = token.trim();
    setFormData((prev) => {
      const decodedAppId = tryClientDecodeAppId(trimmed);
      return {
        ...prev,
        botToken: token,
        applicationId: decodedAppId || prev.applicationId,
      };
    });

    if (trimmed.length > 25) {
      setIsResolvingToken(true);
      try {
        const res = await fetch('/api/bots/resolve-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: trimmed }),
        });
        if (res.ok) {
          const json = await res.json();
          if (json.data) {
            setTokenResolvedBot({
              username: json.data.username,
              applicationId: json.data.applicationId,
              avatarUrl: json.data.avatarUrl,
            });
            setFormData((prev) => ({
              ...prev,
              applicationId: json.data.applicationId,
              displayName: prev.displayName || json.data.username,
            }));
          }
        }
      } catch (err) {
        console.warn('Could not auto-resolve bot token:', err);
      } finally {
        setIsResolvingToken(false);
      }
    } else {
      setTokenResolvedBot(null);
    }
  };

  // Submit Single Bot
  const handleRegisterSingleBot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWorkspace) return;
    setFormError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/workspaces/${currentWorkspace.id}/bots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: formData.botToken.trim(),
          applicationId: formData.applicationId.trim() || undefined,
          displayName: formData.displayName.trim() || undefined,
          operationalRole: formData.operationalRole,
          tags: formData.tags.split(',').map((t) => t.trim()).filter(Boolean),
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Bot registration failed');
      }

      setIsRegisterOpen(false);
      setFormData({
        botToken: '',
        applicationId: '',
        displayName: '',
        operationalRole: 'voice_operator',
        tags: 'voice, studio',
      });
      setTokenResolvedBot(null);
      await loadBots();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Bulk Bots
  const handleRegisterBulkBots = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWorkspace || !bulkTokensInput.trim()) return;
    setFormError(null);
    setBulkResult(null);
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/workspaces/${currentWorkspace.id}/bots/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokens: bulkTokensInput,
          operationalRole: bulkRole,
          tags: bulkTags.split(',').map((t) => t.trim()).filter(Boolean),
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || 'Bulk bot import failed');
      }

      setBulkResult(json.data);
      await loadBots();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleHealthCheck = async (botId: string) => {
    try {
      const res = await fetch(`/api/bots/${botId}/health-check`, { method: 'POST' });
      const json = await res.json();
      if (json.data) {
        await loadBots();
      }
    } catch (err) {
      console.error('Health check error:', err);
    }
  };

  const filteredBots = bots.filter((b) => {
    const matchesSearch =
      b.displayName.toLowerCase().includes(search.toLowerCase()) ||
      b.applicationId.includes(search);
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'ready' && (b.status === 'ready' || b.status === 'connected')) ||
      (statusFilter === 'degraded' && (b.status === 'degraded' || b.status === 'credential_invalid')) ||
      (statusFilter === 'disabled' && b.status === 'disabled');
    return matchesSearch && matchesStatus;
  });

  const parsedBulkTokenCount = bulkTokensInput
    .split(/[\r\n,]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 5).length;

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Bot Fleet Registry</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Independently verified official Discord bot applications, credentials, and guild permissions.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => {
              setRegisterMode('bulk');
              setIsRegisterOpen(true);
            }}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-xs border border-border shadow-sm transition"
          >
            <Layers className="w-4 h-4 text-primary" />
            <span>Bulk Add Tokens</span>
          </button>
          <button
            onClick={() => {
              setRegisterMode('single');
              setIsRegisterOpen(true);
            }}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-md transition"
          >
            <Plus className="w-4 h-4" />
            <span>Add Single Bot</span>
          </button>
        </div>
      </div>

      {/* FILTER & SEARCH BAR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-card p-3 rounded-xl border border-border">
        <div className="flex items-center bg-secondary/60 rounded-lg px-3 py-1.5 border border-border flex-1 max-w-md">
          <Search className="w-4 h-4 text-muted-foreground mr-2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by bot name or application ID..."
            className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
          />
        </div>

        <div className="flex items-center space-x-2">
          {['all', 'ready', 'degraded', 'disabled'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`text-xs px-3 py-1.5 rounded-lg capitalize font-medium transition ${
                statusFilter === st
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* BOT LIST CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredBots.length === 0 ? (
          <div className="col-span-full p-12 text-center bg-card border border-border rounded-xl">
            <Bot className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
            <h3 className="text-sm font-semibold text-foreground">No Discord bots found</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              {search
                ? 'Try modifying your search query or filter.'
                : 'Register your Discord bot tokens individually or using bulk import to enable live voice streaming.'}
            </p>
          </div>
        ) : (
          filteredBots.map((bot) => (
            <div
              key={bot.id}
              className="bg-card border border-border hover:border-primary/40 rounded-xl p-5 shadow-sm transition flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-xl bg-secondary border border-border flex items-center justify-center text-primary font-bold">
                      <Bot className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-foreground">{bot.displayName}</h3>
                      <div className="text-[11px] text-muted-foreground font-mono">
                        ID: {bot.applicationId}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                      bot.status === 'ready' || bot.status === 'connected'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : bot.status === 'disabled'
                        ? 'bg-secondary text-muted-foreground border-border'
                        : 'bg-destructive/10 text-destructive border-destructive/30'
                    }`}
                  >
                    {bot.status}
                  </span>
                </div>

                {/* Details list */}
                <div className="mt-4 space-y-2 text-xs text-muted-foreground">
                  <div className="flex items-center justify-between">
                    <span>Role:</span>
                    <span className="font-medium text-foreground capitalize">
                      {bot.operationalRole?.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Credentials:</span>
                    <span className="font-mono text-[11px] text-foreground bg-secondary px-2 py-0.5 rounded">
                      v{bot.credential?.version || 1} • {bot.credential?.maskedToken || '••••••••'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Guilds linked:</span>
                    <span className="font-medium text-foreground">{bot.guilds?.length || 0} servers</span>
                  </div>
                </div>

                {/* Tags */}
                {bot.tags && bot.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {bot.tags.map((t: string) => (
                      <span key={t} className="text-[10px] bg-secondary/80 text-muted-foreground px-2 py-0.5 rounded">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="mt-5 pt-3 border-t border-border flex items-center justify-between">
                <button
                  onClick={() => handleHealthCheck(bot.id)}
                  title="Run Ping / Health Check"
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition flex items-center gap-1 text-xs"
                >
                  <Activity className="w-3.5 h-3.5 text-primary" />
                  <span>Check</span>
                </button>

                <button
                  onClick={() => router.push(`/bots/${bot.id}`)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground border border-border transition"
                >
                  Configure
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* REGISTER BOT MODAL (SINGLE OR BULK) */}
      {isRegisterOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-lg w-full p-6 relative my-8">
            <button
              onClick={() => {
                setIsRegisterOpen(false);
                setBulkResult(null);
              }}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Header & Tabs */}
            <div className="mb-5 space-y-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-foreground">Register Official Discord Bots</h2>
                  <p className="text-xs text-muted-foreground">Tokens are encrypted at rest with AES-256-GCM.</p>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex items-center space-x-1 bg-secondary/60 p-1 rounded-lg border border-border">
                <button
                  type="button"
                  onClick={() => {
                    setRegisterMode('single');
                    setFormError(null);
                  }}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition ${
                    registerMode === 'single'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Single Bot (Auto-Detect App ID)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRegisterMode('bulk');
                    setFormError(null);
                  }}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition ${
                    registerMode === 'bulk'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Bulk Add Tokens
                </button>
              </div>
            </div>

            {formError && (
              <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-xs text-destructive flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* SINGLE BOT TAB */}
            {registerMode === 'single' && (
              <form onSubmit={handleRegisterSingleBot} className="space-y-4 text-xs">
                {/* Token Input is First */}
                <div>
                  <label className="block font-medium text-foreground mb-1">
                    Discord Bot Token (Secret) <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Paste bot token here (Application ID will auto-detect)..."
                    value={formData.botToken}
                    onChange={(e) => handleTokenChange(e.target.value)}
                    className="w-full bg-secondary/60 border border-border rounded-lg px-3 py-2 text-foreground font-mono outline-none focus:border-primary"
                  />
                  <span className="text-[11px] text-muted-foreground mt-0.5 block">
                    Pasting your token will instantly collect the Application ID and verify identity with Discord.
                  </span>
                </div>

                {/* Auto-resolved feedback card */}
                {tokenResolvedBot && (
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center space-x-3 text-xs">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    <div>
                      <div className="font-bold text-foreground">
                        Verified Discord Bot: <span className="text-emerald-400">{tokenResolvedBot.username}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono">
                        Auto-collected Application ID: {tokenResolvedBot.applicationId}
                      </div>
                    </div>
                  </div>
                )}

                {/* Discord Application ID (Auto-populated or optional) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-medium text-foreground">
                      Discord Application ID <span className="text-muted-foreground font-normal">(Auto-collected from token)</span>
                    </label>
                    {isResolvingToken && (
                      <span className="text-[10px] text-primary flex items-center gap-1 animate-pulse">
                        <Sparkles className="w-3 h-3" /> Auto-detecting...
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="Auto-detected from token, or enter manually..."
                    value={formData.applicationId}
                    onChange={(e) => setFormData({ ...formData, applicationId: e.target.value })}
                    className="w-full bg-secondary/60 border border-border rounded-lg px-3 py-2 text-foreground font-mono outline-none focus:border-primary"
                  />
                </div>

                {/* Friendly Bot Name (Optional, auto-defaults to Discord username) */}
                <div>
                  <label className="block font-medium text-foreground mb-1">
                    Friendly Bot Name <span className="text-muted-foreground font-normal">(Optional, defaults to Discord name)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Studio Alpha Voice Bot"
                    value={formData.displayName}
                    onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                    className="w-full bg-secondary/60 border border-border rounded-lg px-3 py-2 text-foreground outline-none focus:border-primary"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-foreground mb-1">Operational Role</label>
                    <select
                      value={formData.operationalRole}
                      onChange={(e) => setFormData({ ...formData, operationalRole: e.target.value })}
                      className="w-full bg-secondary/60 border border-border rounded-lg px-3 py-2 text-foreground outline-none"
                    >
                      <option value="voice_operator">Voice Operator</option>
                      <option value="announcer">Announcer</option>
                      <option value="test_runner">Test Runner</option>
                      <option value="general_operator">General Fleet Bot</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-foreground mb-1">Tags (Comma-separated)</label>
                    <input
                      type="text"
                      value={formData.tags}
                      onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                      className="w-full bg-secondary/60 border border-border rounded-lg px-3 py-2 text-foreground outline-none"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-border flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsRegisterOpen(false)}
                    className="px-4 py-2 rounded-lg bg-secondary text-foreground hover:bg-secondary/80 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !formData.botToken}
                    className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-50"
                  >
                    {isSubmitting ? 'Verifying with Discord...' : 'Verify & Save Bot'}
                  </button>
                </div>
              </form>
            )}

            {/* BULK ADD BOTS TAB */}
            {registerMode === 'bulk' && (
              <form onSubmit={handleRegisterBulkBots} className="space-y-4 text-xs">
                {bulkResult ? (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-1">
                      <div className="text-sm font-bold text-foreground flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>Bulk Import Completed</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        <strong className="text-emerald-400">{bulkResult.successful}</strong> bots successfully verified &amp; registered.
                        {bulkResult.failed > 0 && (
                          <span className="text-destructive ml-2">
                            ({bulkResult.failed} failed)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Successfully Added Bots List */}
                    {bulkResult.addedBots.length > 0 && (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto p-2 bg-secondary/40 rounded-lg border border-border">
                        <span className="font-semibold text-foreground text-[11px]">Registered Bots:</span>
                        {bulkResult.addedBots.map((b) => (
                          <div key={b.id} className="p-2 rounded bg-card flex items-center justify-between text-xs">
                            <span className="font-medium text-foreground">{b.displayName}</span>
                            <span className="font-mono text-muted-foreground text-[11px]">{b.applicationId}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Errors List */}
                    {bulkResult.errors.length > 0 && (
                      <div className="space-y-1.5 max-h-36 overflow-y-auto p-2 bg-destructive/10 rounded-lg border border-destructive/20 text-destructive text-[11px]">
                        <span className="font-semibold">Failed Tokens:</span>
                        {bulkResult.errors.map((err, idx) => (
                          <div key={idx}>
                            Token #{err.tokenIndex} ({err.maskedToken}): {err.error}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="pt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setIsRegisterOpen(false);
                          setBulkResult(null);
                          setBulkTokensInput('');
                        }}
                        className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="font-medium text-foreground">
                          Paste Discord Bot Tokens (One Per Line)
                        </label>
                        <span className="text-primary font-mono text-[11px] font-semibold">
                          {parsedBulkTokenCount} token{parsedBulkTokenCount === 1 ? '' : 's'} detected
                        </span>
                      </div>
                      <textarea
                        rows={6}
                        required
                        placeholder={`Paste multiple bot tokens here (one per line)...\nOTk0MDAwMDAwMDAwMDAwMDAx.Gz...xyz\nOTk0MDAwMDAwMDAwMDAwMDAy.Gx...abc`}
                        value={bulkTokensInput}
                        onChange={(e) => setBulkTokensInput(e.target.value)}
                        className="w-full bg-secondary/60 border border-border rounded-lg p-3 text-foreground font-mono outline-none focus:border-primary resize-none text-xs"
                      />
                      <span className="text-[11px] text-muted-foreground">
                        Each token will be independently verified against Discord, auto-collecting its Application ID and bot username.
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block font-medium text-foreground mb-1">Operational Role</label>
                        <select
                          value={bulkRole}
                          onChange={(e) => setBulkRole(e.target.value)}
                          className="w-full bg-secondary/60 border border-border rounded-lg px-3 py-2 text-foreground outline-none"
                        >
                          <option value="voice_operator">Voice Operator</option>
                          <option value="announcer">Announcer</option>
                          <option value="test_runner">Test Runner</option>
                          <option value="general_operator">General Fleet Bot</option>
                        </select>
                      </div>

                      <div>
                        <label className="block font-medium text-foreground mb-1">Tags</label>
                        <input
                          type="text"
                          value={bulkTags}
                          onChange={(e) => setBulkTags(e.target.value)}
                          className="w-full bg-secondary/60 border border-border rounded-lg px-3 py-2 text-foreground outline-none"
                        />
                      </div>
                    </div>

                    <div className="pt-4 border-t border-border flex justify-end space-x-2">
                      <button
                        type="button"
                        onClick={() => setIsRegisterOpen(false)}
                        className="px-4 py-2 rounded-lg bg-secondary text-foreground hover:bg-secondary/80 font-medium"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmitting || parsedBulkTokenCount === 0}
                        className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-50"
                      >
                        {isSubmitting
                          ? `Verifying & Importing ${parsedBulkTokenCount} Bots...`
                          : `Import & Verify All (${parsedBulkTokenCount})`}
                      </button>
                    </div>
                  </>
                )}
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function BotFleetPage() {
  return (
    <Suspense fallback={<div className="p-8 text-xs text-muted-foreground animate-pulse">Loading bot fleet...</div>}>
      <BotFleetContent />
    </Suspense>
  );
}
